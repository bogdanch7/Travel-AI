/** Truncate text to a max length with ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/** Clean up a WhatsApp message by trimming and normalizing whitespace */
export function cleanMessage(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Format a price for display */
export function formatPrice(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

/** Remove bot mention from message text */
export function removeBotMention(text: string, botName: string): string {
  const pattern = new RegExp(`@${botName}\\b`, 'gi');
  return text.replace(pattern, '').trim();
}

/** Check if a string looks like it contains a question */
export function isQuestion(text: string): boolean {
  return text.includes('?') || /^(what|where|when|how|who|which|can|do|does|is|are|will|would|should|could)\b/i.test(text);
}

/** Sanitize for safe logging (strip potential secrets) */
export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ['token', 'secret', 'password', 'key', 'authorization'];
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (sensitive.some((s) => k.toLowerCase().includes(s))) {
      result[k] = '***REDACTED***';
    } else {
      result[k] = v;
    }
  }
  return result;
}
