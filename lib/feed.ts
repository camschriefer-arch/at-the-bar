import { supabase } from './supabase';
import type { FeedItem } from './types';

export const FEED_PAGE_SIZE = 20;

/**
 * One page of the feed, newest first. `before` is the timestamp of the oldest
 * item already on screen; leave it out for the top of the feed.
 */
export async function fetchFeed(before?: string): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('feed_page', {
    p_before: before ?? null,
    p_limit: FEED_PAGE_SIZE,
  });

  if (error) throw error;
  return (data ?? []) as FeedItem[];
}

export async function fetchFeedPost(postId: string): Promise<FeedItem | null> {
  const { data, error } = await supabase.rpc('feed_post', { p_post_id: postId });
  if (error) throw error;
  return ((data ?? []) as FeedItem[])[0] ?? null;
}

/**
 * One end of one visit, refetched after a comment or a reaction so the card is
 * replaced in place rather than the whole page being pulled out from under the
 * reader.
 */
export async function fetchFeedVisit(
  visitId: string,
  kind: 'check_in' | 'check_out'
): Promise<FeedItem | null> {
  const { data, error } = await supabase.rpc('feed_visit', {
    p_visit_id: visitId,
    p_kind: kind,
  });

  if (error) throw error;
  return ((data ?? []) as FeedItem[])[0] ?? null;
}

/** A check-in and a post can share an id, so a feed key carries both. */
export function feedKey(item: FeedItem): string {
  return `${item.kind}:${item.id}`;
}
