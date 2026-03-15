import OpenAI from 'openai';
import { WhatsAppMessage, OrchestratorResult, FlightSearchParams, TripContext } from '../types/app';
import { callOpenAI } from '../integrations/openai/client';
import { agentTools } from '../integrations/openai/tools';
import { buildSystemPrompt } from './systemPrompt';
import { classifyIntent } from './intentRouter';
import { loadContext, saveTurn, updateContext, getContext, upsertUserPreference } from './contextManager';
import { formatFlightResults, formatBookingExtraction, formatBookingVerdict, formatDestinationResult, formatGroupResponse } from './responseFormatter';
import { searchFlights } from '../integrations/vola/searchFlights';
import { FlightSearchInput, NormalizedFlightOffer } from '../integrations/vola/types';
import { FlightResult } from '../types/app';
import { extractBookingFromImage } from '../integrations/vision/bookingExtractor';
import { identifyDestinationFromImage } from '../integrations/vision/destinationIdentifier';
import { logAuditEntry } from '../store/repositories/auditRepo';
import { createRequestLogger } from '../utils/logger';
import { getEnv } from '../config/env';
import {
  searchFlightsArgsSchema,
  updateTripContextArgsSchema,
  analyzeBookingImageArgsSchema,
  identifyDestinationArgsSchema,
  updateUserPreferenceArgsSchema,
} from './schemas';
import type { TriggerReason } from '../integrations/whatsapp/groupPolicy';

const MAX_TOOL_ROUNDS = 5;

/**
 * Main orchestrator: processes a WhatsApp message through the full pipeline.
 *
 * Flow:
 * 1. Classify intent (pre-classification for logging)
 * 2. Load conversation context
 * 3. Call OpenAI with tools
 * 4. Execute tool calls in a loop
 * 5. Format and return response
 */
export async function handleMessage(
  message: WhatsAppMessage,
  correlationId: string,
  groupPolicyMeta?: { triggerReason: TriggerReason | 'ignored'; confidence: number },
): Promise<OrchestratorResult> {
  const env = getEnv();
  const logger = createRequestLogger(correlationId, { chatId: message.chatId });
  const toolsUsed: string[] = [];

  // 1. Pre-classify intent
  const preIntent = classifyIntent(message);
  logger.info({ preIntent, hasImage: !!message.imageUrl }, 'Intent pre-classified');

  // 2. Load context
  const { openaiMessages } = await loadContext(message);

  // 3. Build system prompt — include trigger metadata for groups
  const systemPrompt = buildSystemPrompt({
    isGroup: message.isGroup,
    botName: env.WHATSAPP_BOT_NAME,
    chatId: message.chatId,
    senderName: message.senderName,
    triggerReason: groupPolicyMeta?.triggerReason,
    triggerConfidence: groupPolicyMeta?.confidence,
  });

  // 4. Build the user message
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

  // In groups, prefix with sender name so the model knows who is speaking
  const effectiveText = message.isGroup && message.text
    ? `[${message.senderName}]: ${message.text}`
    : message.text;

  if (effectiveText) {
    userContent.push({ type: 'text', text: effectiveText });
  }

  if (message.imageUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: message.imageUrl, detail: 'high' },
    });

    // Add helpful hint about the image based on pre-classified intent
    if (preIntent === 'trip_check') {
      userContent.push({
        type: 'text',
        text: 'The user sent an image that appears to be a booking screenshot. Use the analyze_booking_image tool to extract details.',
      });
    } else if (preIntent === 'destination_id') {
      userContent.push({
        type: 'text',
        text: 'The user sent a travel photo. Use the identify_destination_from_image tool to identify the destination.',
      });
    }
  }

  // Store the user message (with sender attribution for groups)
  const userMessageText = effectiveText ?? (message.imageUrl ? '[image]' : '[empty]');
  await saveTurn(message.chatId, 'user', userMessageText, preIntent);

  // Build messages array for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...openaiMessages,
    { role: 'user', content: userContent.length === 1 ? (userContent[0] as { type: 'text'; text: string }).text : userContent },
  ];

  // 5. Call OpenAI in a tool-execution loop
  let response: string = '';

  try {
    response = await runAgentLoop(messages, message, correlationId, toolsUsed, logger);
  } catch (err) {
    logger.error({ err }, 'Agent loop failed');
    response = "⚠️ I ran into an issue processing your message. Please try again.";
  }

  // 6. Format for group if needed
  if (message.isGroup) {
    response = formatGroupResponse(response);
  }

  // 7. Save assistant turn
  await saveTurn(message.chatId, 'assistant', response, preIntent, toolsUsed);

  // 8. Log audit
  await logAuditEntry({
    correlationId,
    chatId: message.chatId,
    userId: message.senderId,
    intent: preIntent,
    timestamp: Date.now(),
  }).catch((err) => logger.warn({ err }, 'Failed to log audit entry'));

  return { response, intent: preIntent, toolsUsed };
}

/**
 * Run the OpenAI agent loop, executing tools as requested by the model.
 */
async function runAgentLoop(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  originalMessage: WhatsAppMessage,
  correlationId: string,
  toolsUsed: string[],
  logger: ReturnType<typeof createRequestLogger>,
): Promise<string> {
  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    const completion = await callOpenAI({
      messages,
      tools: agentTools,
      toolChoice: round === 1 ? 'auto' : 'auto',
    });

    const choice = completion.choices[0];
    if (!choice) {
      return "I couldn't generate a response. Please try again.";
    }

    const assistantMessage = choice.message;

    // If no tool calls, return the text response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return assistantMessage.content ?? "I'm not sure how to respond to that.";
    }

    // Add the assistant message (with tool calls) to the conversation
    messages.push(assistantMessage);

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      toolsUsed.push(toolName);

      logger.info({ toolName, toolArgs: Object.keys(toolArgs) }, `Executing tool: ${toolName}`);
      const startTime = Date.now();

      let toolResult: string;

      try {
        toolResult = await executeTool(toolName, toolArgs, originalMessage);
      } catch (err) {
        logger.error({ err, toolName }, 'Tool execution failed');
        toolResult = JSON.stringify({ error: `Tool ${toolName} failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
      }

      const latencyMs = Date.now() - startTime;
      logger.info({ toolName, latencyMs, resultLength: toolResult.length }, 'Tool executed');

      // Log audit for tool usage
      await logAuditEntry({
        correlationId,
        chatId: originalMessage.chatId,
        userId: originalMessage.senderId,
        intent: 'trip_planning', // Will be refined
        toolName,
        toolArgs,
        toolLatencyMs: latencyMs,
        timestamp: Date.now(),
      }).catch(() => {});

      // Add tool result to messages
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  return "I'm taking too long to process this. Please try a simpler request.";
}

/**
 * Execute a single tool and return the result as a string.
 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  message: WhatsAppMessage,
): Promise<string> {
  switch (toolName) {
    case 'get_trip_context': {
      const chatId = (args.chatId as string) || message.chatId;
      const ctx = await getContext(chatId);
      return JSON.stringify(ctx ?? { chatId, message: 'No trip context found. Start planning!' });
    }

    case 'update_trip_context': {
      const parsed = updateTripContextArgsSchema.parse(args);
      const chatId = parsed.chatId || message.chatId;
      const { chatId: _, ...patch } = parsed;
      const updated = await updateContext(chatId, patch as Partial<TripContext>);
      return JSON.stringify({ success: true, context: updated });
    }

    case 'update_user_preference': {
      const parsed = updateUserPreferenceArgsSchema.parse(args);
      const chatId = parsed.chatId || message.chatId;
      const userId = parsed.userId || message.senderId;
      const userName = parsed.userName || message.senderName;
      const { chatId: _cid, userId: _uid, userName: _un, ...patch } = parsed;
      const updated = await upsertUserPreference(chatId, userId, userName, patch);
      return JSON.stringify({ success: true, context: updated });
    }

    case 'search_flights': {
      const parsed = searchFlightsArgsSchema.parse(args);
      const input: FlightSearchInput = {
        origin: parsed.origin,
        destination: parsed.destination,
        departDate: parsed.departureDate,
        returnDate: parsed.returnDate,
        adults: parsed.passengers || 1,
      };

      const volaResults = await searchFlights(input);
      const results = volaResults.map(mapToFlightResult);

      return JSON.stringify({
        resultCount: results.length,
        flights: results.slice(0, 5),
        formatted: formatFlightResults(results),
      });
    }

    case 'analyze_booking_image': {
      const parsed = analyzeBookingImageArgsSchema.parse(args);
      // Use the image from the original message if available
      const imageUrl = parsed.imageUrl || message.imageUrl;
      if (!imageUrl) {
        return JSON.stringify({ error: 'No image provided for booking analysis' });
      }

      const extraction = await extractBookingFromImage(imageUrl);

      // If it's a flight booking, try to compare with live prices
      let verdict = '';
      if (extraction.travelType === 'flight' && extraction.origin && extraction.destination && extraction.departureDate) {
        try {
          const volaResults = await searchFlights({
            origin: extraction.origin,
            destination: extraction.destination,
            departDate: extraction.departureDate,
            returnDate: extraction.returnDate,
            adults: extraction.passengerCount || 1,
          });
          const liveFlights = volaResults.map(mapToFlightResult);
          verdict = formatBookingVerdict(extraction, liveFlights);
        } catch {
          verdict = 'Could not compare with live prices at this time.';
        }
      }

      return JSON.stringify({
        extraction,
        formatted: formatBookingExtraction(extraction),
        verdict,
      });
    }

    case 'identify_destination_from_image': {
      const parsed = identifyDestinationArgsSchema.parse(args);
      const imageUrl = parsed.imageUrl || message.imageUrl;
      if (!imageUrl) {
        return JSON.stringify({ error: 'No image provided for destination identification' });
      }

      const result = await identifyDestinationFromImage(imageUrl);
      return JSON.stringify({
        destination: result,
        formatted: formatDestinationResult(result),
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

/**
 * Bridge helper to map NormalizedFlightOffer (Vola-internal) to FlightResult (App-level).
 */
function mapToFlightResult(offer: NormalizedFlightOffer): FlightResult {
  return {
    origin: offer.origin,
    destination: offer.destination,
    departDate: offer.departDate,
    returnDate: offer.returnDate,
    priceAmount: offer.priceAmount,
    currency: offer.currency,
    airline: offer.airline || 'Unknown',
    stops: offer.stops || 0,
    baggageIncluded: offer.baggageIncluded || false,
    deeplinkOrReference: offer.deeplinkOrReference || '',
    notes: offer.notes,
  };
}
