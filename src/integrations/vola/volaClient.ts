import { getLogger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import {
  VolaDiscoverRequest,
  VolaDiscoverResponse,
  VolaFetchResponse,
  VolaAutocompleteRawResponse,
  VolaAutocompleteResult,
} from './types';

/**
 * API base URL — discovered via network traffic capture.
 * Vola.ro uses api.ith.toys as their underlying flight aggregation gateway.
 */
const API_BASE = 'https://api.ith.toys';

/**
 * Required static headers for all api.ith.toys requests.
 *
 * FRAGILITY NOTE:
 *   - `api-key` is a public frontend key extracted from the vola.ro JS bundle.
 *     If it rotates, re-inspect the vola.ro page source.
 *   - `x-affiliate: vola` identifies the Vola.ro context.
 *   - `slot` affects fee calculation on the backend.
 *
 * See requestDiscovery.md for full details.
 */
const STATIC_HEADERS: Record<string, string> = {
  'api-key': '7f6c921c-d7f8-4303-b9ad-b60878ca12ed',
  'x-affiliate': 'vola',
  'x-app-origin': 'new-front-end',
  'slot': 'volaNoExtraViFeesIncreased',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,ro;q=0.8',
  'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
  'x-ab-test-token': 'eyJpdiI6Ijl5UzYwNzY0dW1ER24yUXFoLzlrdnc9PSIsInZhbHVlIjoiRlhpZVBwZG1CekEyNjZPQnBTNnNudUFTeW5hWWt2RFQ2cmdSWTA2VkJsa1MyZ3k0NDhBZElGbE9mZmZGR3c0aTN4V09RQmVzbmgyVm5rQ0dLYVVkTng3NDNBOUUwdVlUZWVVTEhkK0ZJTlFBdFdQekFuSzg4OG9tYjZWTnp4dnJhazFrckJObUlhMEN5ZkRCV0xBNktmU3QrZWozM2tmNFJweXhTSmVzSXZwNGFFM3MwVzkrMk9YendaSHN4MURrVmkyeW1zNU80dGFQNjUydVpUTDZ5MFkxWS9FS0d5QkE5YXlNQU9MbmVySzkxajY4NE9zV2NGVmVFRnJXOTZnYURhME8wU1lYazhkUjRDbU1FU3oxR2VpSDFRN2toYW1LeDNXUUUzVHVWSTUzMkpNblFWSUVITForOG9Ba0JiQndDQnhSVUM0WnRQdjVHWFFWL1dXb3k0THpZeHMxNjRPdEQ2SDlPcHVIbWNhTW83TkJmRFdETUdnYUxMVkczTDdsUzFYUHQxVDMzL0lPZC85cDhHVTY0VUZrbGMwaFFWV1V6eXBwQ0ltejlZWFlIQkJTUEJTc3FNd2NqempLSzJQeGlOSFY3WHNXTDcxVlAwbytkeWJnZUpLQ0Z0UkNWUDJJSldmV09kVnEvNkRWN0xWZ05kV1dYRmg0L1ZnaFVYa0dzQW93bkdxYlFXblRqWlF6YUVOSUcvUkwrUXdLVTBSUHp1ajBlVkU1N2xQbGYyZ1BMeFZ1eVlkM2xaNERrY09kdENVTnp5ZFA3Yll0OVZhZmVKT1BsUT09IiwibWFjIjoiMDI0NTUyODgxYjU1YTVjMmJlZTRlNWIyNTYwNGJlMTc3Zjc4NGI2OGMyZGFlNWM4YmZlZmJjYThjMDExMzNhMiIsInRhZyI6IiJ9'
};

/**
 * Low-level HTTP client for the api.ith.toys gateway (Vola.ro backend).
 *
 * This client provides a narrow, robust surface for the rest of the Vola integration.
 */
export class VolaClient {
  /**
   * Initiate a flight search. Returns a `discoveryId` used for polling.
   */
  async initiateSearch(request: VolaDiscoverRequest): Promise<VolaDiscoverResponse> {
    const logger = getLogger();

    return withRetry(
      async () => {
        const url = `${API_BASE}/gateway/discover?affiliate=vola`;
        const body = JSON.stringify(request);
        const headers: Record<string, string> = { ...STATIC_HEADERS, 'Content-Type': 'application/json' };

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(15000), // 15s timeout
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logger.error({ status: response.status, bodyPreview: body.slice(0, 300), url }, 'Vola search initiation failed');
          
          if (response.status === 403) {
            throw new Error('Vola Search Initiation: Access Forbidden (Cloudflare/Anti-bot)');
          }
          throw new Error(`Vola search initiation failed: HTTP ${response.status}`);
        }

        const data = (await response.json()) as VolaDiscoverResponse;

        if (!data.discoveryId) {
          throw new Error('Vola search initiation response missing discoveryId');
        }

        return data;
      },
      'volaInitiateSearch',
      { maxAttempts: 2, baseDelayMs: 1000 },
    );
  }

  /**
   * Fetch results for a discovery process.
   */
  async fetchResults(discoveryId: string): Promise<VolaFetchResponse> {
    const logger = getLogger();

    return withRetry(
      async () => {
        const url = `${API_BASE}/gateway/discover/fetch/${discoveryId}?affiliate=vola`;

        const response = await fetch(url, {
          method: 'GET',
          headers: STATIC_HEADERS,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logger.error({ status: response.status, discoveryId, bodyPreview: body.slice(0, 300), url }, 'Vola results fetch failed');
          throw new Error(`Vola results fetch failed: HTTP ${response.status}`);
        }

        return (await response.json()) as VolaFetchResponse;
      },
      'volaFetchResults',
      { maxAttempts: 2, baseDelayMs: 500 },
    );
  }

  /**
   * Resolve location codes.
   */
  async autocomplete(searchTerm: string, context: 'ORIGIN' | 'DESTINATION' = 'DESTINATION'): Promise<VolaAutocompleteResult[]> {
    const logger = getLogger();

    return withRetry(
      async () => {
        const params = new URLSearchParams({
          searchTerm,
          lang: 'en',
          searchFor: context,
          limit: '5',
          affiliate: 'vola',
        });

        const url = `${API_BASE}/gateway/public/autocomplete?${params.toString()}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: STATIC_HEADERS,
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          return [];
        }

        const raw = (await response.json()) as VolaAutocompleteRawResponse;
        const results: VolaAutocompleteResult[] = [];

        if (raw.cities) {
          raw.cities.forEach((c: { cityCode: string }) => results.push({ code: c.cityCode, type: 'CITY' }));
        }
        if (raw.airports) {
          raw.airports.forEach((a: { code: string }) => results.push({ code: a.code, type: 'AIRPORT' }));
        }

        return results;
      },
      'volaAutocomplete',
      { maxAttempts: 1 },
    );
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let clientInstance: VolaClient | null = null;

export function getVolaClient(): VolaClient {
  if (!clientInstance) {
    clientInstance = new VolaClient();
  }
  return clientInstance;
}
