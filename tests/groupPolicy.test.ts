/**
 * Standalone scenario tests for groupPolicy.ts
 *
 * Run with: npx tsx tests/groupPolicy.test.ts
 *
 * No test framework needed — uses plain assertions and process.exit(1) on failure.
 */

// ─── Minimal stubs for dependencies ──────────────────────────────────

// Stub the config/env module
const FAKE_BOT_NAME = 'VolaBot';

// We need to stub modules before importing the test target.
// Since we're using tsx with CommonJS, we can patch the require cache.

// Stub config/env
const envModule = require('../src/config/env');
const originalGetEnv = envModule.getEnv;
envModule.getEnv = () => ({
  ...({
    PORT: 3000,
    WHATSAPP_VERIFY_TOKEN: 'test',
    WHATSAPP_ACCESS_TOKEN: 'test',
    WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_BOT_NAME: FAKE_BOT_NAME,
    OPENAI_API_KEY: 'test',
    DATABASE_URL: 'test',
    REDIS_URL: 'test',
  }),
});

// Stub logger
const loggerModule = require('../src/utils/logger');
const noop = () => {};
const noopLogger = { debug: noop, info: noop, warn: noop, error: noop };
loggerModule.getLogger = () => noopLogger;

// ─── Now import the module under test ────────────────────────────────
import { evaluateGroupPolicy, isNoise, resetAllCooldowns, recordBotResponse, resetCooldown, containsBotMention, shouldRespondToMessage } from '../src/integrations/whatsapp/groupPolicy';
import type { WhatsAppMessage } from '../src/types/app';

// ─── Test Helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ ${testName}`);
  }
}

function makeMessage(overrides: Partial<WhatsAppMessage> = {}): WhatsAppMessage {
  return {
    messageId: 'msg-1',
    chatId: 'group-123',
    senderId: 'user-1',
    senderName: 'Alice',
    timestamp: Date.now(),
    isGroup: true,
    chatType: 'group',
    text: undefined,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

console.log('\n🧪 Group Policy Tests\n');

// Clean state
resetAllCooldowns();

// --- Noise Detection ---
console.log('Noise Detection:');
assert(isNoise(undefined) === true, 'undefined text → noise');
assert(isNoise('') === true, 'empty text → noise');
assert(isNoise('  ') === true, 'whitespace → noise');
assert(isNoise('ok') === true, '"ok" → noise');
assert(isNoise('lol') === true, '"lol" → noise');
assert(isNoise('haha') === true, '"haha" → noise');
assert(isNoise('😂') === true, 'single emoji → noise');
assert(isNoise('😂😂😂') === true, 'multiple emoji → noise');
assert(isNoise('k') === true, '"k" → noise');
assert(isNoise('?') === false, '"?" (question mark short) → NOT noise');
assert(isNoise('What about Lisbon?') === false, 'substantive question → NOT noise');
assert(isNoise('I prefer beach destinations') === false, 'preference statement → NOT noise');

// --- DM: Always respond ---
console.log('\nDirect Messages:');
const dmMsg = makeMessage({ isGroup: false, text: 'hello' });
const dmResult = evaluateGroupPolicy(dmMsg);
assert(dmResult.shouldRespond === true, 'DM → shouldRespond: true');
assert(dmResult.reason === 'direct_message', 'DM → reason: direct_message');
assert(dmResult.confidence === 1.0, 'DM → confidence: 1.0');

// --- Noise in group → ignored ---
console.log('\nGroup Noise Filtering:');
const noiseMsg = makeMessage({ text: 'lol' });
const noiseResult = evaluateGroupPolicy(noiseMsg);
assert(noiseResult.shouldRespond === false, 'Noise "lol" → shouldRespond: false');
assert(noiseResult.ignoreReason === 'noise', 'Noise "lol" → ignoreReason: noise');

const emojiMsg = makeMessage({ text: '😂😂' });
const emojiResult = evaluateGroupPolicy(emojiMsg);
assert(emojiResult.shouldRespond === false, 'Emoji-only → shouldRespond: false');

// --- @mention → respond ---
console.log('\n@Mention Detection:');
resetAllCooldowns();
const mentionMsg = makeMessage({
  text: '@12345 find me cheap flights',
  mentions: ['12345'],
});
const mentionResult = evaluateGroupPolicy(mentionMsg);
assert(mentionResult.shouldRespond === true, '@mention → shouldRespond: true');
assert(mentionResult.reason === 'mention', '@mention → reason: mention');
assert(mentionResult.confidence === 1.0, '@mention → confidence: 1.0');

// --- Bot name in text → respond ---
console.log('\nBot Name Detection:');
resetAllCooldowns();
const nameStartMsg = makeMessage({ text: 'VolaBot, find flights to Barcelona' });
const nameStartResult = evaluateGroupPolicy(nameStartMsg);
assert(nameStartResult.shouldRespond === true, 'Bot name at start → shouldRespond: true');
assert(nameStartResult.reason === 'name_address', 'Bot name at start → reason: name_address');

const nameEndMsg = makeMessage({ text: 'Can you check prices VolaBot?' });
const nameEndResult = evaluateGroupPolicy(nameEndMsg);
assert(nameEndResult.shouldRespond === true, 'Bot name at end → shouldRespond: true');

const greetingMsg = makeMessage({ text: 'Hey VolaBot what flights are cheap?' });
const greetingResult = evaluateGroupPolicy(greetingMsg);
assert(greetingResult.shouldRespond === true, 'Greeting + bot name → shouldRespond: true');

// --- Text cleaned of bot references ---
console.log('\nText Cleaning:');
resetAllCooldowns();
const cleanMsg = makeMessage({ text: '@VolaBot find flights to Rome' });
const cleanResult = evaluateGroupPolicy(cleanMsg);
assert(cleanResult.cleanedText === 'find flights to Rome', 'Bot name stripped from cleaned text');

// --- Quoted reply to bot → respond ---
console.log('\nQuoted Reply to Bot:');
resetAllCooldowns();
const quotedBotMsg = makeMessage({
  text: 'What about Lisbon instead?',
  quotedMessageId: 'bot-msg-1',
  quotedMessageAuthorIsBot: true,
});
const quotedBotResult = evaluateGroupPolicy(quotedBotMsg);
assert(quotedBotResult.shouldRespond === true, 'Quoted reply to bot → shouldRespond: true');
assert(quotedBotResult.reason === 'quoted_reply_to_bot', 'Quoted reply to bot → reason: quoted_reply_to_bot');
assert(quotedBotResult.confidence === 0.9, 'Quoted reply to bot → confidence: 0.9');

// --- Quoted reply to bot with noise → ignored ---
const quotedBotNoiseMsg = makeMessage({
  text: 'ok',
  quotedMessageId: 'bot-msg-1',
  quotedMessageAuthorIsBot: true,
});
const quotedBotNoiseResult = evaluateGroupPolicy(quotedBotNoiseMsg);
assert(quotedBotNoiseResult.shouldRespond === false, 'Quoted reply to bot "ok" → shouldRespond: false');
assert(quotedBotNoiseResult.ignoreReason === 'noise', 'Quoted reply to bot noise → correct ignoreReason');

// --- Quoted reply to non-bot with travel keyword → respond ---
console.log('\nQuoted Reply (Non-Bot):');
resetAllCooldowns();
const quotedTravelMsg = makeMessage({
  text: 'What about flight prices for May?',
  quotedMessageId: 'user-msg-1',
});
const quotedTravelResult = evaluateGroupPolicy(quotedTravelMsg);
assert(quotedTravelResult.shouldRespond === true, 'Quoted reply + travel keyword → shouldRespond: true');
assert(quotedTravelResult.reason === 'quoted_reply', 'Quoted reply + travel → reason: quoted_reply');

// --- Quoted reply without travel context → ignored ---
const quotedNoTravelMsg = makeMessage({
  text: 'nice',
  quotedMessageId: 'user-msg-1',
});
const quotedNoTravelResult = evaluateGroupPolicy(quotedNoTravelMsg);
assert(quotedNoTravelResult.shouldRespond === false, 'Quoted reply "nice" → shouldRespond: false');

// --- Image without mention → ignored ---
console.log('\nImage Handling:');
resetAllCooldowns();
const imageNoMentionMsg = makeMessage({
  text: 'Check this out',
  imageId: 'img-1',
});
const imageNoMentionResult = evaluateGroupPolicy(imageNoMentionMsg);
assert(imageNoMentionResult.shouldRespond === false, 'Image without bot mention → shouldRespond: false');

// --- Image with bot mention → respond ---
const imageMentionMsg = makeMessage({
  text: 'VolaBot check this booking',
  imageId: 'img-1',
});
const imageMentionResult = evaluateGroupPolicy(imageMentionMsg);
assert(imageMentionResult.shouldRespond === true, 'Image with bot mention → shouldRespond: true');
assert(imageMentionResult.reason === 'name_address', 'Image with mention → reason: name_address');

// --- Cooldown enforcement ---
console.log('\nCooldown:');
resetAllCooldowns();
const cooldownChatId = 'cooldown-test-group';
// First: no cooldown → random unaddressed message → ignored (no trigger)
const unaddressedMsg = makeMessage({ chatId: cooldownChatId, text: 'Anyone know good beaches?' });
const preResult = evaluateGroupPolicy(unaddressedMsg);
assert(preResult.shouldRespond === false, 'Unaddressed message → shouldRespond: false');

// Simulate bot response → activate cooldown
recordBotResponse(cooldownChatId);

// Another unaddressed message during cooldown → ignored with cooldown reason
const duringCooldownMsg = makeMessage({ chatId: cooldownChatId, text: 'What about beaches in Greece for summer?' });
const cooldownResult = evaluateGroupPolicy(duringCooldownMsg);
assert(cooldownResult.shouldRespond === false, 'During cooldown → shouldRespond: false');
assert(cooldownResult.ignoreReason === 'cooldown_active', 'During cooldown → ignoreReason: cooldown_active');

// But @mention during cooldown → still respond
const mentionDuringCooldownMsg = makeMessage({
  chatId: cooldownChatId,
  text: '@12345 check flights',
  mentions: ['12345'],
});
const mentionCooldownResult = evaluateGroupPolicy(mentionDuringCooldownMsg);
assert(mentionCooldownResult.shouldRespond === true, '@mention during cooldown → still responds');

// --- Default: no trigger → ignored ---
console.log('\nDefault Ignore:');
resetAllCooldowns();
const defaultMsg = makeMessage({ text: 'Anyone want to grab lunch?' });
const defaultResult = evaluateGroupPolicy(defaultMsg);
assert(defaultResult.shouldRespond === false, 'Unrelated message → shouldRespond: false');
assert(defaultResult.ignoreReason === 'no_trigger_detected', 'Unrelated → ignoreReason: no_trigger_detected');

// ─── containsBotMention() Tests ──────────────────────────────────────

console.log('\ncontainsBotMention():');
assert(containsBotMention('@VolaBot find flights') === true, '@VolaBot → true');
assert(containsBotMention('@volabot help') === true, '@volabot (lowercase) → true');
assert(containsBotMention('VolaBot, check this') === true, 'VolaBot with comma → true');
assert(containsBotMention('hey VolaBot what flights?') === true, 'hey VolaBot → true');
assert(containsBotMention('check prices VolaBot?') === true, 'VolaBot at end → true');
assert(containsBotMention('volabot') === true, 'volabot standalone → true');
assert(containsBotMention('VolaBot:') === true, 'VolaBot: → true');
assert(containsBotMention('hello world') === false, 'no mention → false');
assert(containsBotMention('check flights please') === false, 'unrelated text → false');
assert(containsBotMention('') === false, 'empty string → false');

// ─── shouldRespondToMessage() Tests ──────────────────────────────────

console.log('\nshouldRespondToMessage():');
resetAllCooldowns();
const dmShouldRespond = shouldRespondToMessage(makeMessage({ isGroup: false, chatType: 'dm', text: 'hello' }));
assert(dmShouldRespond.respond === true, 'DM → respond: true');
assert(dmShouldRespond.reason === 'direct_message', 'DM → reason: direct_message');

const groupWithMention = shouldRespondToMessage(makeMessage({ text: '@VolaBot find flights', mentions: ['123'] }));
assert(groupWithMention.respond === true, 'Group with @mention → respond: true');

const groupWithName = shouldRespondToMessage(makeMessage({ text: 'VolaBot check prices' }));
assert(groupWithName.respond === true, 'Group with bot name → respond: true');

const groupNoMention = shouldRespondToMessage(makeMessage({ text: 'Anyone want to go to Paris?' }));
assert(groupNoMention.respond === false, 'Group without mention → respond: false');

// ─── Conflict Detection & Options ────────────────────────────────────

import { detectConflicts, generateConflictOptions, buildDisagreementSummary } from '../src/agent/contextManager';
import type { TripContext, UserPreference } from '../src/types/app';

console.log('\nConflict Detection:');

const tripCtx: TripContext = {
  chatId: 'group-1',
  lastUpdated: Date.now(),
  preferences: {
    'alice': {
      userId: 'alice',
      userName: 'Alice',
      preferredDestinations: ['Crete', 'Santorini'],
      budget: '300 EUR',
      travelStyle: 'beach',
      priority: 'budget',
      updatedAt: Date.now(),
    },
    'bob': {
      userId: 'bob',
      userName: 'Bob',
      preferredDestinations: ['Barcelona'],
      budget: '600 EUR',
      travelStyle: 'city break',
      priority: 'direct flights',
      updatedAt: Date.now(),
    },
  },
};

const conflicts = detectConflicts(tripCtx);
assert(conflicts.length > 0, 'Conflicts detected between Alice and Bob');
assert(conflicts.some(c => c.field === 'budget'), 'Budget conflict detected');
assert(conflicts.some(c => c.field === 'destination'), 'Destination conflict detected');
assert(conflicts.some(c => c.field === 'travel style'), 'Travel style conflict detected');

console.log('\nOption Generation:');
const options = generateConflictOptions(conflicts, tripCtx.preferences!);
assert(options.length >= 2, 'At least 2 options generated');
assert(options.length <= 3, 'At most 3 options generated');
assert(options.some(o => o.targetUsers.includes('Alice')), 'Option targets Alice');
assert(options.some(o => o.targetUsers.includes('Bob')), 'Option targets Bob');
// Compromise option should target both
const compromiseOpt = options.find(o => o.label.includes('C'));
if (compromiseOpt) {
  assert(compromiseOpt.targetUsers.length >= 2, 'Compromise targets multiple users');
}

console.log('\nDisagreement Summary:');
const summary = buildDisagreementSummary(conflicts);
assert(summary.includes('DISAGREEMENT'), 'Summary contains DISAGREEMENT header');
assert(summary.includes('Alice'), 'Summary mentions Alice');
assert(summary.includes('Bob'), 'Summary mentions Bob');

// No conflicts → empty
const noConflictCtx: TripContext = {
  chatId: 'group-2',
  lastUpdated: Date.now(),
  preferences: {
    'alice': { userId: 'alice', userName: 'Alice', budget: '300 EUR', updatedAt: Date.now() },
    'bob': { userId: 'bob', userName: 'Bob', budget: '300 EUR', updatedAt: Date.now() },
  },
};
const noConflicts = detectConflicts(noConflictCtx);
assert(noConflicts.length === 0, 'No conflicts when preferences match');

// ─── Response Formatter ──────────────────────────────────────────────

import { formatGroupOptions, formatGroupResponse } from '../src/agent/responseFormatter';

console.log('\nResponse Formatter:');
const formattedOptions = formatGroupOptions(options);
assert(formattedOptions.includes('1️⃣'), 'Formatted options include emoji numbers');
assert(formattedOptions.includes('Reply with'), 'Formatted options include call-to-action');

const shortText = 'Here are flights to Barcelona.';
assert(formatGroupResponse(shortText) === shortText, 'Short text not truncated');

const longText = 'x'.repeat(800);
const truncated = formatGroupResponse(longText);
assert(truncated.length < longText.length, 'Long text gets truncated');
assert(truncated.endsWith('...'), 'Truncated text ends with ...');

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) {
  console.log('❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
