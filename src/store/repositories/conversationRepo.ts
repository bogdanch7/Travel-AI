import { query } from '../postgres';
import { ConversationTurn, Intent } from '../../types/app';

const MAX_HISTORY_TURNS = 20;

export async function saveConversationTurn(
  chatId: string,
  role: 'user' | 'assistant',
  content: string,
  intent?: Intent,
  toolsUsed?: string[],
): Promise<void> {
  await query(
    `INSERT INTO conversations (chat_id, role, content, intent, tools_used)
     VALUES ($1, $2, $3, $4, $5)`,
    [chatId, role, content, intent ?? null, toolsUsed ?? null],
  );
}

export async function getConversationHistory(
  chatId: string,
  limit: number = MAX_HISTORY_TURNS,
): Promise<ConversationTurn[]> {
  const rows = await query<{
    role: string;
    content: string;
    intent: string | null;
    tools_used: string[] | null;
    created_at: string;
  }>(
    `SELECT role, content, intent, tools_used, created_at
     FROM conversations
     WHERE chat_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [chatId, limit],
  );

  return rows.reverse().map((row) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
    timestamp: new Date(row.created_at).getTime(),
    intent: (row.intent as Intent) || undefined,
    toolsUsed: row.tools_used ?? undefined,
  }));
}

export async function clearConversationHistory(chatId: string): Promise<void> {
  await query('DELETE FROM conversations WHERE chat_id = $1', [chatId]);
}
