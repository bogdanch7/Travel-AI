import { v4 as uuidv4 } from 'uuid';
import { WhatsAppMessage } from '../../types/app';
import { parseWebhookPayload } from './parser';
import { evaluateGroupPolicy, recordBotResponse } from './groupPolicy';
import { sendTextMessage, markAsRead, getMediaUrl, downloadMediaAsBase64 } from './sender';
import { handleMessage } from '../../agent/orchestrator';
import { createRequestLogger } from '../../utils/logger';

/**
 * Process an incoming WhatsApp webhook payload.
 * This is the main entry point from the webhook route.
 */
export async function processWebhook(body: unknown, preParsedMessages?: WhatsAppMessage[]): Promise<void> {
  const messages = preParsedMessages ?? parseWebhookPayload(body);

  for (const message of messages) {
    const correlationId = uuidv4();
    const logger = createRequestLogger(correlationId, {
      chatId: message.chatId,
      senderId: message.senderId,
      isGroup: message.isGroup,
      chatType: message.chatType,
    });

    logger.info({ text: message.text?.slice(0, 80) }, 'Incoming message');

    try {
      // Mark as read immediately
      await markAsRead(message.messageId).catch(() => {});

      // Apply mention / group trigger policy
      const policy = evaluateGroupPolicy(message);
      if (!policy.shouldRespond) {
        logger.debug({ reason: policy.reason, ignoreReason: policy.ignoreReason }, 'Skipping message (trigger policy)');
        continue;
      }

      // If there's a cleaned text from group policy, use that
      if (policy.cleanedText !== undefined) {
        message.text = policy.cleanedText;
      }

      // If there's an image, download it
      if (message.imageId) {
        try {
          const mediaUrl = await getMediaUrl(message.imageId);
          message.imageUrl = mediaUrl;

          // Download as base64 for OpenAI vision
          const base64 = await downloadMediaAsBase64(mediaUrl);
          message.imageUrl = `data:${message.imageMimeType ?? 'image/jpeg'};base64,${base64}`;
        } catch (err) {
          logger.error({ err }, 'Failed to download image');
          await sendTextMessage(
            message.chatId,
            "⚠️ I couldn't process your image. Could you try sending it again?",
          );
          continue;
        }
      }

      // Process through the agent orchestrator — pass group policy metadata
      logger.info({ hasImage: !!message.imageUrl, trigger: policy.reason }, 'Processing message');

      // 60s overall timeout to prevent infinite hangs
      const PROCESSING_TIMEOUT_MS = 60_000;
      const result = await Promise.race([
        handleMessage(message, correlationId, message.isGroup ? {
          triggerReason: policy.reason,
          confidence: policy.confidence,
        } : undefined),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Processing timed out after 60s')), PROCESSING_TIMEOUT_MS)
        ),
      ]);

      // Send the response
      if (result.response) {
        await sendTextMessage(message.chatId, result.response);
        logger.info({ responseLength: result.response.length }, 'Response sent');
        // Record bot response timestamp for cooldown tracking
        if (message.isGroup) {
          recordBotResponse(message.chatId);
        }
      }

      logger.info(
        { intent: result.intent, toolsUsed: result.toolsUsed },
        'Message processed successfully',
      );
    } catch (err) {
      logger.error({ err }, 'Error processing webhook message');
      try {
        await sendTextMessage(
          message.chatId,
          "⚠️ Something went wrong on my end. Please try again in a moment.",
        );
      } catch {
        // Can't even send the error message — nothing more to do
      }
    }
  }
}
