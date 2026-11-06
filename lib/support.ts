import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { CheckInReport } from './diagnosis';
import { supabase } from './supabase';

/**
 * Sends what a user says is wrong, with the diagnostic report they were just
 * shown. The report is the part worth having: "it did not work" is unactionable,
 * whereas the distances, the dwell clocks and whether the background task is
 * running say what the app believed at the time. It carries no coordinates,
 * only distances, so reporting a problem does not give away where anyone is.
 */
export async function reportTrouble(
  note: string,
  report: CheckInReport | null
): Promise<void> {
  const { error } = await supabase.rpc('report_trouble', {
    p_note: note,
    p_report: report,
    p_app_version: Constants.expoConfig?.version ?? null,
    p_platform: `${Platform.OS} ${String(Platform.Version)}`,
  });

  if (error) throw error;

  // Same as an invite: the mail is queued in the same transaction, and this
  // nudge is what usually delivers it. The cron sweep covers a failed nudge,
  // so the user is not told about one.
  try {
    await supabase.functions.invoke('send-email', { body: {} });
  } catch {
    // Queued is sent, eventually.
  }
}
