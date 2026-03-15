
import { resolveCityNameToCode, resolveVolaCityCode, CITY_NAME_TO_CODE } from './src/integrations/vola/locationUtils';
import { normalizeCity } from './src/utils/flightParser';

// Mock resolveLocation from searchFlights.ts
async function resolveLocation(term: string) {
  const normalized = term.toUpperCase().trim();
  
  if (normalized.length === 3 && /^[A-Z]{3}$/.test(normalized)) {
    const isCity = Object.values(CITY_NAME_TO_CODE).includes(normalized);
    return { code: normalized, type: isCity ? 'CITY' : 'AIRPORT' };
  }

  const mappedCode = resolveCityNameToCode(normalized);
  if (mappedCode) return { code: mappedCode, type: 'CITY' };

  return null;
}

async function test() {
  console.log('Testing "ROM":');
  const normalized = normalizeCity('Rome');
  console.log('normalizeCity("Rome") ->', normalized);
  
  const resolved = await resolveLocation(normalized || '');
  console.log('resolveLocation("ROM") ->', resolved);

  console.log('Testing "Milano":');
  const normalized2 = normalizeCity('Milano');
  console.log('normalizeCity("Milano") ->', normalized2);
}

test();
