import { z } from 'zod';

/** Validate and parse data with a Zod schema, returning null on failure */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/** Validate that a string is a plausible IATA airport code */
export function isValidAirportCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code.toUpperCase());
}

/** Validate that a string looks like a date (YYYY-MM-DD) */
export function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/** Validate passenger count is reasonable */
export function isValidPassengerCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 9;
}

/** Sanitize user input to prevent injection in logs/responses */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .slice(0, 2000);
}
