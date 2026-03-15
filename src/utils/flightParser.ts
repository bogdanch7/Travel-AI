/**
 * Robust Flight Request Parser
 * Handles extraction, normalization, and context priority for flight searches.
 */

export const CITY_MAP: Record<string, string> = {
  'BUCHAREST': 'BUH', 'BUCURESTI': 'BUH', 'БУКУРЕЩ': 'BUH',
  'SOFIA': 'SOF', 'СОФИЯ': 'SOF',
  'MILAN': 'MIL', 'MILANO': 'MIL', 'МИЛАНО': 'MIL',
  'BERLIN': 'BER', 'БЕРЛИН': 'BER',
  'WARSAW': 'WAW', 'VARSOVIA': 'WAW', 'ВАРШАВА': 'WAW',
  'LONDON': 'LON', 'LONDRA': 'LON', 'ЛОНДОН': 'LON',
  'PARIS': 'PAR', 'ПАРИЖ': 'PAR',
  'MADRID': 'MAD', 'МАДРИД': 'MAD',
  'BARCELONA': 'BCN', 'БАРСЕЛОНА': 'BCN',
  'ROME': 'ROM', 'ROMA': 'ROM', 'РИМ': 'ROM',
  'VIENNA': 'VIE', 'VIENA': 'VIE', 'ВИЕНА': 'VIE',
};

/**
 * Normalizes city names to IATA/City codes.
 */
export function normalizeCity(name?: string): string | null {
  if (!name) return null;
  const clean = name.toUpperCase().trim().replace(/[\?\!\.\,]/g, '');
  return CITY_MAP[clean] || clean;
}

/**
 * Builds a valid Vola.ro search URL.
 */
export function buildVolaUrl(params: {
  from?: string | null;
  to?: string | null;
  dd?: string | null;
  rd?: string | null;
  ad?: number | null;
  cc?: string | null;
}): string {
  const { from, to, dd, rd, ad, cc = 'ECONOMY' } = params;
  if (!from || !to || !dd) return 'https://www.vola.ro';
  
  let url = `https://www.vola.ro/search_results?from=CITY:${from}&to=CITY:${to}&dd=${dd}`;
  if (rd) url += `&rd=${rd}`;
  url += `&ad=${ad || 1}&cc=${cc}`;
  return url;
}

export interface SanitizedFlightRequest {
  origin: string | null;
  destination: string | null;
  departureDate: string;
  returnDate?: string | null;
  passengers: number;
  fallbackUrl: string;
}

/**
 * Strict parser for flight requests.
 */
export function sanitizeFlightRequest(
  aiExtracted: any,
  allowContextFallback: boolean = false
): SanitizedFlightRequest {
  const sanitized: SanitizedFlightRequest = {
    origin: normalizeCity(aiExtracted.origin),
    destination: normalizeCity(aiExtracted.destination),
    departureDate: aiExtracted.departureDate,
    returnDate: aiExtracted.returnDate,
    passengers: aiExtracted.passengers || aiExtracted.adults || 1,
    fallbackUrl: ''
  };


  // Ensure we don't return defaults unless asked
  if (!sanitized.origin && !allowContextFallback) {
     sanitized.origin = null;
  }

  sanitized.fallbackUrl = buildVolaUrl({
    from: sanitized.origin,
    to: sanitized.destination,
    dd: sanitized.departureDate,
    rd: sanitized.returnDate,
    ad: sanitized.passengers
  });

  return sanitized;
}
