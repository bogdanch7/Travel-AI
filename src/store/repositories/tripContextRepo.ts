import { query } from '../postgres';
import { cacheGet, cacheSet, cacheDel } from '../redis';
import { TripContext } from '../../types/app';
import { nowEpoch } from '../../utils/time';

const CACHE_PREFIX = 'trip_ctx:';
const CACHE_TTL = 3600; // 1 hour

export async function getTripContext(chatId: string): Promise<TripContext | null> {
  // Check Redis cache first
  const cached = await cacheGet(`${CACHE_PREFIX}${chatId}`);
  if (cached) {
    return JSON.parse(cached) as TripContext;
  }

  // Fall back to Postgres
  const rows = await query<{ context: TripContext }>(
    'SELECT context FROM trip_contexts WHERE chat_id = $1',
    [chatId],
  );

  if (rows.length === 0) return null;

  const ctx = rows[0].context;
  // Warm the cache
  await cacheSet(`${CACHE_PREFIX}${chatId}`, JSON.stringify(ctx), CACHE_TTL);
  return ctx;
}

export async function upsertTripContext(chatId: string, patch: Partial<TripContext>): Promise<TripContext> {
  const existing = await getTripContext(chatId);
  const updated: TripContext = {
    chatId,
    ...existing,
    ...patch,
    lastUpdated: nowEpoch(),
  };

  await query(
    `INSERT INTO trip_contexts (chat_id, context, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chat_id)
     DO UPDATE SET context = $2, updated_at = NOW()`,
    [chatId, JSON.stringify(updated)],
  );

  await cacheSet(`${CACHE_PREFIX}${chatId}`, JSON.stringify(updated), CACHE_TTL);
  return updated;
}

export async function deleteTripContext(chatId: string): Promise<void> {
  await query('DELETE FROM trip_contexts WHERE chat_id = $1', [chatId]);
  await cacheDel(`${CACHE_PREFIX}${chatId}`);
}
