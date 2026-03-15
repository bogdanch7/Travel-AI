import { FlightResult, BookingExtraction, DestinationResult, GroupOption } from '../types/app';
import { formatPrice } from '../utils/text';
import { formatDateForWhatsApp } from '../utils/time';
import { getAirlineName } from '../utils/airlineUtils';


/**
 * Format flight results for WhatsApp display.
 */
export function formatFlightResults(flights: FlightResult[], maxResults: number = 3): string {
  if (flights.length === 0) {
    return "Nu am găsit zboruri pentru acest traseu. Încearcă alte date sau verifică direct pe vola.ro.";
  }

  // Check if data is unavailable
  if (flights.length === 1 && flights[0].notes?.includes('LIVE_DATA_UNAVAILABLE')) {
    return `⚠️ Nu am putut obține prețuri live în acest moment. Poți verifica prețurile actuale direct aici:\n🔗 ${flights[0].deeplinkOrReference}`;
  }

  const top = flights.slice(0, maxResults);
  const lines: string[] = ['✈️ *Opțiuni de zbor găsite:*\n'];

  for (let i = 0; i < top.length; i++) {
    const f = top[i];
    const num = i + 1;
    const airlineName = getAirlineName(f.airline);
    lines.push(`${num}. *${airlineName}* — ${formatPrice(f.priceAmount, f.currency)}`);
    lines.push(`   ${f.origin} → ${f.destination}`);
    lines.push(`   📅 ${formatDateForWhatsApp(f.departDate)}${f.returnDate ? ` → ${formatDateForWhatsApp(f.returnDate)}` : ' (dus)'}`);

    const details: string[] = [];
    if (f.stops === 0) details.push('Direct');
    else if (f.stops > 0) details.push(`${f.stops} escală${f.stops > 1 ? 'e' : ''}`);
    if (f.baggageIncluded) details.push('✅ Bagaj inclus');
    if (details.length) lines.push(`   ${details.join(' • ')}`);
    lines.push('');
  }

  if (flights.length > maxResults) {
    lines.push(`📊 Încă ${flights.length - maxResults} opțiuni disponibile`);
  }

  if (top[0]?.deeplinkOrReference) {
    lines.push(`\n🔗 Rezervă aici: ${top[0].deeplinkOrReference}`);
  }

  return lines.join('\n');
}


/**
 * Format a booking extraction result for WhatsApp.
 */
export function formatBookingExtraction(booking: BookingExtraction): string {
  const lines: string[] = ['📋 *Booking details extracted:*\n'];
  const confidenceEmoji = booking.confidence === 'high' ? '✅' : booking.confidence === 'medium' ? '⚠️' : '❓';

  lines.push(`${confidenceEmoji} Confidence: ${booking.confidence}`);
  lines.push(`Type: ${booking.travelType}`);

  if (booking.origin && booking.destination) {
    lines.push(`Route: ${booking.origin} → ${booking.destination}`);
  }
  if (booking.airline) lines.push(`Airline: ${booking.airline}`);
  if (booking.hotelName) lines.push(`Hotel: ${booking.hotelName}`);
  if (booking.departureDate) lines.push(`📅 Depart: ${formatDateForWhatsApp(booking.departureDate)}`);
  if (booking.returnDate) lines.push(`📅 Return: ${formatDateForWhatsApp(booking.returnDate)}`);
  if (booking.totalPrice && booking.currency) {
    lines.push(`💰 Price: ${formatPrice(booking.totalPrice, booking.currency)}`);
  }
  if (booking.passengerCount) lines.push(`👥 Passengers: ${booking.passengerCount}`);
  if (booking.notes) lines.push(`\n📝 ${booking.notes}`);

  return lines.join('\n');
}

/**
 * Format a booking comparison verdict for WhatsApp.
 */
export function formatBookingVerdict(
  booking: BookingExtraction,
  liveFlights: FlightResult[],
): string {
  if (liveFlights.length === 0 || liveFlights[0].notes?.includes('LIVE_DATA_UNAVAILABLE')) {
    return "I extracted your booking details but couldn't compare with live prices right now. Check vola.ro directly for current rates.";
  }

  if (!booking.totalPrice || booking.totalPrice === 0) {
    return "I couldn't determine the price in your booking screenshot to compare.";
  }

  const cheapest = liveFlights[0];
  const bookingPrice = booking.totalPrice;
  const livePrice = cheapest.priceAmount;

  let verdict: string;
  const diff = bookingPrice - livePrice;
  const pctDiff = Math.round((diff / bookingPrice) * 100);

  if (diff > 10) {
    verdict = `💡 *Better deal found!*\nYour booking: ${formatPrice(bookingPrice, booking.currency ?? 'EUR')}\nBest on vola.ro: ${formatPrice(livePrice, cheapest.currency)}\n\nYou could save ~${formatPrice(Math.abs(diff), cheapest.currency)} (${Math.abs(pctDiff)}% less)`;
  } else if (diff < -10) {
    verdict = `✅ *Good deal!*\nYour price (${formatPrice(bookingPrice, booking.currency ?? 'EUR')}) is already ${Math.abs(pctDiff)}% below the current vola.ro rate (${formatPrice(livePrice, cheapest.currency)}).`;
  } else {
    verdict = `👍 *Fair price*\nYour booking (${formatPrice(bookingPrice, booking.currency ?? 'EUR')}) is in line with current market rates on vola.ro (${formatPrice(livePrice, cheapest.currency)}).`;
  }

  return verdict;
}

/**
 * Format a destination identification result for WhatsApp.
 */
export function formatDestinationResult(dest: DestinationResult): string {
  const lines: string[] = [];
  const confidenceEmoji = dest.confidence === 'high' ? '✅' : dest.confidence === 'medium' ? '🤔' : '❓';

  lines.push(`🌍 ${confidenceEmoji} This looks like *${dest.likelyDestinationName}*, ${dest.country}!`);
  lines.push(`\n${dest.rationale}`);

  if (dest.confidence !== 'high' && dest.alternates.length > 0) {
    lines.push('\nOther possibilities:');
    for (const alt of dest.alternates.slice(0, 3)) {
      lines.push(`• ${alt.name}, ${alt.country}`);
    }
  }

  if (dest.airportCodeIfKnown) {
    lines.push(`\n✈️ Nearest airport: ${dest.airportCodeIfKnown}`);
  }

  return lines.join('\n');
}

// ─── Group-Specific Formatters ───────────────────────────────────────

/**
 * Format GroupOption[] into a WhatsApp-friendly text block.
 * Used when the context manager has pre-generated options from conflicts.
 */
export function formatGroupOptions(options: GroupOption[]): string {
  if (options.length === 0) return '';

  const emojis = ['1️⃣', '2️⃣', '3️⃣'];
  const lines: string[] = [];

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const emoji = emojis[i] ?? `${i + 1}.`;
    const budgetSuffix = opt.estimatedBudget ? ` [~${opt.estimatedBudget}]` : '';
    lines.push(`${emoji} ${opt.label}: ${opt.description}${budgetSuffix}`);
  }

  lines.push('');
  lines.push('Which works for everyone? Reply with 1, 2, or 3 ✈️');

  return lines.join('\n');
}

/**
 * Format for a concise group response.
 *
 * Smarter truncation that:
 * - Preserves option blocks (lines starting with emoji numbers or "Option")
 * - Doesn't cut mid-option
 * - Adds a footer if truncated
 */
export function formatGroupResponse(text: string): string {
  const MAX_LENGTH = 700; // Slightly higher to accommodate option blocks

  if (text.length <= MAX_LENGTH) return text;

  const lines = text.split('\n');
  const kept: string[] = [];
  let totalLen = 0;

  for (const line of lines) {
    const lineLen = line.length + 1; // +1 for newline
    if (totalLen + lineLen > MAX_LENGTH - 30) {
      // Check if we're in the middle of an options block
      const isOptionLine = /^(1️⃣|2️⃣|3️⃣|Option\s|[A-C]\.|[1-3]\.)/i.test(line);
      if (isOptionLine) {
        // Include this option line even if slightly over — don't break mid-options
        kept.push(line);
      }
      break;
    }
    kept.push(line);
    totalLen += lineLen;
  }

  const result = kept.join('\n');
  if (result.length < text.length) {
    return result + '\n...';
  }
  return result;
}
