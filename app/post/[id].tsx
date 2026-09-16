import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { PostSocial } from '../../components/PostSocial';
import { Stars } from '../../components/Stars';
import { useAuth } from '../../lib/AuthProvider';
import { fetchFeedPost } from '../../lib/feed';
import { blockUser, REPORT_REASONS, reportPost } from '../../lib/moderation';
import { signedAvatarUrl, signedDrinkUrlsFor } from '../../lib/photos';
import { colors, spacing } from '../../lib/theme';
import type { FeedItem } from '../../lib/types';

const postedOn = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [post, setPost] = useState<FeedItem | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const row = await fetchFeedPost(id);
      setPost(row);
      setError(row ? null : 'This post is no longer available.');

      if (row?.image_path) {
        const urls = await signedDrinkUrlsFor([row.image_path]);
        setPhotoUrl(urls[row.image_path] ?? null);
      }
      setAvatarUrl(await signedAvatarUrl(row?.avatar_url ?? null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the post');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const report = () => {
    if (!post) return;

    Alert.alert('Report this post', "Tell us what's wrong with it.", [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: () => {
          void reportPost(post.id, reason)
            .then(() => Alert.alert('Reported', 'Thanks — we will take a look.'))
            .catch((cause: unknown) =>
              Alert.alert('Could not report', cause instanceof Error ? cause.message : 'Try again')
            );
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const block = () => {
    if (!post) return;

    Alert.alert(
      `Block ${post.display_name}?`,
      'You will not see their posts or comments, and they will not see yours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void blockUser(post.user_id)
              .then(() => router.back())
              .catch((cause: unknown) =>
                Alert.alert('Could not block', cause instanceof Error ? cause.message : 'Try again')
              );
          },
        },
      ]
    );
  };

  if (!post) {
    return (
      <View style={styles.empty}>
        <Text style={styles.muted}>{error ?? 'Loading…'}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${post.display_name}'s profile`}
        style={styles.author}
        onPress={() =>
          post.user_id === userId
            ? router.push('/(tabs)/profile')
            : router.push({ pathname: '/friend/[id]', params: { id: post.user_id } })
        }>
        <Avatar uri={avatarUrl} name={post.display_name} size={44} />
        <View>
          <Text style={styles.name}>{post.display_name}</Text>
          <Text style={styles.muted}>{postedOn(post.created_at)}</Text>
        </View>
      </Pressable>

      {photoUrl ? (
        <Image source={photoUrl} style={styles.photo} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.photo} />
      )}

      {post.beer_name ? <Text style={styles.drink}>{post.beer_name}</Text> : null}
      {post.bar_name ? <Text style={styles.place}>{post.bar_name}</Text> : null}
      {post.rating === null ? null : <Stars rating={post.rating} size={22} />}
      {post.description ? <Text style={styles.description}>{post.description}</Text> : null}

      <PostSocial postId={post.id} ownerId={post.user_id} />

      {post.user_id === userId ? null : (
        <View style={styles.moderation}>
          <Pressable accessibilityRole="button" onPress={report}>
            <Text style={styles.danger}>Report post</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={block}>
            <Text style={styles.danger}>Block {post.display_name}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  author: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  photo: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    width: '100%',
  },
  drink: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  place: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    color: colors.muted,
    fontSize: 15,
  },
  muted: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
  },
  moderation: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  danger: {
    color: colors.danger,
  },
});
