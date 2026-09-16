import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text } from 'react-native';

import { FeedCard } from '../../components/FeedCard';
import { useAuth } from '../../lib/AuthProvider';
import { FEED_PAGE_SIZE, fetchFeed, feedKey } from '../../lib/feed';
import { blockUser, REPORT_REASONS, reportPost } from '../../lib/moderation';
import { signedAvatarUrlsFor, signedDrinkUrlsFor } from '../../lib/photos';
import { colors, spacing } from '../../lib/theme';
import type { FeedItem } from '../../lib/types';

export default function FeedScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [items, setItems] = useState<FeedItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = useCallback(async (page: FeedItem[]) => {
    const photos = page
      .map((item) => item.image_path)
      .filter((path): path is string => path !== null);
    const faces = page
      .map((item) => item.avatar_url)
      .filter((path): path is string => path !== null);

    const [photoUrls, avatarUrls] = await Promise.all([
      signedDrinkUrlsFor(photos),
      signedAvatarUrlsFor(faces),
    ]);

    setUrls((previous) => ({ ...previous, ...photoUrls }));
    setAvatars((previous) => ({ ...previous, ...avatarUrls }));
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const page = await fetchFeed();
      setItems(page);
      setEnd(page.length < FEED_PAGE_SIZE);
      await sign(page);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the feed');
    }
  }, [sign, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    const oldest = items[items.length - 1];
    if (!oldest || end || loadingMore || refreshing) return;

    setLoadingMore(true);
    try {
      const page = await fetchFeed(oldest.created_at);
      setItems((previous) => [...previous, ...page]);
      setEnd(page.length < FEED_PAGE_SIZE);
      await sign(page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more');
    }
    setLoadingMore(false);
  };

  const report = (item: FeedItem) => {
    Alert.alert('Report this post', "Tell us what's wrong with it.", [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: () => {
          void reportPost(item.id, reason)
            .then(() => Alert.alert('Reported', 'Thanks — we will take a look.'))
            .catch((cause: unknown) =>
              Alert.alert('Could not report', cause instanceof Error ? cause.message : 'Try again')
            );
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const block = (item: FeedItem) => {
    Alert.alert(
      `Block ${item.display_name}?`,
      'You will not see their posts or comments, and they will not see yours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void blockUser(item.user_id)
              .then(load)
              .catch((cause: unknown) =>
                Alert.alert('Could not block', cause instanceof Error ? cause.message : 'Try again')
              );
          },
        },
      ]
    );
  };

  const options = (item: FeedItem) => {
    if (item.user_id === userId) return;

    Alert.alert(item.display_name, undefined, [
      ...(item.kind === 'post'
        ? [{ text: 'Report post', style: 'destructive' as const, onPress: () => report(item) }]
        : []),
      {
        text: `Block ${item.display_name}`,
        style: 'destructive' as const,
        onPress: () => block(item),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={feedKey}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />
      }
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.intro}>Where your friends are, and what they are drinking.</Text>
        </>
      }
      ListEmptyComponent={
        error ? null : (
          <Text style={styles.muted}>
            Nothing here yet. Check in at a bar, or post what you are drinking.
          </Text>
        )
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={colors.muted} style={styles.spinner} /> : null
      }
      renderItem={({ item }) => (
        <FeedCard
          item={item}
          photoUrl={item.image_path ? urls[item.image_path] : undefined}
          avatarUrl={item.avatar_url ? avatars[item.avatar_url] : undefined}
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
          onAuthorPress={() =>
            item.user_id === userId
              ? router.push('/(tabs)/profile')
              : router.push({ pathname: '/friend/[id]', params: { id: item.user_id } })
          }
          onOptions={() => options(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
  },
  intro: {
    color: colors.muted,
    fontSize: 14,
  },
  muted: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
  },
  spinner: {
    marginVertical: spacing.md,
  },
});
