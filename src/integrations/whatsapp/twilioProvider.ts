import crypto from 'crypto';
import { WhatsAppMessage } from '../../types/app';
import { getEnv } from '../../config/env';
import { getLogger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import { truncate } from '../../utils/text';

/**
 * Validates the Twilio X-Twilio-Signature header.
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const env = getEnv();
  if (!env.TWILIO_AUTH_TOKEN) return false;

  // Sort params alphabetically and concatenate key + value
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const hmac = crypto.createHmac('sha1', env.TWILIO_AUTH_TOKEN);
  hmac.update(data);
  const expectedSignature = hmac.digest('base64');

  return expectedSignature === signature;
}

/**
 * Normalizes a Twilio webhook body into a WhatsAppMessage.
 */
export function parseTwilioPayload(body: Record<string, string>): WhatsAppMessage {
  const numMedia = parseInt(body.NumMedia || '0', 10);
  
  const message: WhatsAppMessage = {
    messageId: body.MessageSid,
    chatId: body.From, // Twilio format: "whatsapp:+123456789"
    senderId: body.From,
    senderName: body.ProfileName || 'Unknown',
    timestamp: Date.now(), // Twilio doesn't provide a unix timestamp in the simple webhook
    isGroup: false, // Twilio WhatsApp does not reliably support group participation
    chatType: 'dm', // Twilio only delivers direct messages reliably
    text: body.Body || undefined,
  };

  if (numMedia > 0) {
    // We take the first media item.
    // Twilio provides the direct URL, but webhook.ts expects `imageId` to trigger the download flow.
    // We store the Twilio URL in `imageId`, and `getMediaUrl` will just pass it through.
    message.imageId = body.MediaUrl0;
    message.imageMimeType = body.MediaContentType0;
  }

  return message;
}

/**
 * Sends a WhatsApp message via Twilio REST API.
 */
export async function sendTwilioMessage(to: string, text: string): Promise<void> {
  const env = getEnv();
  const logger = getLogger();

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_NUMBER) {
    throw new Error('Twilio credentials missing');
  }

  const safeText = truncate(text, 1600); // Twilio recommendation for WhatsApp

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');

  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', env.TWILIO_WHATSAPP_NUMBER);
  params.append('Body', safeText);

  await withRetry(
    async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, errorBody, to }, 'Twilio send failed');
        throw new Error(`Twilio API error: ${response.status}`);
      }

      logger.info({ to, textLength: safeText.length }, 'Twilio message sent');
    },
    'sendTwilioMessage',
    { maxAttempts: 2, baseDelayMs: 1000 }
  );
}
