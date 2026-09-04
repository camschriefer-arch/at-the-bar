import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { DrinkGallery } from '../../components/DrinkGallery';
import { TopBars } from '../../components/TopBars';
import { fetchFriendFeed, fetchTopBars, removeFriend } from '../../lib/api';
import { fetchDrinkPosts, signedAvatarUrl, signedDrinkUrls } from '../../lib/photos';
import { colors, spacing } from '../../lib/theme';
import type { DrinkPost, FriendFeedRow, TopBar } from '../../lib/types';

const MAP_SPAN_DEGREES = 0.01;

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [friend, setFriend] = useState<FriendFeedRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [posts, setPosts] = useState<DrinkPost[]>([]);
  const [topBars, setTopBars] = useState<TopBar[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const feed = await fetchFriendFeed();
      const row = feed.find((entry) => entry.friend_id === id) ?? null;
      setFriend(row);
      setError(null);

      if (!row) return;

      // Only reachable for an accepted friend; the database enforces the same rule.
      const [drinks, frequented] = await Promise.all([
        fetchDrinkPosts(row.friend_id),
        fetchTopBars(row.friend_id),
      ]);
      setPosts(drinks);
      setTopBars(frequented);
      const [avatar, urls] = await Promise.all([
        signedAvatarUrl(row.avatar_url),
        signedDrinkUrls(drinks),
      ]);
      setAvatarUrl(avatar);
      setPhotoUrls(urls);
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

  const remove = async (name: string) => {
    setRemoving(true);
    try {
      await removeFriend(id);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not remove ${name}`);
      setRemoving(false);
    }
  };

  const confirmRemove = (name: string) => {
    Alert.alert(
      `Remove ${name}?`,
      `You will stop seeing each other's status and drinks. ${name} gets an email letting them know.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void remove(name) },
      ]
    );
  };

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: friend.display_name }} />

      <View style={styles.header}>
        <Avatar uri={avatarUrl} name={friend.display_name} />
        <View style={styles.headerText}>
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
      </View>

      {atBar ? (
        <MapView
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
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

      <View style={styles.gallery}>
        <Text style={styles.status}>Frequently visited</Text>
        <TopBars
          bars={topBars}
          emptyLabel={`${friend.display_name} has not checked in anywhere yet.`}
        />
      </View>

      <View style={styles.gallery}>
        <Text style={styles.status}>Their drinks</Text>
        <DrinkGallery
          posts={posts}
          urls={photoUrls}
          emptyLabel={`${friend.display_name} has not posted any drinks yet.`}
        />
      </View>

      <View style={styles.footer}>
        <Button
          title="Remove friend"
          variant="secondary"
          loading={removing}
          onPress={() => confirmRemove(friend.display_name)}
        />
      </View>
    </ScrollView>
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
  content: {
    paddingBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  headerText: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  gallery: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  footer: {
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
    height: 260,
  },
  privacyNote: {
    padding: spacing.md,
  },
  error: {
    color: colors.danger,
  },
});
