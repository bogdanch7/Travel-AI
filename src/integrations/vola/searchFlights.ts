import { getLogger } from '../../utils/logger';
import { cacheGet, cacheSet } from '../../store/redis';
import { getVolaClient } from './volaClient';
import { pollForResults } from './polling';
import { normalizeVolaResults } from './normalizers';
import { buildSearchCacheKey, VolaDiscoverRequest, FlightSearchInput, NormalizedFlightOffer } from './types';
import { scrapeVolaPrices } from './scraper';
import { getEnv } from '../../config/env';
import { resolveVolaCityCode, resolveCityNameToCode, CITY_NAME_TO_CODE } from './locationUtils';
import { sanitizeFlightRequest, buildVolaUrl } from '../../utils/flightParser';

/**
 * Search for flights using the Vola.ro gateway.
 * 
 * Signature: searchFlights(input) -> normalized flight offers
 */
export async function searchFlights(input: FlightSearchInput): Promise<NormalizedFlightOffer[]> {
  const logger = getLogger();
  const env = getEnv();
  const client = getVolaClient();

  // 1. Sanitize and Normalize Input
  logger.info({ toolInput: input }, 'Vola search_flights tool called');
  const sanitized = sanitizeFlightRequest(input);
  
  const [origin, destination] = await Promise.all([
    resolveLocation(sanitized.origin || input.origin, 'ORIGIN'),
    resolveLocation(sanitized.destination || input.destination, 'DESTINATION'),
  ]);

  console.log('DEBUG RESOLUTION:', { 
    rawDest: sanitized.destination || input.destination,
    resolved: destination?.code,
    allValuesIncludeROM: Object.values(CITY_NAME_TO_CODE).includes('ROM')
  });

    logger.info({ 
      originResolved: origin?.code, 
      destResolved: destination?.code,
      originType: origin?.type,
      destType: destination?.type,
      sanitizedOrigin: sanitized.origin,
      sanitizedDest: sanitized.destination
    }, 'Vola location resolution results');
    
    console.log('FINAL RESOLUTION SUMMARY:', {
        originCode: origin?.code,
        destCode: destination?.code,
        sanitizedDest: sanitized.destination
    });


  if (!origin || !destination) {
    logger.warn({ origin: input.origin, destination: input.destination }, 'Could not resolve location codes');
    return createFallbackResults(
      origin?.code || sanitized.origin || input.origin, 
      destination?.code || sanitized.destination || input.destination, 
      sanitized.departureDate, 
      sanitized.returnDate || undefined, 
      sanitized.passengers, 
      'Could not identify origin or destination location.'
    );
  }

  // Use sanitized dates/passengers for the rest of the flow
  const departDate = sanitized.departureDate;
  const returnDate = sanitized.returnDate || undefined;
  const adults = sanitized.passengers;

  // 2. Cache Check
  const cacheKey = buildSearchCacheKey(
    origin.code,
    destination.code,
    input.departDate,
    input.returnDate,
    input.adults || 1
  );

  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as NormalizedFlightOffer[];
    }
  } catch { /* proceed on cache miss */ }

  // 3. Build & Execute Search
  const discoverRequest: VolaDiscoverRequest = {
    dates: {
      departureFrom: input.departDate,
      departureTo: input.departDate,
      ...(input.returnDate ? { returnFrom: input.returnDate, returnTo: input.returnDate } : {}),
    },
    passengers: {
      adults: input.adults || 1,
      children: input.children || 0,
      infants: input.infants || 0,
      youth: 0,
    },
    locations: {
      origins: [{ code: origin.code, type: origin.type }],
      destinations: [{ code: destination.code, type: destination.type }],
    },
    luggageOptions: {
      personalItemCount: 1,
      cabinTrolleyCount: 0,
      checkedBaggageCount: 0,
    },
  };

  try {
    const { discoveryId } = await client.initiateSearch(discoverRequest);
    const fetchResponse = await pollForResults(discoveryId);
    const offers = fetchResponse.offersResult?.offers || [];

    if (offers.length === 0) {
      return createFallbackResults(origin.code, destination.code, input.departDate, input.returnDate, input.adults, 'No flights found for this route and dates.');
    }

    const normalized = normalizeVolaResults(offers, input.adults);



    // Update with input values for consistency
    normalized.forEach(o => {
      o.origin = origin.code;
      o.destination = destination.code;
    });

    logger.info({ 
      count: normalized.length, 
      isFallback: normalized[0]?.notes?.includes('LIVE_DATA_UNAVAILABLE'),
      firstPrice: normalized[0]?.priceAmount
    }, 'Vola search results summary');

    // 4. Cache Results
    await cacheSet(cacheKey, JSON.stringify(normalized), env.VOLA_SEARCH_CACHE_TTL).catch(() => {});

    return normalized;

  } catch (err: any) {
    logger.warn({ err: err.message, input }, 'Vola API Search failed. Attempting Playwright scraper fallback...');
    
    // Generate the deep link that the scraper needs to visit
    const oCode = resolveVolaCityCode(origin.code);
    const dCode = resolveVolaCityCode(destination.code);

    const params = new URLSearchParams({
      from: `CITY:${oCode}`,
      to: `CITY:${dCode}`,
      dd: input.departDate,
    });
    if (input.returnDate) params.set('rd', input.returnDate);
    params.set('ad', (input.adults || 1).toString());
    params.set('cc', 'ECONOMY');
    
    const deeplink = `https://www.vola.ro/search_results?${params.toString()}`;
    
    try {
      // Launch headless browser to bypass basic API blocks and scrape the DOM
      const scrapedResults = await scrapeVolaPrices(deeplink);
      
      if (scrapedResults.length > 0) {
        logger.info({ count: scrapedResults.length, testPrice: scrapedResults[0].priceAmount }, 'Playwright fallback succeeded');
        // Update input values for consistency
        scrapedResults.forEach(o => {
          o.origin = origin.code;
          o.destination = destination.code;
        });
        
        // Cache the scraped results
        await cacheSet(cacheKey, JSON.stringify(scrapedResults), env.VOLA_SEARCH_CACHE_TTL).catch(() => {});
        return scrapedResults;
      }
    } catch (scraperErr: any) {
      logger.error({ scraperErr: scraperErr.message }, 'Playwright scraper fallback also failed');
    }

    // Tertiary Safety Net: Static deep link with 0 price (Agent treats as LIVE_DATA_UNAVAILABLE)
    return createFallbackResults(origin.code, destination.code, departDate, returnDate, adults, err.message || 'Service temporarily unavailable.');
  }
}

async function resolveLocation(term: string, type: 'ORIGIN' | 'DESTINATION'): Promise<{ code: string; type: 'CITY' | 'AIRPORT' } | null> {
  const normalized = term.toUpperCase().trim();
  console.log(`resolveLocation trace: term="${term}", norm="${normalized}"`);
  
  // 1. Check if it's already a 3-letter IATA-like code (AI extracted or pre-mapped)
  if (normalized.length === 3 && /^[A-Z]{3}$/.test(normalized)) {
    // Check if it's a known city code by looking at its value in CITY_NAME_TO_CODE
    const isCity = Object.values(CITY_NAME_TO_CODE).includes(normalized);
    console.log(`resolveLocation trace: is 3-letter code, isCity=${isCity}, returning ${normalized}`);
    return { code: normalized, type: isCity ? 'CITY' : 'AIRPORT' };
  }


  // 2. Try common mappings (city names)
  const mappedCode = resolveCityNameToCode(normalized);
  if (mappedCode) {
    return { code: mappedCode, type: 'CITY' };
  }

  // 3. Try Autocomplete as a last resort for fuzzy terms
  const client = getVolaClient();
  const results = await client.autocomplete(term, type);
  if (results[0]) {
    return { code: results[0].code, type: results[0].type };
  }

  return null;
}


/**
 * Minimal fallback logic — no price fabrication.
 */
function createFallbackResults(
  origin: string, 
  destination: string, 
  departDate: string, 
  returnDate?: string, 
  adults?: number, 
  reason?: string
): NormalizedFlightOffer[] {
  const deeplink = buildVolaUrl({
    from: resolveVolaCityCode(origin),
    to: resolveVolaCityCode(destination),
    dd: departDate,
    rd: returnDate,
    ad: adults
  });

  return [{
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    departDate: departDate,
    returnDate: returnDate,
    priceAmount: 0,
    currency: 'EUR',
    airline: 'Unknown',
    stops: -1,
    deeplinkOrReference: deeplink,
    notes: `LIVE_DATA_UNAVAILABLE: ${reason || 'Service temporarily unavailable.'}`,
  }];
}
