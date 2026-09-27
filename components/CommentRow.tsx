import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../lib/theme';
import type { FeedComment } from '../lib/types';

type CommentRowProps = {
  comment: FeedComment;
  /** Who is reading, so their own name is not a link to their own profile. */
  userId: string | null;
  /** Missing when the reader may not delete this comment. */
  onDelete?: () => void;
};

/** One comment, with its own menu rather than a row of red text beneath it. */
export function CommentRow({ comment, userId, onDelete }: CommentRowProps) {
  const router = useRouter();

  const menu = () => {
    if (!onDelete) return;
    Alert.alert('This comment', undefined, [
      { text: 'Delete', style: 'destructive', onPress: onDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.comment}>
      <View style={styles.said}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${comment.display_name}`}
          disabled={comment.author_id === userId}
          onPress={() => router.push(`/user/${comment.author_id}`)}>
          <Text style={styles.author}>{comment.display_name}</Text>
        </Pressable>
        <Text style={styles.body}>{comment.body}</Text>
      </View>

      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More on ${comment.display_name}'s comment`}
          hitSlop={spacing.sm}
          onPress={menu}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  comment: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  said: {
    flex: 1,
    gap: 2,
  },
  author: {
    color: colors.text,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
  },
});
