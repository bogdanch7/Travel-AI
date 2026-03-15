const url = 'https://api.ith.toys/gateway/public/autocomplete?searchTerm=London&lang=en&searchFor=ORIGIN&limit=5&affiliate=vola';
const headers = {
  'api-key': '7f6c921c-d7f8-4303-b9ad-b60878ca12ed',
  'affiliate': 'vola',
  'x-affiliate': 'vola',
  'x-app-origin': 'new-front-end',
  'slot': 'volaNoExtraViFeesIncreased',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

async function testRawFetch() {
  console.log('📡 Starting raw fetch...');
  try {
    const res = await fetch(url, { headers });
    console.log('Status:', res.status);
    const body = await res.text();
    console.log('Body:', body.slice(0, 500));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testRawFetch();
