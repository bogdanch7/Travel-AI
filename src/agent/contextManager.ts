import {
  ConversationTurn,
  TripContext,
  WhatsAppMessage,
  Intent,
  UserPreference,
  GroupConflict,
  GroupOption,
} from '../types/app';
import { getConversationHistory, saveConversationTurn } from '../store/repositories/conversationRepo';
import { getTripContext, upsertTripContext } from '../store/repositories/tripContextRepo';
import { getLogger } from '../utils/logger';
import { nowEpoch } from '../utils/time';
import OpenAI from 'openai';
import { normalizeCity } from '../utils/flightParser';

const MAX_CONTEXT_TURNS = 10;

// ─── Context Loading ─────────────────────────────────────────────────

/**
 * Load the full context for an incoming message:
 * - conversation history
 * - trip context (shared draft + per-user preferences)
 * - detected conflicts between users
 * - format as OpenAI messages
 *
 * For group chats, each history turn that originated from a user is
 * prefixed with [SenderName] so the model can track who said what.
 */
export async function loadContext(message: WhatsAppMessage): Promise<{
  conversationHistory: ConversationTurn[];
  tripContext: TripContext | null;
  openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}> {
  const logger = getLogger();

  const [conversationHistory, tripContext] = await Promise.all([
    getConversationHistory(message.chatId, MAX_CONTEXT_TURNS),
    getTripContext(message.chatId),
  ]);

  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  // Add conversation history
  for (const turn of conversationHistory) {
    openaiMessages.push({
      role: turn.role,
      content: turn.content,
    });
  }

  // Inject trip context + group state as a system message
  if (tripContext && Object.keys(tripContext).length > 1) {
    const contextBlock = buildContextInjection(tripContext, message.isGroup);
    openaiMessages.push({
      role: 'system',
      content: contextBlock,
    });
  }

  logger.debug(
    {
      chatId: message.chatId,
      historyTurns: conversationHistory.length,
      hasTripContext: !!tripContext,
      userCount: tripContext?.preferences ? Object.keys(tripContext.preferences).length : 0,
    },
    'Context loaded',
  );

  return { conversationHistory, tripContext, openaiMessages };
}

// ─── Per-User Preference Management ──────────────────────────────────

/**
 * Record or update a specific user's preferences within a group trip context.
 *
 * This merges new preferences into the user's existing overlay, preserving
 * fields they haven't changed. It does NOT collapse preferences into the
 * shared draft — that stays as the common denominator.
 */
export async function upsertUserPreference(
  chatId: string,
  userId: string,
  userName: string,
  patch: Partial<Omit<UserPreference, 'userId' | 'userName' | 'updatedAt'>>,
): Promise<TripContext> {
  const logger = getLogger();
  const existing = await getTripContext(chatId);

  const currentPrefs = existing?.preferences ?? {};
  const currentUser = currentPrefs[userId] ?? {
    userId,
    userName,
    updatedAt: nowEpoch(),
  };

  // Merge only non-undefined fields
  const updated: UserPreference = {
    ...currentUser,
    userName, // Always update name in case it changed
    updatedAt: nowEpoch(),
  };

  if (patch.preferredDestinations?.length) {
    updated.preferredDestinations = patch.preferredDestinations.map(d => normalizeCity(d) || d);
  }
  if (patch.budget) updated.budget = patch.budget;
  if (patch.origin) updated.origin = normalizeCity(patch.origin) || patch.origin;
  if (patch.departureDate) updated.departureDate = patch.departureDate;
  if (patch.returnDate) updated.returnDate = patch.returnDate;
  if (patch.travelStyle) updated.travelStyle = patch.travelStyle;
  if (patch.priority) updated.priority = patch.priority;
  if (patch.notes) updated.notes = patch.notes;

  currentPrefs[userId] = updated;

  logger.info(
    { chatId, userId, userName, fieldsUpdated: Object.keys(patch) },
    'User preference upserted',
  );

  return upsertTripContext(chatId, { preferences: currentPrefs });
}

// ─── Conflict Detection ──────────────────────────────────────────────

/**
 * Detect conflicting preferences among group members.
 *
 * Returns a list of fields where users disagree, with each user's position.
 * Only surfaces real conflicts — if 3 users agree on beach but 1 wants city,
 * that's a conflict. If everyone agrees, no conflict is reported.
 */
export function detectConflicts(tripContext: TripContext): GroupConflict[] {
  const prefs = tripContext.preferences;
  if (!prefs || Object.keys(prefs).length < 2) return [];

  const users = Object.values(prefs);
  const conflicts: GroupConflict[] = [];

  // Check each comparable field
  checkFieldConflict('budget', users, (u) => u.budget, conflicts);
  checkFieldConflict('destination', users, (u) => u.preferredDestinations?.join(', '), conflicts);
  checkFieldConflict('origin', users, (u) => u.origin, conflicts);
  checkFieldConflict('departure date', users, (u) => u.departureDate, conflicts);
  checkFieldConflict('return date', users, (u) => u.returnDate, conflicts);
  checkFieldConflict('travel style', users, (u) => u.travelStyle, conflicts);
  checkFieldConflict('priority', users, (u) => u.priority, conflicts);

  return conflicts;
}

function checkFieldConflict(
  fieldName: string,
  users: UserPreference[],
  extractor: (u: UserPreference) => string | undefined,
  conflicts: GroupConflict[],
): void {
  const withValues = users
    .map((u) => ({ userName: u.userName, value: extractor(u) }))
    .filter((entry): entry is { userName: string; value: string } => !!entry.value);

  if (withValues.length < 2) return; // Not enough data to conflict

  const uniqueValues = new Set(withValues.map((e) => e.value.toLowerCase().trim()));
  if (uniqueValues.size > 1) {
    conflicts.push({
      field: fieldName,
      positions: withValues.map((e) => ({ userName: e.userName, value: e.value })),
    });
  }
}

// ─── Option Generation from Conflicts ────────────────────────────────

/**
 * Generate 2–3 structured options from detected conflicts.
 *
 * Each option is mapped to the user(s) whose priorities it satisfies.
 * The last option is always a compromise attempt.
 */
export function generateConflictOptions(
  conflicts: GroupConflict[],
  preferences: Record<string, UserPreference>,
): GroupOption[] {
  if (conflicts.length === 0) return [];

  const users = Object.values(preferences);
  const options: GroupOption[] = [];

  // Group users by their primary differentiator (first conflict field)
  const primaryConflict = conflicts[0];
  const valueGroups = new Map<string, string[]>();

  for (const pos of primaryConflict.positions) {
    const key = pos.value.toLowerCase().trim();
    const existing = valueGroups.get(key) ?? [];
    existing.push(pos.userName);
    valueGroups.set(key, existing);
  }

  // Create one option per distinct position (max 2)
  let optionIndex = 0;
  for (const [value, userNames] of valueGroups) {
    if (optionIndex >= 2) break;
    const label = `Option ${String.fromCharCode(65 + optionIndex)}`; // A, B

    // Find the full preference for the first user in this group
    const representativeUser = users.find(
      (u) => userNames.includes(u.userName),
    );

    const descParts: string[] = [`${primaryConflict.field}: ${value}`];
    if (representativeUser?.travelStyle) descParts.push(`style: ${representativeUser.travelStyle}`);
    if (representativeUser?.budget) descParts.push(`budget: ${representativeUser.budget}`);

    options.push({
      label,
      description: `${descParts.join(', ')} — fits ${userNames.join(' & ')}'s priorities`,
      targetUsers: userNames,
      estimatedBudget: representativeUser?.budget,
    });
    optionIndex++;
  }

  // Add a compromise option if we have 2+ real options
  if (options.length >= 2) {
    const allUserNames = users.map((u) => u.userName);
    options.push({
      label: `Option ${String.fromCharCode(65 + options.length)}`,
      description: `Compromise — balances everyone's preferences`,
      targetUsers: allUserNames,
    });
  }

  return options;
}

// ─── Disagreement Summary Builder ────────────────────────────────────

/**
 * Build a plain-English disagreement summary from conflicts.
 */
export function buildDisagreementSummary(
  conflicts: GroupConflict[],
): string {
  if (conflicts.length === 0) return '';

  const lines: string[] = ['DISAGREEMENT SUMMARY:'];

  for (const c of conflicts) {
    const parts = c.positions.map((p) => `${p.userName} prefers "${p.value}"`);
    lines.push(`• ${c.field}: ${parts.join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Context Injection Builder ───────────────────────────────────────

/**
 * Build a context injection string for the OpenAI system message.
 *
 * For DMs: simple summary of the trip draft.
 * For groups: shared draft + per-user overlays + disagreement summary
 *   + pre-generated options + conflict handling instructions.
 */
function buildContextInjection(ctx: TripContext, isGroup: boolean): string {
  const parts: string[] = ['CURRENT TRIP CONTEXT:'];

  // Shared draft
  const sharedFields: string[] = [];
  if (ctx.origin) sharedFields.push(`Origin: ${ctx.origin}`);
  if (ctx.destinations?.length) sharedFields.push(`Destinations: ${ctx.destinations.join(', ')}`);
  if (ctx.departureDate) sharedFields.push(`Departure: ${ctx.departureDate}`);
  if (ctx.returnDate) sharedFields.push(`Return: ${ctx.returnDate}`);
  if (ctx.passengers) sharedFields.push(`Passengers: ${ctx.passengers}`);
  if (ctx.budget) sharedFields.push(`Budget: ${ctx.budget}`);
  if (ctx.flexibility) sharedFields.push(`Flexibility: ${ctx.flexibility}`);
  if (ctx.baggage) sharedFields.push(`Baggage: ${ctx.baggage}`);
  if (ctx.tripType) sharedFields.push(`Trip type: ${ctx.tripType}`);
  if (ctx.notes) sharedFields.push(`Notes: ${ctx.notes}`);

  if (sharedFields.length > 0) {
    parts.push('Shared draft:');
    parts.push(sharedFields.join('\n'));
  }

  // Per-user preferences (group only)
  if (isGroup && ctx.preferences && Object.keys(ctx.preferences).length > 0) {
    parts.push('');
    parts.push('PER-USER PREFERENCES:');

    for (const pref of Object.values(ctx.preferences)) {
      const userFields: string[] = [`${pref.userName}:`];
      if (pref.preferredDestinations?.length) userFields.push(`  destinations: ${pref.preferredDestinations.join(', ')}`);
      if (pref.budget) userFields.push(`  budget: ${pref.budget}`);
      if (pref.origin) userFields.push(`  origin: ${pref.origin}`);
      if (pref.departureDate) userFields.push(`  dates: ${pref.departureDate}${pref.returnDate ? ` → ${pref.returnDate}` : ''}`);
      if (pref.travelStyle) userFields.push(`  style: ${pref.travelStyle}`);
      if (pref.priority) userFields.push(`  priority: ${pref.priority}`);
      if (pref.notes) userFields.push(`  notes: ${pref.notes}`);
      parts.push(userFields.join('\n'));
    }

    // Detect conflicts, generate summary + options
    const conflicts = detectConflicts(ctx);
    if (conflicts.length > 0) {
      parts.push('');
      parts.push('⚠️ CONFLICTS DETECTED:');
      for (const c of conflicts) {
        const positions = c.positions.map((p) => `${p.userName} wants "${p.value}"`).join(', ');
        parts.push(`• ${c.field}: ${positions}`);
      }

      // Add disagreement summary
      parts.push('');
      parts.push(buildDisagreementSummary(conflicts));

      // Add pre-generated options
      const options = generateConflictOptions(conflicts, ctx.preferences);
      if (options.length > 0) {
        parts.push('');
        parts.push('PRE-GENERATED OPTIONS (adapt and present these):');
        for (const opt of options) {
          parts.push(`${opt.label}: ${opt.description}${opt.estimatedBudget ? ` [budget: ${opt.estimatedBudget}]` : ''}`);
        }
      }

      parts.push('');
      parts.push('CONFLICT HANDLING RULES:');
      parts.push('• NEVER collapse conflicting preferences into a single answer');
      parts.push('• ALWAYS present 2-3 labeled options mapped to user names');
      parts.push('• Frame as "Option A (fits X\'s priority)", "Option B (fits Y\'s priority)", "Option C (compromise)"');
      parts.push('• Summarize the disagreement before presenting options');
      parts.push('• End with a call-to-action: ask the group to pick or vote');
    }
  }

  return parts.join('\n');
}

// ─── CRUD Passthroughs ───────────────────────────────────────────────

export async function saveTurn(
  chatId: string,
  role: 'user' | 'assistant',
  content: string,
  intent?: Intent,
  toolsUsed?: string[],
): Promise<void> {
  await saveConversationTurn(chatId, role, content, intent, toolsUsed);
}

export async function updateContext(chatId: string, patch: Partial<TripContext>): Promise<TripContext> {
  const normalizedPatch: Partial<TripContext> = { ...patch };
  if (patch.origin) normalizedPatch.origin = normalizeCity(patch.origin) || patch.origin;
  if (patch.destinations) {
    normalizedPatch.destinations = patch.destinations.map(d => normalizeCity(d) || d);
  }
  return upsertTripContext(chatId, normalizedPatch);
}

export async function getContext(chatId: string): Promise<TripContext | null> {
  return getTripContext(chatId);
}
