import { WhatsAppMessage } from '../../types/app';
import { getLogger } from '../../utils/logger';

/**
 * Parse incoming WhatsApp Cloud API webhook payload into normalized messages.
 * Returns an array because one webhook call can contain multiple messages.
 */
export function parseWebhookPayload(body: unknown): WhatsAppMessage[] {
  const logger = getLogger();
  const messages: WhatsAppMessage[] = [];

  try {
    const payload = body as WebhookPayload;

    if (!payload?.entry) return messages;

    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        if (!value?.messages) continue;

        const contacts = value.contacts ?? [];

        for (const msg of value.messages) {
          const participantId = (msg as unknown as Record<string, string>).participant;
          const contact =
            contacts.find((c) => c.wa_id === participantId) ??
            contacts.find((c) => c.wa_id === msg.from) ??
            { profile: { name: 'Unknown' }, wa_id: participantId ?? msg.from };
          const isGroup = value.metadata?.display_phone_number !== msg.from && msg.from !== value.metadata?.phone_number_id;

          const parsed: WhatsAppMessage = {
            messageId: msg.id,
            chatId: msg.from, // In groups, this is the group chat id
            senderId: msg.from,
            senderName: contact.profile?.name ?? 'Unknown',
            timestamp: parseInt(msg.timestamp, 10),
            isGroup: false, // Will be refined below
            chatType: 'dm',  // Will be refined below if group detected
            text: undefined,
            imageId: undefined,
            imageMimeType: undefined,
            mentions: undefined,
          };

          // Check if group message via context
          if (msg.context?.from) {
            parsed.quotedMessageId = msg.context.id;
          }

          // Handle text messages
          if (msg.type === 'text' && msg.text?.body) {
            parsed.text = msg.text.body;

            // Extract mentions from text
            const mentionPattern = /@(\d+)/g;
            const mentions: string[] = [];
            let match: RegExpExecArray | null;
            while ((match = mentionPattern.exec(msg.text.body)) !== null) {
              mentions.push(match[1]);
            }
            if (mentions.length > 0) {
              parsed.mentions = mentions;
            }
          }

          // Handle image messages
          if (msg.type === 'image' && msg.image) {
            parsed.imageId = msg.image.id;
            parsed.imageMimeType = msg.image.mime_type;
            if (msg.image.caption) {
              parsed.text = msg.image.caption;
            }
          }

          // Detect group chat: check the actual "from" field
          // In WhatsApp Cloud API, group messages have a different structure
          // The chatId for groups comes via the participant field if available
          if ((msg as unknown as Record<string, unknown>).participant) {
            parsed.isGroup = true;
            parsed.chatType = 'group';
            parsed.senderId = (msg as unknown as Record<string, string>).participant;
            // chatId stays as the group ID (msg.from in group context is the group id)
          }

          messages.push(parsed);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to parse WhatsApp webhook payload');
  }

  return messages;
}

// ── WhatsApp Cloud API webhook types (partial) ──

interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

interface WebhookEntry {
  id?: string;
  changes?: WebhookChange[];
}

interface WebhookChange {
  field?: string;
  value?: WebhookValue;
}

interface WebhookValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{
    wa_id: string;
    profile?: { name?: string };
  }>;
  messages?: WebhookMessage[];
}

interface WebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  context?: { from?: string; id?: string };
}
