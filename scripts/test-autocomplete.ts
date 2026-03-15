import { getVolaClient } from '../src/integrations/vola/volaClient';

async function testAutocomplete() {
  const client = getVolaClient();
  const terms = ['Bucuresti', 'Londra'];
  
  for (const term of terms) {
    console.log(`\n🔍 Autocomplete for: ${term}`);
    const results = await client.autocomplete(term, 'ORIGIN');
    console.log('TYPE OF RESULTS:', typeof results);
    console.dir(results, { depth: null });
  }
}

testAutocomplete().catch(console.error);
