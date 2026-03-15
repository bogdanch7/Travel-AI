
import { CITY_NAME_TO_CODE } from './src/integrations/vola/locationUtils';

const milEntries = Object.entries(CITY_NAME_TO_CODE).filter(([k, v]) => v === 'MIL' || k === 'MIL');
const romEntries = Object.entries(CITY_NAME_TO_CODE).filter(([k, v]) => v === 'ROM' || k === 'ROM');

console.log('MIL Entries:', milEntries);
console.log('ROM Entries:', romEntries);

const val = Object.values(CITY_NAME_TO_CODE);
console.log('Is "ROM" in values?', val.includes('ROM'));
console.log('Is "MIL" in values?', val.includes('MIL'));
