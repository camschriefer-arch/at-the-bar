import { supabase } from './supabase';
import type { Bar, FriendFeedRow, FriendRequest, InviteResult, Profile, UserStatus } from './types';

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
    .select('user_id, bar_id, arrived_at, updated_at, bar:bars(id, name, street, city, state, lat, lng)')
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  const { bar, ...status } = data;
  const resolved = (Array.isArray(bar) ? bar[0] : bar) as Bar | undefined;
  return { status: status as UserStatus, bar: resolved ?? null };
}

export async function removeFriend(friendId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`
    );

  if (error) throw error;
}
