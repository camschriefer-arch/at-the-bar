/**
 * Supabase rejects with a plain PostgrestError object rather than an Error, so
 * an `instanceof Error` check throws away the message the database raised.
 */
export function failureMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const { message } = cause as { message: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }

  return fallback;
}
