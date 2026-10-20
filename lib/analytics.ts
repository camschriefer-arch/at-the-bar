import { eventRow, type AppEvent, type EventDetail } from './events.ts';
import { supabase } from './supabase';

/**
 * Records an event, and never gets in the way of whatever the user was doing:
 * a failed insert, a signed-out session or no network at all are all swallowed.
 * Losing a measurement is not worth an error message, and callers are expected
 * not to wait on this.
 */
export async function logEvent(event: AppEvent, detail: EventDetail = {}): Promise<void> {
  try {
    await supabase.from('app_events').insert(eventRow(event, detail));
  } catch {
    // Measuring the app must not be able to break it.
  }
}
