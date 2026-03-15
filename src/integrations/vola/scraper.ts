import { chromium } from 'playwright';
import { getLogger } from '../../utils/logger';
import { NormalizedFlightOffer } from './types';

/**
 * Fallback active scraper for Vola.ro using Playwright.
 * 
 * Vola uses strict Cloudflare anti-bot rules. When the direct API client (volaClient.ts)
 * hits a 403 Forbidden, we can launch a real headless browser which executes JS and 
 * often passes the JS challenges to fetch the actual price from the DOM.
 */
export async function scrapeVolaPrices(deeplink: string): Promise<NormalizedFlightOffer[]> {
  const logger = getLogger();
  logger.info({ deeplink }, 'Launching Playwright for Vola fallback scraper');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    // Prevent detection mechanisms where possible
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Go to deep link
    logger.info('Navigating to Vola search results...');
    await page.goto(deeplink, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for either the price element or the "No flights found" state
    // Vola's structure often has a price element inside a `.price` or similar class.
    // We will look for elements containing the Euro symbol '€'
    try {
      // Wait up to 15 seconds for prices to render (giving time for Cloudflare challenge + Vola API load)
      logger.info('Waiting for price elements...');
      await page.waitForSelector('text=/€|RON|lei/', { timeout: 20000 });
      logger.info('Found potential price markers');
    } catch {
      logger.warn('Playwright scraper timed out waiting for price element (€/RON/lei)');
      // Take a screenshot for debugging if it fails
      await page.screenshot({ path: 'scraper_failure.png' });
      return [];
    }

    // Extract all prices
    // We pass the function as a string to avoid transpiler helpers (like __name) being injected
    // which cause ReferenceErrors in the browser context.
    const parsedOffers = await page.evaluate(`
      (function() {
        var results = [];
        var seenTexts = new Set();

        function parsePrice(text) {
          var match = text.match(/(\\d+[\\d\\s.,]*)/);
          if (!match) return null;
          var cleaned = match[1].replace(/[\\u00A0\\s,]/g, function(m) { return m === ',' ? '.' : ''; });
          return parseFloat(cleaned);
        }

        var currencySymbols = ['€', 'RON', 'lei', 'LEI'];
        var allElements = Array.from(document.querySelectorAll('*'));
        
        for (var i = 0; i < allElements.length; i++) {
          var el = allElements[i];
          var text = (el.textContent || '').trim();
          if (!text || seenTexts.has(text)) continue;

          var className = (el.className || '').toString().toLowerCase();
          var isPriceElement = className.indexOf('price') !== -1 || className.indexOf('amount') !== -1;

          var hasCurrency = false;
          for (var j = 0; j < currencySymbols.length; j++) {
            if (text.indexOf(currencySymbols[j]) !== -1) {
              hasCurrency = true;
              break;
            }
          }

          if (hasCurrency && el.children.length === 0) {
            var amount = parsePrice(text);
            // Ignore very low numbers that are likely not flight prices (e.g. baggage fees or dates)
            var minThreshold = text.indexOf('€') !== -1 ? 10 : 50; 
            
            if (amount && amount >= minThreshold) {
              // Priority boost for elements with 'price' in class
              var weight = isPriceElement ? 0 : 10000;
              results.push({ 
                price: amount, 
                currency: text.indexOf('€') !== -1 ? 'EUR' : 'RON',
                weight: weight
              });
              seenTexts.add(text);
            }
          }
          
          if (!hasCurrency && el.children.length === 0) {
            var amount = parsePrice(text);
            var minThreshold = isPriceElement ? 10 : 50;

            if (amount && amount >= minThreshold) {
              var nextText = el.nextElementSibling ? (el.nextElementSibling.textContent || '') : '';
              var parentText = el.parentElement ? (el.parentElement.textContent || '') : '';
              
              var siblingOrParentHasCurrency = false;
              for (var k = 0; k < currencySymbols.length; k++) {
                if (nextText.indexOf(currencySymbols[k]) !== -1 || parentText.indexOf(currencySymbols[k]) !== -1) {
                  siblingOrParentHasCurrency = true;
                  break;
                }
              }
              
              if (siblingOrParentHasCurrency) {
                results.push({ 
                  price: amount, 
                  currency: (nextText.indexOf('€') !== -1 || parentText.indexOf('€') !== -1) ? 'EUR' : 'RON',
                  weight: isPriceElement ? 0 : 10000
                });
                seenTexts.add(text);
              }
            }
          }
        }
        return results;
      })()
    `) as { price: number; currency: string; weight: number }[];

    if (parsedOffers.length === 0) {
      logger.warn('Playwright found results page but failed to extract any valid prices');
      return [];
    }

    // Sort by weight (priority) then by price and pick the cheapest
    parsedOffers.sort((a, b) => {
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.price - b.price;
    });
    const bestOffer = parsedOffers[0];

    logger.info({ scrapedPrice: bestOffer.price, currency: bestOffer.currency, deeplink }, 'Playwright scraper success');

    // Parse origin/dest/dates from deeplink to populate the NormalizedFlightOffer
    // Format: https://www.vola.ro/search_results?from=CITY:BUH&to=CITY:SVQ&dd=2026-04-09&rd=2026-04-15
    const urlObj = new URL(deeplink);

    const fromParam = urlObj.searchParams.get('from') || ''; // e.g. "CITY:BUH"
    const toParam = urlObj.searchParams.get('to') || '';     // e.g. "CITY:SVQ"
    
    const originStr = fromParam.split(':')[1] || '';
    const destStr = toParam.split(':')[1] || '';

    const departDate = urlObj.searchParams.get('dd') || '';
    const returnDate = urlObj.searchParams.get('rd') || undefined;

    return [{
      origin: originStr ? originStr.toUpperCase() : 'UNKNOWN',
      destination: destStr ? destStr.toUpperCase() : 'UNKNOWN',
      departDate,
      returnDate,
      priceAmount: bestOffer.price,
      currency: bestOffer.currency,
      airline: 'Multiple Airlines', // Approximated
      stops: -1, // Approximated
      deeplinkOrReference: deeplink,
      notes: 'SCRAPED_FALLBACK: Price fetched via Playwright automation due to API block'
    }];

  } catch (err) {
    logger.error({ err }, 'Playwright scraper fatal error');
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
