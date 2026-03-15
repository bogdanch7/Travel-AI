
import { normalizeCity } from './src/utils/flightParser';
import { resolveCityNameToCode, CITY_NAME_TO_CODE } from './src/integrations/vola/locationUtils';
import { getVolaClient } from './src/integrations/vola/volaClient';

async function resolveLocation(term: string) {
  const normalized = term.toUpperCase().trim();
  console.log(`resolveLocation trace: term="${term}", norm="${normalized}"`);
  
  if (normalized.length === 3 && /^[A-Z]{3}$/.test(normalized)) {
    const isCity = Object.values(CITY_NAME_TO_CODE).includes(normalized);
    console.log(`resolveLocation trace: is 3-letter code, isCity=${isCity}, returning ${normalized}`);
    return { code: normalized, type: isCity ? 'CITY' : 'AIRPORT' };
  }

  const mappedCode = resolveCityNameToCode(normalized);
  if (mappedCode) {
    console.log(`resolveLocation trace: mapped code found: ${mappedCode}`);
    return { code: mappedCode, type: 'CITY' };
  }

  return null;
}

async function runTest() {
  console.log('--- START TEST ---');
  const d1 = normalizeCity('Rome');
  console.log('normalizeCity("Rome") =', d1);
  
  const r1 = await resolveLocation(d1 || 'Rome');
  console.log('resolveLocation result =', r1);
  
  const d2 = normalizeCity('Milan');
  console.log('normalizeCity("Milan") =', d2);
  
  const r2 = await resolveLocation(d2 || 'Milan');
  console.log('resolveLocation(MIL) =', r2);
  console.log('--- END TEST ---');
}

runTest();
