import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../lib/AuthProvider';
import {
  addComment,
  deleteComment,
  fetchComments,
  fetchReactions,
  REACTION_EMOJIS,
  toggleReaction,
} from '../lib/social';
import { colors, spacing } from '../lib/theme';
import type { DrinkPostComment, DrinkPostReaction } from '../lib/types';

const COMMENT_LIMIT = 500;

type PostSocialProps = {
  postId: string;
  /** Owner of the photo, who may also delete comments left on it. */
  ownerId: string;
};

/** Emoji reactions and the comment thread under one drink photo. */
export function PostSocial({ postId, ownerId }: PostSocialProps) {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;

  const [reactions, setReactions] = useState<DrinkPostReaction[]>([]);
  const [comments, setComments] = useState<DrinkPostComment[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [emoji, thread] = await Promise.all([fetchReactions(postId), fetchComments(postId)]);
      setReactions(emoji);
      setComments(thread);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load comments');
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const react = async (emoji: string) => {
    if (!userId) return;
    const current = reactions.find((row) => row.emoji === emoji);
    setError(null);
    try {
      await toggleReaction(postId, userId, emoji, current?.reacted ?? false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not react');
    }
  };

  const send = async () => {
    if (!userId || draft.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await addComment(postId, userId, draft);
      setDraft('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post your comment');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment: DrinkPostComment) => {
    setError(null);
    try {
      await deleteComment(comment.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete that comment');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.reactions}>
        {REACTION_EMOJIS.map((emoji) => {
          const row = reactions.find((reaction) => reaction.emoji === emoji);
          return (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
              style={[styles.chip, row?.reacted ? styles.chipOn : null]}
              onPress={() => void react(emoji)}>
              <Text style={styles.emoji}>{emoji}</Text>
              {row ? <Text style={styles.count}>{row.reactions}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {comments.map((comment) => (
        <View key={comment.id} style={styles.comment}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${comment.display_name}`}
            disabled={comment.author_id === userId}
            onPress={() => router.push(`/user/${comment.author_id}`)}>
            <Text style={styles.author}>{comment.display_name}</Text>
          </Pressable>
          <Text style={styles.body}>{comment.body}</Text>
          {comment.author_id === userId || ownerId === userId ? (
            <Pressable accessibilityRole="button" onPress={() => void remove(comment)}>
              <Text style={styles.delete}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment"
          placeholderTextColor={colors.muted}
          maxLength={COMMENT_LIMIT}
          multiline
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || draft.trim().length === 0}
          onPress={() => void send()}>
          <Text style={[styles.send, draft.trim().length === 0 ? styles.sendOff : null]}>Post</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipOn: {
    borderColor: colors.accent,
  },
  emoji: {
    fontSize: 16,
  },
  count: {
    color: colors.muted,
    fontSize: 13,
  },
  comment: {
    gap: 2,
  },
  author: {
    color: colors.text,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
  },
  delete: {
    color: colors.danger,
    fontSize: 13,
  },
  composer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    maxHeight: 96,
    padding: spacing.sm,
  },
  send: {
    color: colors.accent,
    fontWeight: '700',
    paddingBottom: spacing.sm,
  },
  sendOff: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
  },
});
