import { callOpenAIVision } from '../openai/client';
import { getLogger } from '../../utils/logger';

/**
 * Analyze an image using OpenAI Vision API.
 * Returns the raw text response from the model.
 */
export async function analyzeImage(params: {
  imageContent: string; // base64 data URI
  systemPrompt: string;
  userText?: string;
}): Promise<string> {
  const logger = getLogger();

  try {
    const result = await callOpenAIVision({
      systemPrompt: params.systemPrompt,
      imageContent: params.imageContent,
      userText: params.userText,
    });

    logger.debug({ resultLength: result.length }, 'Image analysis complete');
    return result;
  } catch (err) {
    logger.error({ err }, 'Image analysis failed');
    throw new Error('Failed to analyze image. Please try again.');
  }
}

/**
 * Parse a JSON response from vision analysis, handling potential markdown code blocks.
 */
export function parseVisionJsonResponse<T>(raw: string): T {
  // Strip markdown code block wrapper if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  return JSON.parse(cleaned) as T;
}
