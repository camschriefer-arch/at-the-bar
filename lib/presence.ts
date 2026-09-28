/**
 * How long a status is believed without the phone that set it saying anything
 * more. Mirrors stale_status_cutoff() in the database, which is what friends'
 * screens are filtered by; this copy is for the one status the client reads
 * straight out of the table, its own.
 */
export const STALE_STATUS_MS = 12 * 60 * 60 * 1000;

export function isStaleStatus(arrivedAt: string | null, now = Date.now()): boolean {
  if (!arrivedAt) return false;
  const arrived = Date.parse(arrivedAt);
  return Number.isFinite(arrived) && now - arrived > STALE_STATUS_MS;
}
