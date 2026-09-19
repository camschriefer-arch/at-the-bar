import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { FriendGroupModal } from '../../components/FriendGroupModal';
import { fetchFriendFeed, fetchIncomingRequests, respondToRequest } from '../../lib/api';
import { useAuth } from '../../lib/AuthProvider';
import {
  fetchFriendGroups,
  fetchShushes,
  shushFriend,
  shushGroup,
  unshushFriend,
  unshushGroup,
} from '../../lib/friendGroups';
import { untilLabel } from '../../lib/shushTime';
import { colors, spacing } from '../../lib/theme';
import type { FriendFeedRow, FriendGroup, Profile } from '../../lib/types';

const REFRESH_INTERVAL_MS = 30_000;

function sinceLabel(arrivedAt: string | null): string {
  if (!arrivedAt) return '';
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(arrivedAt)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** At the bar first, then by name, so a group reads like the Friends tab did. */
function byPresence(a: FriendFeedRow, b: FriendFeedRow): number {
  if ((a.bar_id === null) !== (b.bar_id === null)) return a.bar_id === null ? 1 : -1;
  return a.display_name.localeCompare(b.display_name);
}

export default function FriendsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [friends, setFriends] = useState<FriendFeedRow[]>([]);
  const [requests, setRequests] = useState<{ id: string; requester: Profile }[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [shushed, setShushed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<FriendGroup | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [feed, incoming, myGroups, shushes] = await Promise.all([
        fetchFriendFeed(),
        fetchIncomingRequests(userId),
        fetchFriendGroups(),
        fetchShushes(),
      ]);
      setFriends(feed);
      setRequests(incoming.map(({ request, requester }) => ({ id: request.id, requester })));
      setGroups(myGroups);
      setShushed(Object.fromEntries(shushes.map((row) => [row.user_id, row.expires_at])));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load friends');
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    const timer = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const respond = async (friendshipId: string, accept: boolean) => {
    await respondToRequest(friendshipId, accept);
    await load();
  };

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change that');
    }
  };

  /** Warns that a shhhh is temporary before it starts, and says when it lifts. */
  const confirmShush = (title: string, blurb: string, start: () => Promise<string>) => {
    Alert.alert(title, `${blurb} It comes off by itself after 24 hours.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Shhhh',
        onPress: () =>
          void run(async () => {
            const until = await start();
            Alert.alert('Shhhh', `You are hidden until ${untilLabel(until)}.`);
          }),
      },
    ]);
  };

  const toggleFriend = (friend: FriendFeedRow) => {
    if (shushed[friend.friend_id]) {
      void run(() => unshushFriend(friend.friend_id));
      return;
    }
    confirmShush(
      `Shhhh ${friend.display_name}?`,
      `${friend.display_name} will not see where you are, what you post, or get notifications about you.`,
      () => shushFriend(friend.friend_id)
    );
  };

  const toggleGroup = (group: FriendGroup, allQuiet: boolean) => {
    if (allQuiet) {
      void run(() => unshushGroup(group.group_id));
      return;
    }
    confirmShush(
      `Shhhh ${group.name}?`,
      `Nobody in ${group.name} will see where you are, what you post, or get notifications about you.`,
      () => shushGroup(group.group_id)
    );
  };

  const openEditor = (group: FriendGroup | null) => {
    setEditing(group);
    setEditorOpen(true);
  };

  const byId = new Map(friends.map((friend) => [friend.friend_id, friend]));
  const grouped = new Set(groups.flatMap((group) => group.member_ids));
  const ungrouped = friends.filter((friend) => !grouped.has(friend.friend_id)).sort(byPresence);

  const friendCard = (friend: FriendFeedRow) => {
    const quietUntil = shushed[friend.friend_id];
    return (
      <View key={friend.friend_id} style={friend.bar_id ? styles.card : styles.cardMuted}>
        <Pressable
          onPress={() => router.push({ pathname: '/friend/[id]', params: { id: friend.friend_id } })}>
          <Text style={styles.name}>{friend.display_name}</Text>
          {friend.bar_id ? (
            <>
              <Text style={styles.barName}>{friend.bar_name}</Text>
              <Text style={styles.muted}>
                {[friend.bar_city, friend.bar_state].filter(Boolean).join(', ')}
                {friend.arrived_at ? ` · ${sinceLabel(friend.arrived_at)}` : ''}
              </Text>
            </>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(quietUntil) }}
          style={styles.shush}
          onPress={() => toggleFriend(friend)}>
          <Text style={quietUntil ? styles.shushOn : styles.shushOff}>
            {quietUntil ? `Shhhh until ${untilLabel(quietUntil)} · tap to undo` : 'Shhhh'}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />
        }>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {requests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Friend requests</Text>
            {requests.map((request) => (
              <View key={request.id} style={styles.card}>
                <Text style={styles.name}>{request.requester.display_name}</Text>
                <Text style={styles.muted}>{request.requester.email}</Text>
                <View style={styles.actions}>
                  <View style={styles.action}>
                    <Button title="Accept" onPress={() => void respond(request.id, true)} />
                  </View>
                  <View style={styles.action}>
                    <Button
                      title="Decline"
                      variant="secondary"
                      onPress={() => void respond(request.id, false)}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {groups.map((group) => {
          const members = group.member_ids
            .map((id) => byId.get(id))
            .filter((friend): friend is FriendFeedRow => friend !== undefined)
            .sort(byPresence);
          const allQuiet = members.length > 0 && members.every((m) => shushed[m.friend_id]);
          return (
            <View key={group.group_id} style={styles.section}>
              <View style={styles.groupHeader}>
                <Text style={styles.sectionTitle}>{group.name}</Text>
                <View style={styles.groupActions}>
                  <Pressable accessibilityRole="button" onPress={() => toggleGroup(group, allQuiet)}>
                    <Text style={allQuiet ? styles.shushOn : styles.link}>
                      {allQuiet ? 'Unshhhh all' : 'Shhhh all'}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => openEditor(group)}>
                    <Text style={styles.link}>Edit</Text>
                  </Pressable>
                </View>
              </View>
              {members.length === 0 ? (
                <Text style={styles.muted}>Nobody in this group yet — tap Edit to add people.</Text>
              ) : (
                members.map(friendCard)
              )}
            </View>
          );
        })}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{groups.length > 0 ? 'Everyone else' : 'Friends'}</Text>
          {ungrouped.length === 0 ? (
            <Text style={styles.muted}>
              {friends.length === 0 ? 'Invite someone to get started.' : 'Everyone is in a group.'}
            </Text>
          ) : (
            ungrouped.map(friendCard)
          )}
        </View>

        <View style={styles.section}>
          <Button title="New group" variant="secondary" onPress={() => openEditor(null)} />
        </View>
      </ScrollView>

      {editorOpen ? (
        <FriendGroupModal
          group={editing}
          friends={friends}
          onClose={() => setEditorOpen(false)}
          onSaved={load}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  groupActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  cardMuted: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  barName: {
    color: colors.accent,
    fontSize: 16,
  },
  muted: {
    color: colors.muted,
  },
  shush: {
    paddingTop: spacing.xs,
  },
  shushOn: {
    color: colors.accent,
    fontSize: 13,
  },
  shushOff: {
    color: colors.muted,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
  },
  error: {
    color: colors.danger,
  },
});
