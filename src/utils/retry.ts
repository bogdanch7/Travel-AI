import { getLogger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCheck?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10000,
};

/**
 * Retry a function with exponential backoff.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts: Partial<RetryOptions> = {},
): Promise<T> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const logger = getLogger();
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (options.retryableCheck && !options.retryableCheck(error)) {
        throw error;
      }

      if (attempt === options.maxAttempts) break;

      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200,
        options.maxDelayMs,
      );

      logger.warn({ attempt, maxAttempts: options.maxAttempts, delay, label, err: error }, `Retry attempt ${attempt}/${options.maxAttempts} for ${label}`);
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
