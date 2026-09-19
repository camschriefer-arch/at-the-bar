import { supabase } from './supabase';
import type { FriendGroup, Shush } from './types';

export async function fetchFriendGroups(): Promise<FriendGroup[]> {
  const { data, error } = await supabase.rpc('my_friend_groups');
  if (error) throw error;
  return (data ?? []) as FriendGroup[];
}

/** Makes an empty group and hands back its id, so members can go straight in. */
export async function createFriendGroup(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_friend_group', { p_name: name });
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function renameFriendGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_friend_group', {
    p_group_id: groupId,
    p_name: name,
  });
  if (error) throw error;
}

export async function deleteFriendGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_friend_group', { p_group_id: groupId });
  if (error) throw error;
}

export async function setGroupMembership(
  groupId: string,
  userId: string,
  member: boolean
): Promise<void> {
  const { error } = await supabase.rpc('set_group_membership', {
    p_group_id: groupId,
    p_user_id: userId,
    p_member: member,
  });
  if (error) throw error;
}

/** Who cannot see you right now, and until when. Expired ones are already gone. */
export async function fetchShushes(): Promise<Shush[]> {
  const { data, error } = await supabase.rpc('my_shushes');
  if (error) throw error;
  return (data ?? []) as Shush[];
}

/** Hides you from one friend, and returns the moment it lifts. */
export async function shushFriend(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('shush_friend', { p_user_id: userId });
  if (error) throw error;
  return data as string;
}

export async function unshushFriend(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unshush_friend', { p_user_id: userId });
  if (error) throw error;
}

export async function shushGroup(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('shush_group', { p_group_id: groupId });
  if (error) throw error;
  return data as string;
}

export async function unshushGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('unshush_group', { p_group_id: groupId });
  if (error) throw error;
}
