import { Pool, PoolClient } from 'pg';
import { getEnv } from '../config/env';
import { getLogger } from '../utils/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const env = getEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    getLogger().error({ err }, 'Unexpected Postgres pool error');
  });

  return pool;
}

export async function connectPostgres(): Promise<void> {
  const p = getPool();
  const logger = getLogger();

  // Test connection
  const client = await p.connect();
  client.release();
  logger.info('Postgres connected');

  // Run migrations
  await runMigrations();
}

export async function disconnectPostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

async function runMigrations(): Promise<void> {
  const logger = getLogger();
  const p = getPool();

  const migrations = [
    `CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      chat_id VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      intent VARCHAR(50),
      tools_used TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id)`,

    `CREATE TABLE IF NOT EXISTS trip_contexts (
      chat_id VARCHAR(255) PRIMARY KEY,
      context JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      correlation_id VARCHAR(255) NOT NULL,
      chat_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      intent VARCHAR(50),
      tool_name VARCHAR(100),
      tool_args JSONB,
      tool_latency_ms INTEGER,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_chat_id ON audit_log(chat_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_correlation_id ON audit_log(correlation_id)`,
  ];

  for (const sql of migrations) {
    try {
      await p.query(sql);
    } catch (err) {
      logger.error({ err, sql: sql.slice(0, 80) }, 'Migration failed');
      throw err;
    }
  }

  logger.info('Database migrations complete');
}

/** Utility for single query */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** Utility for transactional work */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
