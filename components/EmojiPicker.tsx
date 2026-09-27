import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { EMOJI_GROUPS } from '../lib/emojiSet';
import { colors, spacing } from '../lib/theme';

type EmojiPickerProps = {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
};

/**
 * A grid of emoji to tap. The keyboard's emoji panel cannot be opened by an
 * app on either platform, so reacting with anything beyond the offered three
 * happens in here rather than behind a text box.
 */
export function EmojiPicker({ visible, onPick, onClose }: EmojiPickerProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Text style={styles.title}>Pick an emoji</Text>

        <ScrollView contentContainerStyle={styles.groups}>
          {EMOJI_GROUPS.map((group) => (
            <View key={group.name} style={styles.group}>
              <Text style={styles.groupName}>{group.name}</Text>
              <View style={styles.grid}>
                {group.emojis.map((emoji) => (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${emoji}`}
                    style={styles.cell}
                    onPress={() => onPick(emoji)}>
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <Button title="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    padding: spacing.md,
    paddingTop: spacing.xl + spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  groups: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  group: {
    gap: spacing.xs,
  },
  groupName: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emoji: {
    fontSize: 26,
  },
});
