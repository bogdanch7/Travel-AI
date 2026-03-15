import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getEnv } from './config/env';
import { getLogger } from './utils/logger';
import { connectRedis, disconnectRedis } from './store/redis';
import { connectPostgres, disconnectPostgres } from './store/postgres';
import { healthRoutes } from './routes/health';
import { webhookRoutes } from './routes/webhook';
import querystring from 'querystring';

// Global error handlers — catch silent crashes in async paths
process.on('unhandledRejection', (reason, promise) => {
  console.error('‼️ UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('‼️ UNCAUGHT EXCEPTION:', err);
});

async function main(): Promise<void> {
  const env = getEnv();
  const logger = getLogger();

  logger.info({ nodeEnv: env.NODE_ENV, port: env.PORT }, '🚀 Starting Vola Travel AI...');

  // Create Fastify instance
  const app = Fastify({
    logger: false, // We use our own Pino logger
    bodyLimit: 10 * 1024 * 1024, // 10MB for image payloads
  });

  // CORS
  await app.register(cors, { origin: true });

  // Raw body support for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const rawBody = body as string;
      (req as unknown as { rawBody: string }).rawBody = rawBody;
      done(null, JSON.parse(rawBody));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    try {
      const rawBody = body as string;
      (req as unknown as { rawBody: string }).rawBody = rawBody;
      done(null, querystring.parse(rawBody));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(webhookRoutes);

  // Connect to data stores
  try {
    await connectRedis();
    logger.info('✅ Redis connected');
  } catch (err) {
    logger.warn({ err }, '⚠️ Redis connection failed — session features will be limited');
  }

  try {
    await connectPostgres();
    logger.info('✅ Postgres connected, migrations applied');
  } catch (err) {
    logger.warn({ err }, '⚠️ Postgres connection failed — persistence will be limited');
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, '🛑 Shutting down...');
    await app.close();
    await disconnectRedis();
    await disconnectPostgres();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start server
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`✅ Server running on http://0.0.0.0:${env.PORT}`);
    logger.info(`   Health: http://localhost:${env.PORT}/health`);
    logger.info(`   Meta Webhook: http://localhost:${env.PORT}/webhook`);
  } catch (err) {
    logger.error({ err }, '❌ Failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
