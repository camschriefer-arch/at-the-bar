/** Accepts a bare code or a whole invite link pasted out of a text message. */
export function inviteToken(input: string): string {
  const pasted = input.trim();
  return pasted.match(/[?&]token=([^&\s]+)/)?.[1] ?? pasted;
}
