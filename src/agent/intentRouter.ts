import { Intent, WhatsAppMessage } from '../types/app';

/**
 * Quick intent classifier to determine what to do with a message.
 *
 * The OpenAI model will also classify via tool usage, but this pre-classifier
 * helps with logging, routing, and group policy decisions.
 */
export function classifyIntent(message: WhatsAppMessage): Intent {
  const text = (message.text ?? '').toLowerCase().trim();
  const hasImage = !!message.imageId || !!message.imageUrl;

  // Image-based intents
  if (hasImage) {
    // Check if the text hints at booking check
    const bookingKeywords = ['check', 'price', 'deal', 'booking', 'reservation', 'good deal', 'worth', 'compare'];
    if (bookingKeywords.some((kw) => text.includes(kw))) {
      return 'trip_check';
    }

    // Check if it's asking about a destination
    const destKeywords = ['where', 'destination', 'place', 'fly', 'travel to', 'location'];
    if (destKeywords.some((kw) => text.includes(kw))) {
      return 'destination_id';
    }

    // Image without clear intent — try destination ID first (more likely for travel images)
    // The model will decide between booking extraction and destination identification
    return text.length > 0 ? 'trip_check' : 'destination_id';
  }

  // Text-only intents
  if (!text) return 'unsupported';

  // Flight pricing keywords
  const flightKeywords = ['flight', 'fly', 'flights to', 'price', 'how much', 'cost', 'cheap flights', 'vola', 'ticket'];
  if (flightKeywords.some((kw) => text.includes(kw))) {
    return 'flight_pricing';
  }

  // Trip planning keywords
  const tripKeywords = ['trip', 'travel', 'vacation', 'holiday', 'weekend', 'getaway', 'itinerary', 'plan', 'suggest', 'recommend', 'destination', 'warm', 'beach', 'city break', 'nights'];
  if (tripKeywords.some((kw) => text.includes(kw))) {
    return 'trip_planning';
  }

  // Greetings and small talk
  const smallTalkPatterns = [/^(hi|hello|hey|salut|buna|good morning|good evening|thanks|thank you|ok|sure|great|cool|bye|goodbye)/i];
  if (smallTalkPatterns.some((p) => p.test(text))) {
    return 'small_talk';
  }

  // If text is short and doesn't match anything specific, treat as small_talk
  if (text.length < 15) {
    return 'small_talk';
  }

  // Default to trip_planning for longer travel-related messages
  return 'trip_planning';
}
