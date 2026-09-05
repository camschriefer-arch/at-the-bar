import { supabase } from './supabase';
import type {
  Bar,
  FriendFeedRow,
  FriendRequest,
  InviteLink,
  InviteResult,
  Profile,
  TopBar,
  UserStatus,
} from './types';

export async function fetchFriendFeed(): Promise<FriendFeedRow[]> {
  const { data, error } = await supabase.rpc('friend_feed');
  if (error) throw error;
  return (data ?? []) as FriendFeedRow[];
}

export async function fetchIncomingRequests(
  userId: string
): Promise<{ request: FriendRequest; requester: Profile }[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, requester:profiles!friendships_requester_id_fkey(id, email, display_name, avatar_url)')
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const { requester, ...request } = row;
    // PostgREST embeds a to-one relation as a single object at runtime, but the
    // untyped client widens it to an array.
    const profile = (Array.isArray(requester) ? requester[0] : requester) as Profile | undefined;
    return profile ? [{ request: request as FriendRequest, requester: profile }] : [];
  });
}

export async function respondToRequest(friendshipId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function inviteByEmail(email: string): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('invite_by_email', { p_email: email });
  if (error) throw error;
  return data as InviteResult;
}

export async function createInviteLink(): Promise<InviteLink> {
  const { data, error } = await supabase.rpc('create_invite_link');
  if (error) throw error;
  return data as InviteLink;
}

export async function acceptInvite(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error) throw error;
}

export async function fetchMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, avatar_url')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function fetchMyStatus(userId: string): Promise<{ status: UserStatus; bar: Bar | null }> {
  const { data, error } = await supabase
    .from('user_status')
    .select('user_id, bar_id, arrived_at, updated_at, bar:bars(id, name, street, city, state, lat, lng, category)')
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  const { bar, ...status } = data;
  const resolved = (Array.isArray(bar) ? bar[0] : bar) as Bar | undefined;
  return { status: status as UserStatus, bar: resolved ?? null };
}

export async function fetchTopBars(userId: string, limit = 5): Promise<TopBar[]> {
  const { data, error } = await supabase.rpc('top_bars', { p_user_id: userId, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as TopBar[];
}

export async function forgetBar(barId: string): Promise<void> {
  const { error } = await supabase.rpc('forget_bar', { p_bar_id: barId });
  if (error) throw error;
}

/** Whether this user has silenced a friend's arrive/leave notifications. */
export async function isMuted(friendId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_mutes')
    .select('muted_id')
    .eq('muted_id', friendId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export async function setMuted(userId: string, friendId: string, muted: boolean): Promise<void> {
  const { error } = muted
    ? await supabase
        .from('notification_mutes')
        .upsert({ muter_id: userId, muted_id: friendId })
    : await supabase.from('notification_mutes').delete().eq('muted_id', friendId);

  if (error) throw error;
}

/**
 * Ends the friendship both ways. The database queues an email to the person who
 * was removed — deliberately not a push, which is reserved for bar events — and
 * this only nudges the sender so it goes out without waiting for the cron sweep.
 */
export async function removeFriend(friendId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  if (error) throw error;

  try {
    await supabase.functions.invoke('send-email', { body: {} });
  } catch {
    // Delivery is the cron sweep's problem from here.
  }
}
