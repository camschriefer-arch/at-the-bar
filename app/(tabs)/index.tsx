import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
} from "react-native";

import { FeedCard } from "../../components/FeedCard";
import { ReportModal } from "../../components/ReportModal";
import { useAuth } from "../../lib/AuthProvider";
import {
  FEED_PAGE_SIZE,
  fetchFeed,
  fetchFeedVisit,
  feedKey,
  sharePost,
  unsharePost,
} from "../../lib/feed";
import { blockUser } from "../../lib/moderation";
import { signedAvatarUrlsFor, signedDrinkUrlsFor } from "../../lib/photos";
import { colors, spacing } from "../../lib/theme";
import type { FeedItem } from "../../lib/types";

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
  const [reporting, setReporting] = useState<string | null>(null);
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
      setError(
        cause instanceof Error ? cause.message : "Could not load the feed",
      );
    }
  }, [sign, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
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
      setError(cause instanceof Error ? cause.message : "Could not load more");
    }
    setLoadingMore(false);
  };

  /**
   * A comment or a reaction changes one card, so only that card is refetched:
   * reloading the first page would drop everything paged in below it.
   */
  const refreshVisit = useCallback(async (item: FeedItem) => {
    if (item.kind === "post" || item.kind === "reshare") return;
    try {
      const fresh = await fetchFeedVisit(item.id, item.kind);
      if (!fresh) return;
      setItems((previous) =>
        previous.map((row) =>
          row.kind === fresh.kind && row.id === fresh.id ? fresh : row,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not refresh that post",
      );
    }
  }, []);

  /**
   * Sharing adds a card for your friends, not for you — your own feed keeps the
   * card you shared from, with the button flipped as the acknowledgement. Taking
   * back a share of a photo you only reached through someone else drops the card
   * with it; a refresh brings it back if a friend's own share still carries it.
   */
  const share = async (item: FeedItem) => {
    const postId = item.post_id;
    if (!postId) return;

    const shared = item.shared_by_me;
    try {
      if (shared) {
        await unsharePost(postId);
      } else {
        await sharePost(postId);
      }

      setItems((previous) =>
        previous
          .filter(
            (row) =>
              !shared ||
              !(row.kind === "reshare" && row.post_id === postId && row.sharer_id === userId),
          )
          .map((row) =>
            row.post_id === postId ? { ...row, shared_by_me: !shared } : row,
          ),
      );
    } catch (cause) {
      Alert.alert(
        shared ? "Could not remove that" : "Could not share that",
        cause instanceof Error ? cause.message : "Try again",
      );
    }
  };

  const block = (item: FeedItem) => {
    Alert.alert(
      `Block ${item.display_name}?`,
      "You will not see their posts or comments, and they will not see yours.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            void blockUser(item.user_id)
              .then(load)
              .catch((cause: unknown) =>
                Alert.alert(
                  "Could not block",
                  cause instanceof Error ? cause.message : "Try again",
                ),
              );
          },
        },
      ],
    );
  };

  const options = (item: FeedItem) => {
    if (item.user_id === userId) return;

    const postId = item.post_id;
    Alert.alert(item.display_name, undefined, [
      ...(postId
        ? [
            {
              text: "Report post",
              style: "destructive" as const,
              onPress: () => setReporting(postId),
            },
          ]
        : []),
      {
        text: `Block ${item.display_name}`,
        style: "destructive" as const,
        onPress: () => block(item),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return (
    <>
      <ReportModal
        postId={reporting}
        onClose={() => setReporting(null)}
        onReported={() =>
          Alert.alert("Reported", "Thanks — we will take a look.")
        }
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={feedKey}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.muted}
          />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.intro}>
              Where your friends are, and what they are drinking.
            </Text>
          </>
        }
        ListEmptyComponent={
          error ? null : (
            <Text style={styles.muted}>
              Nothing here yet. Check in at a bar, or post what you are
              drinking.
            </Text>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.muted} style={styles.spinner} />
          ) : null
        }
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            photoUrl={item.image_path ? urls[item.image_path] : undefined}
            avatarUrl={item.avatar_url ? avatars[item.avatar_url] : undefined}
            onPress={() =>
              router.push({
                pathname: "/post/[id]",
                params: { id: item.post_id ?? item.id },
              })
            }
            onAuthorPress={() =>
              item.user_id === userId
                ? router.push("/(tabs)/profile")
                : router.push({
                    pathname: "/friend/[id]",
                    params: { id: item.user_id },
                  })
            }
            onOptions={() => options(item)}
            onChanged={() => void refreshVisit(item)}
            onShare={
              item.post_id && item.user_id !== userId
                ? () => void share(item)
                : undefined
            }
            sharedByYou={item.sharer_id === userId}
          />
        )}
      />
    </>
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
