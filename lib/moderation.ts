import { supabase } from './supabase';

/** Offered as the reason when someone reports a post. */
export const REPORT_REASONS = ['Nudity or sex', 'Harassment', 'Violence', 'Spam'] as const;

export async function reportPost(postId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('report_post', { p_post_id: postId, p_reason: reason });
  if (error) throw error;
}

/**
 * Hides everything the two of you post from each other, in both directions.
 * Any friendship is left in place; removing someone is a separate action.
 */
export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_user_id: userId });
  if (error) throw error;
}

export type BlockedUser = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('blocked_users');
  if (error) throw error;
  return (data ?? []) as BlockedUser[];
}
