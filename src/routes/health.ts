import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getRedis } from '../store/redis';
import { getPool } from '../store/postgres';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, string> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    // Check Redis
    try {
      await getRedis().ping();
      checks.redis = 'connected';
    } catch {
      checks.redis = 'disconnected';
    }

    // Check Postgres
    try {
      const pool = getPool();
      const client = await pool.connect();
      client.release();
      checks.postgres = 'connected';
    } catch {
      checks.postgres = 'disconnected';
    }

    const allHealthy = checks.redis === 'connected' && checks.postgres === 'connected';
    reply.status(allHealthy ? 200 : 503).send(checks);
  });
}
