import { VolaOffer, VolaStage, VolaSegment, NormalizedFlightOffer } from './types';
import { getLogger } from '../../utils/logger';
import { resolveVolaCityCode } from './locationUtils';

/**
 * Normalize a single Vola offer into the internal NormalizedFlightOffer schema.
 */
export function normalizeVolaOffer(offer: VolaOffer, adults: number = 1): NormalizedFlightOffer | null {
  const logger = getLogger();

  try {
    const outbound = offer.stages?.[0];
    const inbound = offer.stages?.[1];

    if (!outbound?.segments?.length) {
      return null;
    }

    const firstSegOut = outbound.segments[0];
    const lastSegOut = outbound.segments[outbound.segments.length - 1];

    const totalPrice = offer.score.price;
    const currency = 'EUR'; // Default to EUR if not found, Vola usually defaults to EUR in API

    const outboundStops = outbound.segments.length - 1;
    const inboundStops = inbound ? inbound.segments.length - 1 : 0;

    const airline = firstSegOut.marketingCarrier || 'Unknown';

    const origin = firstSegOut.originAirport;
    const destination = lastSegOut.destinationAirport;
    const departDate = firstSegOut.departure.split('T')[0];
    const returnDate = inbound?.segments?.[0]?.departure?.split('T')[0];

    return {
      origin,
      destination,
      departDate,
      returnDate,
      priceAmount: Math.round(totalPrice * 100) / 100,
      currency,
      airline,
      stops: outboundStops + inboundStops,
      baggageIncluded: false,
      deeplinkOrReference: buildDeeplink(origin, destination, departDate, returnDate, adults),
      notes: buildNotes(outbound, inbound, offer),
    };
  } catch (err) {
    logger.warn({ err, offerId: offer.id }, 'Failed to normalize Vola offer');
    return null;
  }
}

/**
 * Normalize an array of Vola offers.
 */
export function normalizeVolaResults(offers: VolaOffer[], adults: number = 1): NormalizedFlightOffer[] {
  return offers
    .map(o => normalizeVolaOffer(o, adults))
    .filter((r): r is NormalizedFlightOffer => r !== null)
    .sort((a, b) => a.priceAmount - b.priceAmount);
}


function buildNotes(outbound: VolaStage, inbound: VolaStage | undefined, offer: VolaOffer): string {
  const parts: string[] = [];

  if (outbound.segments.length === 1) {
    parts.push('Direct outbound');
  } else {
    parts.push(`${outbound.segments.length - 1} stop(s) outbound`);
  }

  const outTotalMin = outbound.segments.reduce((acc, s) => acc + (s.duration || 0), 0);
  if (outTotalMin > 0) parts.push(`out: ${Math.floor(outTotalMin / 60)}h ${outTotalMin % 60}m`);

  if (inbound?.segments?.length) {
    if (inbound.segments.length === 1) {
      parts.push('Direct return');
    } else {
      parts.push(`${inbound.segments.length - 1} stop(s) return`);
    }
    const inTotalMin = inbound.segments.reduce((acc, s) => acc + (s.duration || 0), 0);
    if (inTotalMin > 0) parts.push(`ret: ${Math.floor(inTotalMin / 60)}h ${inTotalMin % 60}m`);
  }

  return parts.join(' • ');
}

function buildDeeplink(origin: string, destination: string, departDate: string, returnDate?: string, adults: number = 1): string {
  // To match exact Vola.ro frontend URL structure: https://www.vola.ro/search_results?from=CITY:BUH&to=CITY:SVQ&dd=2026-04-09&rd=2026-04-15&ad=1&cc=ECONOMY
  const base = 'https://www.vola.ro/search_results';
  
  // Vola's new frontend is very strict: it expects the parent CITY code for deep links, not the specific AIRPORT code.
  // We map common airports back to their cities to ensure the UI loads properly.
  const oCode = resolveVolaCityCode(origin);
  const dCode = resolveVolaCityCode(destination);

  const params = new URLSearchParams({
    from: `CITY:${oCode}`,
    to: `CITY:${dCode}`,
    dd: departDate,
  });

  if (returnDate) {
    params.set('rd', returnDate);
  }

  params.set('ad', adults.toString());
  params.set('cc', 'ECONOMY');

  return `${base}?${params.toString()}`;
}

