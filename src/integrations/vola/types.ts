/**
 * Vola.ro / ith.toys API types — derived from verified network traffic capture.
 *
 * The actual API host is api.ith.toys, not vola.ro.
 */

// ─── Internal Normalized Types ───────────────────────────────────────

export type FlightSearchInput = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  infants?: number;
  cabinClass?: 'ECONOMY' | 'BUSINESS';
};

export type NormalizedFlightOffer = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  priceAmount: number;
  currency: string;
  airline?: string;
  stops?: number;
  baggageIncluded?: boolean;
  deeplinkOrReference?: string;
  notes?: string;
};

// ─── Search Request Types ────────────────────────────────────────────

export interface VolaDiscoverRequest {
  dates: VolaDates;
  passengers: VolaPassengers;
  locations: VolaLocations;
  luggageOptions: VolaLuggageOptions;
}

export interface VolaDates {
  departureFrom: string;  // YYYY-MM-DD
  departureTo: string;    // YYYY-MM-DD (same as departureFrom for exact date)
  returnFrom?: string;    // YYYY-MM-DD, omit for one-way
  returnTo?: string;      // YYYY-MM-DD
}

export interface VolaPassengers {
  adults: number;
  children: number;
  infants: number;
  youth: number;
}

export interface VolaLocations {
  origins: VolaLocationEntry[];
  destinations: VolaLocationEntry[];
}

export interface VolaLocationEntry {
  code: string;   // City code (e.g. "BUH", "LON") or airport code ("OTP", "LHR")
  type: 'CITY' | 'AIRPORT';
}

export interface VolaLuggageOptions {
  personalItemCount: number;   // default: 1 (hand/personal bag)
  cabinTrolleyCount: number;   // cabin trolley
  checkedBaggageCount: number; // checked baggage
}

// ─── Search Init Response ────────────────────────────────────────────

export interface VolaDiscoverResponse {
  discoveryId: string;  // UUID used for polling
}

// ─── Polling Response Types ──────────────────────────────────────────

export type VolaSearchStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FINISHED';

export interface VolaOffersResult {
  offers: VolaOffer[];
}

export interface VolaFetchResponse {
  status: VolaSearchStatus;
  offersResult?: VolaOffersResult;
}

export interface VolaOffer {
  id: string;
  score: {
    price: number;
    duration: number;
  };
  stages: VolaStage[];
}

export interface VolaStage {
  originAirport?: string;
  destinationAirport?: string;
  departure?: string;
  arrival?: string;
  segments: VolaSegment[];
}

export interface VolaSegment {
  id: string;
  originAirport: string;
  destinationAirport: string;
  departure: string;
  arrival: string;
  marketingCarrier: string;
  fullFlightNumber: string;
  duration: number; // in minutes
}

// ─── Autocomplete Types ──────────────────────────────────────────────

export interface VolaAutocompleteRawResponse {
  cities?: Array<{ cityCode: string, countryCode: string }>;
  airports?: Array<{ code: string, type: 'AIRPORT', name: string }>;
}

export interface VolaAutocompleteResult {
  code: string;
  type: 'CITY' | 'AIRPORT';
}

// ─── Cache Key Helper ────────────────────────────────────────────────

export function buildSearchCacheKey(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate?: string,
  passengers: number = 1,
): string {
  const parts = [origin, destination, departureDate, returnDate ?? 'ow', String(passengers)];
  return `vola:search:${parts.join(':')}`;
}
