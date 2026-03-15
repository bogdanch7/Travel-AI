/**
 * Parse a date string loosely into YYYY-MM-DD format.
 * Handles ISO dates, "April 15", "15/04/2026", etc.
 */
export function parseFlexibleDate(input: string): string | null {
  // Already ISO format
  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  // DD/MM/YYYY or DD.MM.YYYY
  const euMatch = input.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (euMatch) {
    return `${euMatch[3]}-${euMatch[2].padStart(2, '0')}-${euMatch[1].padStart(2, '0')}`;
  }

  // Try native Date parsing as last resort
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/** Format a date for human-readable WhatsApp display */
export function formatDateForWhatsApp(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Get current timestamp in epoch seconds */
export function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** Check if a date string is in the past */
export function isDateInPast(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}
