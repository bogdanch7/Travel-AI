import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function discover() {
  console.log('🚀 Starting Vola discovery session...');
  const browser = await chromium.launch({ headless: false }); // Show browser for manual interaction
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings: any[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('api.ith.toys')) {
      console.log(`\n🔍 Found Vola API request: [${request.method()}] ${url}`);
      findings.push({
        method: request.method(),
        url: url,
        headers: request.headers(),
        postData: request.postData(),
      });
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('api.ith.toys')) {
      try {
        const body = await response.json();
        console.log(`✅ Response captured for ${url}`);
        const index = findings.findIndex(f => f.url === url && f.method === response.request().method());
        if (index !== -1) {
          findings[index].response = body;
        }
      } catch {
        // Not a JSON response or already consumed
      }
    }
  });

  console.log('🌍 Opening vola.ro. Please perform a flight search manually.');
  await page.goto('https://www.vola.ro');

  // Wait for user to finish or close browser
  console.log('⌚ Waiting for manual search... (Press Ctrl+C in terminal when done)');
  
  // Keep open for 2 minutes or until user interaction
  await page.waitForTimeout(120000);

  // Save findings
  const findingsPath = path.join(__dirname, '../src/integrations/vola/last_discovery.json');
  fs.writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
  console.log(`\n💾 Discovery data saved to ${findingsPath}`);

  await browser.close();
}

discover().catch(console.error);
