import { supabase } from './supabase';
import type { CompanionTag, CurrentVisit, PublicProfile, VisitCompanion } from './types';

/** The visit the user is on now, which is what naming someone hangs off. */
export async function currentVisit(): Promise<CurrentVisit | null> {
  const { data, error } = await supabase.rpc('my_current_visit');
  if (error) throw error;
  return ((data ?? []) as CurrentVisit[])[0] ?? null;
}

/** Friends checked in at the same venue, and not hidden either way. */
export async function friendsAtBar(barId: string): Promise<PublicProfile[]> {
  const { data, error } = await supabase.rpc('friends_at_bar', { p_bar_id: barId });
  if (error) throw error;
  return (data ?? []) as PublicProfile[];
}

/** Replaces who the user says they are with on a visit. */
export async function setVisitCompanions(
  visitId: string,
  userIds: readonly string[]
): Promise<void> {
  const { error } = await supabase.rpc('set_visit_companions', {
    p_visit_id: visitId,
    p_user_ids: userIds,
  });

  if (error) throw error;
}

/** Who is named on a visit, including anyone still to answer. */
export async function visitCompanions(visitId: string): Promise<VisitCompanion[]> {
  const { data, error } = await supabase.rpc('visit_companion_list', { p_visit_id: visitId });
  if (error) throw error;
  return (data ?? []) as VisitCompanion[];
}

export async function pendingCompanionTags(): Promise<CompanionTag[]> {
  const { data, error } = await supabase.rpc('my_companion_tags');
  if (error) throw error;
  return (data ?? []) as CompanionTag[];
}

export async function respondToCompanionTag(visitId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_companion_tag', {
    p_visit_id: visitId,
    p_accept: accept,
  });

  if (error) throw error;
}
