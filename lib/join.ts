import { barsNear } from './barCache';
import { currentVisit, setVisitCompanions, visitCompanions } from './companions';
import { withCompanion } from './companionText';
import { allWithin } from './geo';
import { getCurrentPoint } from './locationService';
import { checkInAt } from './statusSync';
import type { CurrentVisit } from './types';

/**
 * Whether the user can say they are with someone yet. Joining hangs off the
 * user's own visit, so it needs one at the same venue first.
 */
export type JoinState =
  | { kind: 'ready'; visit: CurrentVisit }
  /** Where the user is checked in instead, if anywhere. */
  | { kind: 'needs-check-in'; at: string | null };

export async function joinState(barId: string): Promise<JoinState> {
  const mine = await currentVisit();
  if (mine && mine.bar_id === barId) return { kind: 'ready', visit: mine };
  return { kind: 'needs-check-in', at: mine?.bar_name ?? null };
}

/**
 * Checks the user in at the venue they are joining. A check-in is a claim
 * about where someone is, so tapping Join is held to the same radius as every
 * other one rather than being taken at its word.
 */
export async function checkInToJoin(barId: string): Promise<CurrentVisit> {
  const point = await getCurrentPoint();
  const near = allWithin(point, await barsNear(point));
  if (!near.some((venue) => venue.id === barId)) {
    throw new Error('You are not close enough to that bar to check in.');
  }

  await checkInAt(barId);
  const visit = await currentVisit();
  if (!visit) throw new Error('Could not check you in there.');
  return visit;
}

/**
 * Says the user is with someone on their current visit, which asks that person
 * to confirm it. Whoever the visit already names stays named: the list a join
 * sends replaces the old one.
 */
export async function joinVisit(visitId: string, userId: string): Promise<void> {
  const named = await visitCompanions(visitId);
  await setVisitCompanions(visitId, withCompanion(named, userId));
}
