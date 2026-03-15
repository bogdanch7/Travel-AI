import Redis from 'ioredis';
import { getEnv } from '../config/env';
import { getLogger } from '../utils/logger';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (redisClient) return redisClient;

  const env = getEnv();
  const logger = getLogger();

  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      logger.warn({ times, delay }, 'Redis reconnecting');
      return delay;
    },
    lazyConnect: true,
  });

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error', (err) => logger.error({ err }, 'Redis error'));

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/** Cache a value with TTL in seconds */
export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  await getRedis().setex(key, ttlSeconds, value);
}

/** Get a cached value, returns null if not found */
export async function cacheGet(key: string): Promise<string | null> {
  return getRedis().get(key);
}

/** Delete a cached key */
export async function cacheDel(key: string): Promise<void> {
  await getRedis().del(key);
}

/** Atomic Set-if-not-exists with TTL. Returns true if key was set, false otherwise. */
export async function cacheSetNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const result = await getRedis().set(key, value, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

