import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { fetchFriendFeed, fetchIncomingRequests, respondToRequest } from '../../lib/api';
import { useAuth } from '../../lib/AuthProvider';
import { colors, spacing } from '../../lib/theme';
import type { FriendFeedRow, Profile } from '../../lib/types';

const REFRESH_INTERVAL_MS = 30_000;

function sinceLabel(arrivedAt: string | null): string {
  if (!arrivedAt) return '';
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(arrivedAt)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function FriendsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [friends, setFriends] = useState<FriendFeedRow[]>([]);
  const [requests, setRequests] = useState<{ id: string; requester: Profile }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [feed, incoming] = await Promise.all([
        fetchFriendFeed(),
        fetchIncomingRequests(userId),
      ]);
      setFriends(feed);
      setRequests(incoming.map(({ request, requester }) => ({ id: request.id, requester })));
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

  const atTheBar = friends.filter((friend) => friend.bar_id !== null);
  const elsewhere = friends.filter((friend) => friend.bar_id === null);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={atTheBar}
      keyExtractor={(item) => item.friend_id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
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

          <Text style={styles.sectionTitle}>At the bar</Text>
          {atTheBar.length === 0 ? (
            <Text style={styles.muted}>Nobody is out right now.</Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() => router.push({ pathname: '/friend/[id]', params: { id: item.friend_id } })}>
          <Text style={styles.name}>{item.display_name}</Text>
          <Text style={styles.barName}>{item.bar_name}</Text>
          <Text style={styles.muted}>
            {[item.bar_city, item.bar_state].filter(Boolean).join(', ')}
            {item.arrived_at ? ` · ${sinceLabel(item.arrived_at)}` : ''}
          </Text>
        </Pressable>
      )}
      ListFooterComponent={
        elsewhere.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Not out</Text>
            {elsewhere.map((friend) => (
              <View key={friend.friend_id} style={styles.cardMuted}>
                <Text style={styles.name}>{friend.display_name}</Text>
              </View>
            ))}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    gap: spacing.sm,
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
