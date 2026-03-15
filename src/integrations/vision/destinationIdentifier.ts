import { DestinationResult } from '../../types/app';
import { analyzeImage, parseVisionJsonResponse } from './imageAnalyzer';
import { DESTINATION_IDENTIFICATION_PROMPT } from './prompts';
import { getLogger } from '../../utils/logger';

/**
 * Identify the travel destination shown in a photo.
 *
 * Returns a structured result with confidence and alternates.
 */
export async function identifyDestinationFromImage(imageContent: string): Promise<DestinationResult> {
  const logger = getLogger();

  try {
    const rawResult = await analyzeImage({
      imageContent,
      systemPrompt: DESTINATION_IDENTIFICATION_PROMPT,
      userText: 'What travel destination is shown in this image?',
    });

    const parsed = parseVisionJsonResponse<RawDestinationResult>(rawResult);

    const result: DestinationResult = {
      likelyDestinationName: parsed.likely_destination_name ?? 'Unknown',
      country: parsed.country ?? 'Unknown',
      airportCodeIfKnown: parsed.airport_code_if_known ?? undefined,
      confidence: parsed.confidence ?? 'low',
      alternates: (parsed.alternates ?? []).map((alt) => ({
        name: alt.name,
        country: alt.country,
        airportCode: alt.airport_code ?? undefined,
      })),
      rationale: parsed.rationale ?? 'Could not determine destination',
    };

    logger.info(
      {
        destination: result.likelyDestinationName,
        confidence: result.confidence,
      },
      'Destination identification complete',
    );

    return result;
  } catch (err) {
    logger.error({ err }, 'Destination identification failed');
    return {
      likelyDestinationName: 'Unknown',
      country: 'Unknown',
      confidence: 'low',
      alternates: [],
      rationale: 'Failed to identify the destination from the image. The image may be unclear.',
    };
  }
}

interface RawDestinationResult {
  likely_destination_name?: string;
  country?: string;
  airport_code_if_known?: string | null;
  confidence?: 'high' | 'medium' | 'low';
  alternates?: Array<{
    name: string;
    country: string;
    airport_code?: string | null;
  }>;
  rationale?: string;
}
