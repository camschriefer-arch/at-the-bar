import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { asReaction } from '../lib/emoji';
import { REACTION_EMOJIS } from '../lib/social';
import { colors, spacing } from '../lib/theme';
import type { DrinkPostReaction } from '../lib/types';

const OFFERED: readonly string[] = REACTION_EMOJIS;

type ReactionsProps = {
  rows: readonly DrinkPostReaction[];
  onReact: (emoji: string) => void;
  /** Cards sit on the surface, so their chips take the page colour instead. */
  onCard?: boolean;
};

/**
 * The reaction row: three emoji worth a single tap, whatever else people have
 * already left here, and a plus that hands the rest over to the keyboard.
 */
export function Reactions({ rows, onReact, onCard }: ReactionsProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const used = rows.map((row) => row.emoji).filter((emoji) => !OFFERED.includes(emoji));
  const chipStyle = [styles.chip, onCard ? styles.chipOnCard : null];

  const pick = (text: string) => {
    const emoji = asReaction(text);
    if (!emoji) {
      setDraft(text);
      return;
    }

    setDraft(null);
    onReact(emoji);
  };

  return (
    <View style={styles.row}>
      {[...OFFERED, ...used].map((emoji) => {
        const row = rows.find((reaction) => reaction.emoji === emoji);
        return (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`React with ${emoji}`}
            style={[chipStyle, row?.reacted ? styles.chipOn : null]}
            onPress={() => onReact(emoji)}>
            <Text style={styles.emoji}>{emoji}</Text>
            {row ? <Text style={styles.count}>{row.reactions}</Text> : null}
          </Pressable>
        );
      })}

      {draft === null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="React with another emoji"
          style={chipStyle}
          onPress={() => setDraft('')}>
          <Ionicons name="add" size={16} color={colors.muted} />
        </Pressable>
      ) : (
        <TextInput
          style={[chipStyle, styles.input]}
          value={draft}
          onChangeText={pick}
          onBlur={() => setDraft(null)}
          placeholder="😀"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Type an emoji to react with"
          autoFocus
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
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
  chipOnCard: {
    backgroundColor: colors.background,
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
  input: {
    color: colors.text,
    fontSize: 16,
    minWidth: 56,
    paddingVertical: 2,
  },
});
