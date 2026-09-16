import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from './Avatar';
import { Stars } from './Stars';
import { colors, spacing } from '../lib/theme';
import type { FeedItem } from '../lib/types';

/** "4m", "3h", "2d" — a feed wants the age, not the date. */
function age(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

function place(item: FeedItem): string | null {
  if (!item.bar_name) return null;
  const where = [item.bar_city, item.bar_state].filter(Boolean).join(', ');
  return where ? `${item.bar_name} · ${where}` : item.bar_name;
}

type FeedCardProps = {
  item: FeedItem;
  /** Signed URL for the drink photo; the drinks bucket is private. */
  photoUrl?: string;
  avatarUrl?: string;
  onPress: () => void;
  onAuthorPress: () => void;
  onOptions: () => void;
};

export function FeedCard({
  item,
  photoUrl,
  avatarUrl,
  onPress,
  onAuthorPress,
  onOptions,
}: FeedCardProps) {
  const checkIn = item.kind === 'check_in';

  return (
    <Pressable
      accessibilityRole={checkIn ? 'text' : 'button'}
      accessibilityLabel={
        checkIn
          ? `${item.display_name} is at ${item.bar_name}`
          : `${item.beer_name} at ${item.bar_name}, by ${item.display_name}`
      }
      style={styles.card}
      onPress={checkIn ? undefined : onPress}
      onLongPress={onOptions}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.display_name}'s profile`}
          style={styles.author}
          onPress={onAuthorPress}>
          <Avatar uri={avatarUrl ?? null} name={item.display_name} size={40} />
          <View style={styles.byline}>
            <Text style={styles.name}>{item.display_name}</Text>
            <Text style={styles.meta}>
              {checkIn ? 'checked in' : 'posted'} · {age(item.created_at)}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post options"
          hitSlop={spacing.sm}
          onPress={onOptions}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {place(item) ? <Text style={styles.place}>{place(item)}</Text> : null}

      {checkIn ? null : (
        <>
          {photoUrl ? (
            <Image source={photoUrl} style={styles.photo} contentFit="cover" transition={150} />
          ) : (
            <View style={styles.photo} />
          )}

          <View style={styles.body}>
            <Text style={styles.drink}>{item.beer_name}</Text>
            {item.rating === null ? null : <Stars rating={item.rating} size={16} />}
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <Text style={styles.counts}>
              {item.reactions} {item.reactions === 1 ? 'reaction' : 'reactions'} · {item.comments}{' '}
              {item.comments === 1 ? 'comment' : 'comments'}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: spacing.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  author: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.sm,
  },
  byline: {
    flexShrink: 1,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  place: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  photo: {
    aspectRatio: 1,
    backgroundColor: colors.background,
    width: '100%',
  },
  body: {
    gap: spacing.xs,
    padding: spacing.sm,
  },
  drink: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  description: {
    color: colors.muted,
    fontSize: 15,
  },
  counts: {
    color: colors.muted,
    fontSize: 13,
  },
});
