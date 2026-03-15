import { searchFlights } from '../src/integrations/vola/searchFlights';
import { FlightSearchInput } from '../src/integrations/vola/types';

async function testVola() {
  console.log('🧪 Testing Vola searchFlights integration...');

  const input: FlightSearchInput = {
    origin: 'OTP',
    destination: 'LHR',
    departDate: '2026-04-15',
    returnDate: '2026-04-19',
    adults: 1,
  };

  try {
    console.log('🔍 Calling searchFlights...');
    const results = await searchFlights(input);
    console.log(`\n✅ Received ${results.length} results.`);

    results.slice(0, 5).forEach((r, i) => {
      console.log(`${i + 1}. ${r.priceAmount} ${r.currency} - ${r.airline} (${r.stops} stops)`);
      console.log(`   Link: ${r.deeplinkOrReference}`);
    });
  } catch (err) {
    console.error('❌ Test failed unexpectedly:', err);
  } finally {
    process.exit(0);
  }
}

testVola().then(() => console.log('\n--- Test finished ---')).catch(console.error);
