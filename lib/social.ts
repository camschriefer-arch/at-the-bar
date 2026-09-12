import { supabase } from './supabase';
import type { DrinkPostComment, DrinkPostReaction } from './types';

/** Offered as taps under a photo; any emoji typed into a comment still works. */
export const REACTION_EMOJIS = ['🍺', '👍', '🔥', '😂', '🤤', '🍻'] as const;

export async function fetchComments(postId: string): Promise<DrinkPostComment[]> {
  const { data, error } = await supabase.rpc('drink_post_comments_for', { p_post_id: postId });
  if (error) throw error;
  return (data ?? []) as DrinkPostComment[];
}

export async function addComment(postId: string, authorId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('drink_post_comments')
    .insert({ post_id: postId, author_id: authorId, body: body.trim() });

  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('drink_post_comments').delete().eq('id', commentId);
  if (error) throw error;
}

export async function fetchReactions(postId: string): Promise<DrinkPostReaction[]> {
  const { data, error } = await supabase.rpc('drink_post_reactions_for', { p_post_id: postId });
  if (error) throw error;
  return (data ?? []) as DrinkPostReaction[];
}

/** Adds your reaction, or takes it back when you had already left that one. */
export async function toggleReaction(
  postId: string,
  userId: string,
  emoji: string,
  reacted: boolean
): Promise<void> {
  const { error } = reacted
    ? await supabase
        .from('drink_post_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
    : await supabase
        .from('drink_post_reactions')
        .insert({ post_id: postId, user_id: userId, emoji });

  if (error) throw error;
}
