import { query } from '../postgres';
import { AuditEntry, Intent } from '../../types/app';

export async function logAuditEntry(entry: AuditEntry): Promise<void> {
  await query(
    `INSERT INTO audit_log (correlation_id, chat_id, user_id, intent, tool_name, tool_args, tool_latency_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.correlationId,
      entry.chatId,
      entry.userId,
      entry.intent,
      entry.toolName ?? null,
      entry.toolArgs ? JSON.stringify(entry.toolArgs) : null,
      entry.toolLatencyMs ?? null,
      entry.error ?? null,
    ],
  );
}

export async function getAuditEntries(chatId: string, limit: number = 50): Promise<AuditEntry[]> {
  const rows = await query<{
    correlation_id: string;
    chat_id: string;
    user_id: string;
    intent: string;
    tool_name: string | null;
    tool_args: Record<string, unknown> | null;
    tool_latency_ms: number | null;
    error: string | null;
    created_at: string;
  }>(
    `SELECT correlation_id, chat_id, user_id, intent, tool_name, tool_args, tool_latency_ms, error, created_at
     FROM audit_log
     WHERE chat_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [chatId, limit],
  );

  return rows.map((row) => ({
    correlationId: row.correlation_id,
    chatId: row.chat_id,
    userId: row.user_id,
    intent: row.intent as Intent,
    toolName: row.tool_name ?? undefined,
    toolArgs: row.tool_args ?? undefined,
    toolLatencyMs: row.tool_latency_ms ?? undefined,
    error: row.error ?? undefined,
    timestamp: new Date(row.created_at).getTime(),
  }));
}
