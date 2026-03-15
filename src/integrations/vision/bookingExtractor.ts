import { BookingExtraction } from '../../types/app';
import { analyzeImage, parseVisionJsonResponse } from './imageAnalyzer';
import { BOOKING_EXTRACTION_PROMPT } from './prompts';
import { getLogger } from '../../utils/logger';

/**
 * Extract booking details from a screenshot image.
 *
 * Returns structured booking data with confidence level.
 * If the image is unclear or not a booking, confidence will be "low".
 */
export async function extractBookingFromImage(imageContent: string): Promise<BookingExtraction> {
  const logger = getLogger();

  try {
    const rawResult = await analyzeImage({
      imageContent,
      systemPrompt: BOOKING_EXTRACTION_PROMPT,
      userText: 'Please extract the booking details from this screenshot.',
    });

    const parsed = parseVisionJsonResponse<RawBookingExtraction>(rawResult);

    const extraction: BookingExtraction = {
      travelType: parsed.travel_type ?? 'unknown',
      origin: parsed.origin ?? undefined,
      destination: parsed.destination ?? undefined,
      departureDate: parsed.departure_date ?? undefined,
      returnDate: parsed.return_date ?? undefined,
      airline: parsed.airline ?? undefined,
      hotelName: parsed.hotel_name ?? undefined,
      city: parsed.city ?? undefined,
      totalPrice: parsed.total_price ?? undefined,
      currency: parsed.currency ?? undefined,
      passengerCount: parsed.passenger_count ?? undefined,
      confidence: parsed.confidence ?? 'low',
      notes: parsed.notes ?? undefined,
    };

    logger.info(
      { confidence: extraction.confidence, travelType: extraction.travelType },
      'Booking extraction complete',
    );

    return extraction;
  } catch (err) {
    logger.error({ err }, 'Booking extraction failed');
    return {
      travelType: 'unknown',
      confidence: 'low',
      notes: 'Failed to extract booking details from the image. The image may be unclear or not a booking screenshot.',
    };
  }
}

interface RawBookingExtraction {
  travel_type?: 'flight' | 'hotel' | 'package' | 'unknown';
  origin?: string | null;
  destination?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  airline?: string | null;
  hotel_name?: string | null;
  city?: string | null;
  total_price?: number | null;
  currency?: string | null;
  passenger_count?: number | null;
  confidence?: 'high' | 'medium' | 'low';
  notes?: string | null;
}
