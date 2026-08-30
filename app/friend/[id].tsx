import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';

import { fetchFriendFeed } from '../../lib/api';
import { colors, spacing } from '../../lib/theme';
import type { FriendFeedRow } from '../../lib/types';

const MAP_SPAN_DEGREES = 0.01;

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [friend, setFriend] = useState<FriendFeedRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const feed = await fetchFriendFeed();
      setFriend(feed.find((row) => row.friend_id === id) ?? null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this friend');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !friend) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? 'Friend not found'}</Text>
      </View>
    );
  }

  const atBar = friend.bar_id !== null && friend.bar_lat !== null && friend.bar_lng !== null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: friend.display_name }} />

      <View style={styles.header}>
        <Text style={styles.name}>{friend.display_name}</Text>
        {atBar ? (
          <>
            <Text style={styles.status}>At the bar</Text>
            <Text style={styles.barName}>{friend.bar_name}</Text>
            <Text style={styles.muted}>
              {[friend.bar_city, friend.bar_state].filter(Boolean).join(', ')}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>Not at a bar right now.</Text>
        )}
      </View>

      {atBar ? (
        <MapView
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
          style={styles.map}
          initialRegion={{
            latitude: friend.bar_lat as number,
            longitude: friend.bar_lng as number,
            latitudeDelta: MAP_SPAN_DEGREES,
            longitudeDelta: MAP_SPAN_DEGREES,
          }}>
          <Marker
            coordinate={{
              latitude: friend.bar_lat as number,
              longitude: friend.bar_lng as number,
            }}
            title={friend.bar_name ?? undefined}
          />
        </MapView>
      ) : (
        <View style={styles.privacyNote}>
          <Text style={styles.muted}>
            At The Bar only ever shows a friend&apos;s location while they are at a bar.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  status: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  barName: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '600',
  },
  muted: {
    color: colors.muted,
  },
  map: {
    flex: 1,
  },
  privacyNote: {
    padding: spacing.md,
  },
  error: {
    color: colors.danger,
  },
});
