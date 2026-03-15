/**
 * Group / Mention Trigger Policy for Vola Travel AI
 *
 * PLATFORM CONSTRAINT:
 * Twilio does not provide native support for real user-created WhatsApp groups.
 * A Twilio WhatsApp business number cannot reliably participate in normal WhatsApp
 * groups as a full member. Therefore this module implements a mention-based trigger
 * policy as a practical workaround:
 *
 * - Direct messages (DMs): always respond
 * - Group-like contexts: respond only when the bot is explicitly mentioned or addressed
 *
 * This satisfies the challenge requirement: "only respond when tagged or clearly addressed"
 * while keeping the production DM path stable.
 *
 * Reusable exports:
 * - `containsBotMention(text)` — standalone check for bot mention patterns
 * - `shouldRespondToMessage(message)` — clean top-level API for trigger decisions
 * - `evaluateGroupPolicy(message)` — full policy evaluation with detailed metadata
 */
import { WhatsAppMessage } from '../../types/app';
import { getEnv } from '../../config/env';
import { getLogger } from '../../utils/logger';

// ─── Decision Types ──────────────────────────────────────────────────

export type TriggerReason =
  | 'direct_message'
  | 'mention'
  | 'name_address'
  | 'quoted_reply'
  | 'quoted_reply_to_bot'
  | 'image_with_mention'
  | 'travel_keyword_after_recent_bot_turn';

export interface GroupPolicyDecision {
  shouldRespond: boolean;
  reason: TriggerReason | 'ignored';
  cleanedText?: string;
  /** Why the message was ignored (only set when shouldRespond=false) */
  ignoreReason?: string;
  /** 0–1 confidence that the message is genuinely directed at the bot */
  confidence: number;
}

// ─── Cooldown Tracking ───────────────────────────────────────────────

/** In-memory per-chat cooldown: chatId → timestamp of last bot response */
const lastResponseTimestamps = new Map<string, number>();

const COOLDOWN_MS = 60_000; // 60 seconds

/**
 * Record that the bot just responded in a chat.
 * Called by the webhook after sending a reply.
 */
export function recordBotResponse(chatId: string): void {
  lastResponseTimestamps.set(chatId, Date.now());
}

/** Check if the cooldown period has elapsed for unaddressed messages */
function isCooldownActive(chatId: string): boolean {
  const last = lastResponseTimestamps.get(chatId);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

/** Reset cooldown for a chat (useful for testing) */
export function resetCooldown(chatId: string): void {
  lastResponseTimestamps.delete(chatId);
}

/** Clear all cooldowns (useful for testing) */
export function resetAllCooldowns(): void {
  lastResponseTimestamps.clear();
}

// ─── Noise Detection ─────────────────────────────────────────────────

const NOISE_PATTERNS: RegExp[] = [
  /^[\p{Emoji}\s]+$/u,                          // pure emoji / whitespace
  /^(lol|lmao|haha|hehe|ok|k|yes|no|da|nu|mm+|hmm+|ah+|oh+|wow|nice|cool|true|yep|yup|nah|nope|sure|thx|ty|np|gg|brb|omg|wtf|ikr|idk|rip|f)$/i,
  /^\.{1,3}$/,                                   // just dots
  /^!{1,3}$/,                                    // just exclamations
];

/**
 * Returns true if the message is likely noise — reactions, single-word
 * fillers, pure emoji — and should NOT trigger a bot response.
 */
export function isNoise(text: string | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length < 3 && !trimmed.includes('?')) return true;
  return NOISE_PATTERNS.some((p) => p.test(trimmed));
}

// ─── Bot-address patterns ────────────────────────────────────────────

const GREETING_PREFIXES = ['hey', 'hi', 'hello', 'yo', 'hei', 'buna', 'salut'];

function buildAddressPatterns(botName: string): RegExp[] {
  const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    // Exact @mention by name
    new RegExp(`@${escaped}\\b`, 'i'),
    // Greeting + bot name anywhere
    ...GREETING_PREFIXES.map(g => new RegExp(`^${g}\\s+${escaped}\\b`, 'i')),
    // Bot name at start of sentence
    new RegExp(`^${escaped}[,:]?\\s`, 'i'),
    // Bot name at end ("can you check, VolaBot?")
    new RegExp(`\\b${escaped}[?!.,]*$`, 'i'),
  ];
}

// ─── Reusable Mention Detection ──────────────────────────────────────

/**
 * Standalone check: does the given text contain an explicit bot mention?
 *
 * Supports patterns like:
 * - @VolaBot, @volabot
 * - VolaBot, volabot (as substring)
 * - "hey VolaBot", "VolaBot:", "check this VolaBot?"
 *
 * This is a reusable utility — it does NOT consider message context,
 * noise filtering, or cooldowns. For full policy decisions, use
 * `shouldRespondToMessage()` or `evaluateGroupPolicy()` instead.
 */
export function containsBotMention(text: string): boolean {
  const env = getEnv();
  const botName = env.WHATSAPP_BOT_NAME;
  const botNameLower = botName.toLowerCase();
  const textLower = text.toLowerCase();

  // Quick substring check
  if (textLower.includes(botNameLower)) return true;

  // Pattern-based check
  const patterns = buildAddressPatterns(botName);
  return patterns.some(p => p.test(text));
}

/**
 * Top-level trigger decision: should the bot respond to this message?
 *
 * Rules:
 * - DMs (isGroup === false): always respond
 * - Groups: respond only if the bot is explicitly mentioned or addressed
 *
 * Returns a simple { respond, reason } object for easy consumption.
 * For full metadata (confidence, cleanedText, etc.), use `evaluateGroupPolicy()`.
 */
export function shouldRespondToMessage(message: WhatsAppMessage): { respond: boolean; reason: string } {
  const decision = evaluateGroupPolicy(message);
  return {
    respond: decision.shouldRespond,
    reason: decision.shouldRespond ? decision.reason : (decision.ignoreReason ?? 'ignored'),
  };
}

// ─── Travel keywords (for quoted-reply context awareness) ────────────

const TRAVEL_KEYWORDS = [
  'flight', 'fly', 'book', 'trip', 'travel', 'hotel', 'price',
  'cheap', 'destination', 'airport', 'airline', 'ticket', 'deal',
  'vacation', 'holiday', 'beach', 'mountain', 'budget', 'dates',
  'april', 'may', 'june', 'july', 'august', 'september',
  'weekend', 'nights', 'passengers', 'baggage', 'direct',
  'zbor', 'bilet', 'calatorie', 'vacanta', 'pret', // Romanian
];

function hasAnyTravelKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return TRAVEL_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Main Policy Evaluator ───────────────────────────────────────────

/**
 * Decide whether the bot should respond to a group chat message.
 *
 * Trigger hierarchy (first match wins):
 * 1. DM → always respond
 * 2. Noise filter → reject pure noise regardless of other signals
 * 3. @mention or bot phone number in mentions[] → respond (confidence 1.0)
 * 4. Bot name addressed in text → respond (confidence 0.95)
 * 5. Quoted reply to a bot message → respond if substantive (confidence 0.9)
 * 6. Quoted reply to any message + travel keyword → respond (confidence 0.7)
 * 7. Image + caption that addresses the bot → respond (confidence 0.9)
 * 8. Cooldown-gated: travel keyword alone → ignored during cooldown
 * 9. Everything else → ignore
 *
 * The cleaned text has the bot name/mention stripped so the agent
 * sees only the user's actual question.
 */
export function evaluateGroupPolicy(message: WhatsAppMessage): GroupPolicyDecision {
  const logger = getLogger();
  const env = getEnv();
  const botName = env.WHATSAPP_BOT_NAME;
  const botNameLower = botName.toLowerCase();

  // ── DMs: always respond ──────────────────────────────────────────
  if (!message.isGroup) {
    return { shouldRespond: true, reason: 'direct_message', cleanedText: message.text, confidence: 1.0 };
  }

  const text = message.text ?? '';
  const textLower = text.toLowerCase();

  // ── 0. Noise filter — reject before any trigger logic ────────────
  // Exception: if the noise message explicitly @mentions, still check below
  const mentionPresent = message.mentions && message.mentions.length > 0;
  const namePresent = textLower.includes(botNameLower);

  if (isNoise(text) && !mentionPresent && !namePresent) {
    return {
      shouldRespond: false,
      reason: 'ignored',
      ignoreReason: 'noise',
      confidence: 0,
    };
  }

  // ── 1. WhatsApp @mention (phone number in mentions array) ────────
  if (mentionPresent) {
    logger.debug({ chatId: message.chatId, sender: message.senderName }, 'Group trigger: @mention');
    return {
      shouldRespond: true,
      reason: 'mention',
      cleanedText: stripBotReferences(text, botName),
      confidence: 1.0,
    };
  }

  // ── 2. Bot name addressed in text ────────────────────────────────
  const addressPatterns = buildAddressPatterns(botName);
  for (const pattern of addressPatterns) {
    if (pattern.test(text)) {
      logger.debug({ chatId: message.chatId, sender: message.senderName, pattern: pattern.source }, 'Group trigger: name address');
      return {
        shouldRespond: true,
        reason: 'name_address',
        cleanedText: stripBotReferences(text, botName),
        confidence: 0.95,
      };
    }
  }

  // Also check if the raw text simply contains the bot name (lenient fallback)
  if (namePresent && text.length < 300) {
    logger.debug({ chatId: message.chatId, sender: message.senderName }, 'Group trigger: name substring');
    return {
      shouldRespond: true,
      reason: 'name_address',
      cleanedText: stripBotReferences(text, botName),
      confidence: 0.85,
    };
  }

  // ── 3. Quoted reply to a BOT message ─────────────────────────────
  if (message.quotedMessageId && message.quotedMessageAuthorIsBot) {
    // Someone replied directly to a bot message — implicit address.
    // Still require some substance to avoid reacting to "ok" or "👍"
    if (!isNoise(text)) {
      logger.debug({ chatId: message.chatId, sender: message.senderName }, 'Group trigger: quoted reply to bot');
      return {
        shouldRespond: true,
        reason: 'quoted_reply_to_bot',
        cleanedText: text,
        confidence: 0.9,
      };
    }
    return {
      shouldRespond: false,
      reason: 'ignored',
      ignoreReason: 'quoted_reply_to_bot_noise',
      confidence: 0,
    };
  }

  // ── 4. Quoted reply to any message + travel context ──────────────
  if (message.quotedMessageId) {
    if (hasAnyTravelKeyword(text) || text.includes('?') || text.length > 20) {
      logger.debug({ chatId: message.chatId, sender: message.senderName }, 'Group trigger: quoted reply with travel context');
      return {
        shouldRespond: true,
        reason: 'quoted_reply',
        cleanedText: text,
        confidence: 0.7,
      };
    }
    return {
      shouldRespond: false,
      reason: 'ignored',
      ignoreReason: 'quoted_reply_no_travel_context',
      confidence: 0,
    };
  }

  // ── 5. Image with bot mention in caption ─────────────────────────
  if (message.imageId) {
    if (textLower.includes(botNameLower)) {
      return {
        shouldRespond: true,
        reason: 'image_with_mention',
        cleanedText: stripBotReferences(text, botName),
        confidence: 0.9,
      };
    }
    return {
      shouldRespond: false,
      reason: 'ignored',
      ignoreReason: 'unaddressed_group_image',
      confidence: 0,
    };
  }

  // ── 6. Cooldown gate — avoid spamming on ambient travel chatter ──
  if (isCooldownActive(message.chatId)) {
    logger.debug({ chatId: message.chatId, sender: message.senderName }, 'Group: ignored (cooldown active)');
    return {
      shouldRespond: false,
      reason: 'ignored',
      ignoreReason: 'cooldown_active',
      confidence: 0,
    };
  }

  // ── Default: ignore ──────────────────────────────────────────────
  logger.debug({ chatId: message.chatId, sender: message.senderName }, 'Group: ignored (no trigger)');
  return {
    shouldRespond: false,
    reason: 'ignored',
    ignoreReason: 'no_trigger_detected',
    confidence: 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Strip all variations of bot name/mention from text so the agent
 * sees only the user's actual content.
 */
function stripBotReferences(text: string, botName: string): string {
  let cleaned = text;
  // Remove @phone-number mentions
  cleaned = cleaned.replace(/@\d+/g, '');
  // Remove @BotName
  const namePattern = new RegExp(`@?${botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,:]?`, 'gi');
  cleaned = cleaned.replace(namePattern, '');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned || text; // Fallback to original if fully stripped
}
