import axios from 'axios';
import { getEnv } from '../../config/env';
import { getLogger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import { truncate } from '../../utils/text';

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Send a text message via the configured WhatsApp provider.
 */
export async function sendTextMessage(to: string, text: string): Promise<void> {
  const env = getEnv();
  const logger = getLogger();

  // Keep outbound replies comfortably within WhatsApp limits.
  const safeText = truncate(text, env.WHATSAPP_PROVIDER === 'twilio' ? 1600 : 4000);

  if (env.WHATSAPP_PROVIDER === 'bridge') {
    const bridgeUrl = `${env.WHATSAPP_BRIDGE_URL.replace(/\/$/, '')}/trimite-raspuns`;
    await withRetry(
      async () => {
        await axios.post(bridgeUrl, {
          groupId: to,
          text: safeText,
        });
        logger.info({ to, textLength: safeText.length, bridgeUrl }, 'WhatsApp message sent via bridge');
      },
      'sendTextMessageBridge',
      { maxAttempts: 2, baseDelayMs: 1000 },
    );
    return;
  }

  if (env.WHATSAPP_PROVIDER === 'twilio') {
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
      'sendTextMessageTwilio',
      { maxAttempts: 2, baseDelayMs: 1000 }
    );
    return;
  }

  // Default: Meta Cloud API
  const url = `${WHATSAPP_API_BASE}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await withRetry(
    async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: safeText },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, errorBody, to }, 'Meta send failed');
        throw new Error(`Meta API error: ${response.status}`);
      }
      logger.info({ to, textLength: safeText.length }, 'Meta message sent');
    },
    'sendTextMessageMeta',
    { maxAttempts: 2, baseDelayMs: 1000 },
  );
}
export async function sendReaction(to: string, messageId: string, emoji: string): Promise<void> {
  const env = getEnv();
  if (env.WHATSAPP_PROVIDER === 'bridge') return;
  const url = `${WHATSAPP_API_BASE}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'reaction',
        reaction: { message_id: messageId, emoji },
      }),
    });
  } catch (err) {
    getLogger().warn({ err, to, messageId }, 'Failed to send reaction');
  }
}

/**
 * Mark a message as read.
 */
export async function markAsRead(messageId: string): Promise<void> {
  const env = getEnv();
  if (env.WHATSAPP_PROVIDER === 'bridge') return;
  const url = `${WHATSAPP_API_BASE}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch {
    // Non-critical, silently ignore
  }
}

/**
 * Download media from WhatsApp Cloud API. Returns the media URL.
 */
export async function getMediaUrl(mediaId: string): Promise<string> {
  const env = getEnv();
  const logger = getLogger();

  // For Twilio, the mediaId is actually passed directly as the MediaUrl0 from the payload
  if (env.WHATSAPP_PROVIDER === 'twilio' || env.WHATSAPP_PROVIDER === 'bridge') {
    return mediaId; // It's already the URL
  }

  // First, get the media URL
  const metaUrl = `${WHATSAPP_API_BASE}/${mediaId}`;
  const metaResponse = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}` },
  });

  if (!metaResponse.ok) {
    throw new Error(`Failed to get media metadata: ${metaResponse.status}`);
  }

  const metaBody = (await metaResponse.json()) as { url?: string };
  if (!metaBody.url) {
    throw new Error('No URL in media metadata response');
  }

  logger.debug({ mediaId }, 'Got media URL');
  return metaBody.url;
}

/**
 * Download media bytes from WhatsApp, returning a base64 string.
 */
export async function downloadMediaAsBase64(mediaUrl: string): Promise<string> {
  const env = getEnv();
  
  let headers: Record<string, string> = {};

  if (env.WHATSAPP_PROVIDER === 'bridge') {
    headers = {};
  } else if (env.WHATSAPP_PROVIDER === 'twilio') {
    // Twilio uses HTTP Basic Auth (AccountSid : AuthToken)
    const encodedCredentials = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    headers = { Authorization: `Basic ${encodedCredentials}` };
  } else {
    // Meta uses Bearer token
    headers = { Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}` };
  }

  const response = await fetch(mediaUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
