import * as crypto from 'crypto';
import { getEnv } from '../../config/env';
import { getLogger } from '../../utils/logger';

/**
 * Verify incoming WhatsApp webhook request signature.
 * Uses HMAC-SHA256 with the app secret.
 */
export function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
  const logger = getLogger();
  const env = getEnv();

  if (!signatureHeader) {
    logger.warn('Missing X-Hub-Signature-256 header');
    return false;
  }

  const signature = signatureHeader.replace('sha256=', '');
  const expectedSignature = crypto
    .createHmac('sha256', env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );

  if (!isValid) {
    logger.warn('Invalid webhook signature');
  }

  return isValid;
}

/**
 * Verify the webhook verification challenge from Meta.
 */
export function verifyChallenge(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
): string | null {
  const env = getEnv();

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return challenge;
  }

  return null;
}
