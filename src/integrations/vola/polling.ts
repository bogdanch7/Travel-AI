import { getLogger } from '../../utils/logger';
import { VolaFetchResponse } from './types';
import { getVolaClient } from './volaClient';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30000;
const MAX_POLL_ATTEMPTS = Math.ceil(MAX_POLL_DURATION_MS / POLL_INTERVAL_MS);

/**
 * Poll the Vola API for search results.
 */
export async function pollForResults(discoveryId: string): Promise<VolaFetchResponse> {
  const logger = getLogger();
  const client = getVolaClient();
  let lastResponse: VolaFetchResponse | null = null;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const response = await client.fetchResults(discoveryId);
      lastResponse = response;

      const offerCount = response.offersResult?.offers?.length || 0;
      logger.info({ discoveryId, attempt, status: response.status, offerCount }, 'Vola polling status');

      if (response.status === 'COMPLETED' || response.status === 'FINISHED') {
        return response;
      }

      // If we have plenty of offers and we've waited half the time, return what we have
      if (offerCount > 10 && attempt > MAX_POLL_ATTEMPTS / 2) {
        logger.info({ discoveryId, offerCount }, 'Vola returning partial results early due to high offer count');
        return response;
      }
    } catch (err) {
      logger.warn({ err, discoveryId, attempt }, 'Vola polling attempt failed');
      if (attempt === MAX_POLL_ATTEMPTS) {
        if (lastResponse) return lastResponse;
        throw err;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  logger.warn({ discoveryId }, 'Vola search polling timed out, returning partial results');
  return lastResponse ?? { status: 'IN_PROGRESS' };
}
