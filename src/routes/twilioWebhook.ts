import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getEnv } from '../config/env';
import { getLogger } from '../utils/logger';
import { validateTwilioSignature, parseTwilioPayload } from '../integrations/whatsapp/twilioProvider';
import { processWebhook } from '../integrations/whatsapp/webhook';

export async function twilioWebhookRoutes(app: FastifyInstance): Promise<void> {
  const logger = getLogger();

  /**
   * POST /webhooks/twilio/whatsapp — Incoming Twilio WhatsApp messages.
   */
  app.post('/webhooks/twilio/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const env = getEnv();
    const signature = request.headers['x-twilio-signature'] as string || '';
    const params = request.body as Record<string, string>;
    
    // Construct full URL for signature validation
    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['host'];
    const baseUrl = env.TWILIO_WEBHOOK_BASE_URL ? env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '') : `${protocol}://${host}`;
    const fullUrl = `${baseUrl}${request.url}`;

    if (env.TWILIO_VALIDATE_SIGNATURE) {
      if (!validateTwilioSignature(fullUrl, params, signature)) {
        logger.warn({ fullUrl, signature }, 'Invalid Twilio signature');
        return reply.status(401).send('Invalid signature');
      }
    } else {
      logger.debug('Twilio signature validation skipped (disabled in env)');
    }

    // Normalize and process
    const message = parseTwilioPayload(params);

    // Twilio expects a 200 OK or TwiML
    // We send 200 OK and process asynchronously to keep logic consistent with Meta
    reply.status(200).header('Content-Type', 'text/xml').send('<Response></Response>');

    // Process asynchronously
    setImmediate(() => {
      processWebhook({}, [message]).catch((err) => {
        logger.error({ err }, 'Async Twilio webhook processing failed');
      });
    });
  });
}
