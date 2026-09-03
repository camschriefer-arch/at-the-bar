import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stars } from './Stars';
import { colors, spacing } from '../lib/theme';
import type { DrinkPost } from '../lib/types';

const postedOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

type DrinkGalleryProps = {
  posts: DrinkPost[];
  /** Signed URL per image path — the drinks bucket is private. */
  urls: Record<string, string>;
  emptyLabel: string;
  onDelete?: (post: DrinkPost) => void;
};

export function DrinkGallery({ posts, urls, emptyLabel, onDelete }: DrinkGalleryProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = posts.find((post) => post.id === openId) ?? null;
  const insets = useSafeAreaInsets();

  if (posts.length === 0) {
    return <Text style={styles.muted}>{emptyLabel}</Text>;
  }

  return (
    <>
      <View style={styles.grid}>
        {posts.map((post) => (
          <Pressable
            key={post.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${post.beer_name} at ${post.bar_name}`}
            style={styles.cell}
            onPress={() => setOpenId(post.id)}>
            <Image
              source={urls[post.image_path]}
              style={styles.thumb}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        ))}
      </View>

      <Modal
        visible={open !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setOpenId(null)}>
        {open ? (
          <View style={styles.viewer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close photo"
              // A modal draws under the status bar and the notch, so the button
              // sits below whatever the phone puts up there.
              style={[styles.close, { marginTop: insets.top + spacing.sm }]}
              hitSlop={spacing.md}
              onPress={() => setOpenId(null)}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>

            <Image source={urls[open.image_path]} style={styles.full} contentFit="contain" />

            <ScrollView style={styles.details} contentContainerStyle={styles.detailsContent}>
              <Text style={styles.beerName}>{open.beer_name}</Text>
              <Text style={styles.barName}>{open.bar_name}</Text>
              <Text style={styles.postedOn}>{postedOn(open.created_at)}</Text>
              <Stars rating={open.rating} size={22} />
              {open.description ? (
                <Text style={styles.description}>{open.description}</Text>
              ) : null}
              {onDelete ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setOpenId(null);
                    onDelete(open);
                  }}>
                  <Text style={styles.delete}>Delete photo</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  cell: {
    // Three across, Instagram style, with the gaps taken out of the width.
    width: '32.6%',
  },
  thumb: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    width: '100%',
  },
  viewer: {
    backgroundColor: '#000000EE',
    flex: 1,
    justifyContent: 'center',
  },
  close: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#00000099',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 44,
  },
  full: {
    flex: 1,
    width: '100%',
  },
  details: {
    backgroundColor: '#000000',
    maxHeight: '38%',
  },
  detailsContent: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  beerName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  barName: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  postedOn: {
    color: colors.muted,
    fontSize: 14,
  },
  description: {
    color: colors.muted,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  muted: {
    color: colors.muted,
  },
  delete: {
    color: colors.danger,
    marginTop: spacing.sm,
  },
});
