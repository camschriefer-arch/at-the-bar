/**
 * How long a status is believed without the phone that set it saying anything
 * more. Mirrors stale_status_cutoff() in the database, which is what friends'
 * screens are filtered by; this copy is for the one status the client reads
 * straight out of the table, its own.
 */
export const STALE_STATUS_MS = 12 * 60 * 60 * 1000;

/**
 * `updatedAt` is the last time the phone said anything about the status, not
 * when the visit began, so a night that ran long is not stale while a phone
 * that went quiet at closing time is.
 */
export function isStaleStatus(updatedAt: string | null, now = Date.now()): boolean {
  if (!updatedAt) return false;
  const updated = Date.parse(updatedAt);
  return Number.isFinite(updated) && now - updated > STALE_STATUS_MS;
}
