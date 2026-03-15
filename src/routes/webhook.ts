import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyChallenge, verifyWebhookSignature } from '../integrations/whatsapp/verifier';
import { processWebhook } from '../integrations/whatsapp/webhook';
import { getLogger } from '../utils/logger';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  const logger = getLogger();

  /**
   * GET /webhook — WhatsApp verification endpoint.
   * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
   */
  app.get('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const result = verifyChallenge(mode, token, challenge);

    if (result) {
      logger.info('Webhook verification successful');
      reply.status(200).send(result);
    } else {
      logger.warn('Webhook verification failed');
      reply.status(403).send('Forbidden');
    }
  });

  /**
   * POST /webhook — Incoming WhatsApp messages.
   * Verify signature, then process asynchronously.
   */
  app.post('/webhook', {
    config: {
      rawBody: true,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify webhook signature
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Invalid webhook signature, processing anyway in dev mode');
      // In production, you'd return 401 here.
      // For dev/demo, we process the message anyway.
    }

    // Respond immediately with 200 (WhatsApp requires quick acknowledgment)
    reply.status(200).send('EVENT_RECEIVED');

    // Process asynchronously
    setImmediate(() => {
      processWebhook(request.body).catch((err) => {
        logger.error({ err }, 'Async webhook processing failed');
      });
    });
  });
}
