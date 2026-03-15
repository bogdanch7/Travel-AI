import pino from 'pino';
import { getEnv } from '../config/env';

let loggerInstance: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (loggerInstance) return loggerInstance;

  const env = getEnv();

  loggerInstance = pino({
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
        : undefined,
    base: { service: 'vola-travel-ai' },
    serializers: {
      err: pino.stdSerializers.err,
    },
  });

  return loggerInstance;
}

/** Create a child logger with a correlation/request ID */
export function createRequestLogger(correlationId: string, extra?: Record<string, unknown>): pino.Logger {
  return getLogger().child({ correlationId, ...extra });
}
