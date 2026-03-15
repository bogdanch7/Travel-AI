import OpenAI from 'openai';
import { getEnv } from '../../config/env';

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const env = getEnv();
  const logger = require('../../utils/logger').getLogger();

  if (!env.OPENAI_API_KEY) {
    logger.error('❌ OPENAI_API_KEY is missing. AI features will not work.');
    process.exit(1);
  }

  const mode = env.OPENAI_BASE_URL ? 'custom-openai-compatible' : 'default-openai';
  logger.info({ mode, baseUrl: env.OPENAI_BASE_URL }, '🤖 Initializing AI client');

  openaiClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  return openaiClient;
}

/**
 * Call OpenAI Responses API (chat completions with tools).
 */
export async function callOpenAI(params: {
  model?: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  toolChoice?: 'auto' | 'none' | 'required';
  maxTokens?: number;
  temperature?: number;
}): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const env = getEnv();
  const client = getOpenAIClient();

  return client.chat.completions.create({
    model: params.model ?? env.OPENAI_MODEL,
    messages: params.messages,
    tools: params.tools,
    tool_choice: params.toolChoice ?? 'auto',
    max_tokens: params.maxTokens ?? 2048,
    temperature: params.temperature ?? 0.7,
  });
}

/**
 * Call OpenAI with vision (image analysis).
 */
export async function callOpenAIVision(params: {
  systemPrompt: string;
  imageContent: string; // base64 data URI or URL
  userText?: string;
  maxTokens?: number;
}): Promise<string> {
  const env = getEnv();
  const client = getOpenAIClient();

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'image_url',
      image_url: { url: params.imageContent, detail: 'high' },
    },
  ];

  if (params.userText) {
    userContent.unshift({ type: 'text', text: params.userText });
  }

  const response = await client.chat.completions.create({
    model: env.OPENAI_VISION_MODEL,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: params.maxTokens ?? 1500,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content ?? '';
}
