/**
 * Simple utility to map airline IATA codes to human-readable names.
 */
const AIRLINE_MAP: Record<string, string> = {
  'FR': 'Ryanair',
  'W6': 'Wizz Air',
  'RO': 'TAROM',
  'OS': 'Austrian Airlines',
  'LH': 'Lufthansa',
  'AF': 'Air France',
  'KL': 'KLM',
  'TK': 'Turkish Airlines',
  'LX': 'Swiss',
  'BA': 'British Airways',
  'LO': 'LOT Polish Airlines',
  'A3': 'Aegean Airlines',
  'BT': 'airBaltic',
  'JU': 'Air Serbia',
  'VY': 'Vueling',
  'U2': 'easyJet',
  'PC': 'Pegasus',
  'IB': 'Iberia',
  'TP': 'TAP Air Portugal',
  'SN': 'Brussels Airlines',
  'AY': 'Finnair',
  'SK': 'Scandinavian Airlines (SAS)',
  'DY': 'Norwegian Air',
  'D8': 'Norwegian Air',
};

/**
 * Returns the human-readable name of an airline from its IATA code.
 * Falls back to the code itself if not in the map.
 */
export function getAirlineName(code: string): string {
  const upper = code.toUpperCase().trim();
  return AIRLINE_MAP[upper] || upper;
}
