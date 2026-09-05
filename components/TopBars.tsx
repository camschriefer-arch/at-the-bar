import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../lib/theme';
import type { TopBar } from '../lib/types';

type TopBarsProps = {
  bars: TopBar[];
  emptyLabel: string;
  onForget?: (bar: TopBar) => void;
};

export function TopBars({ bars, emptyLabel, onForget }: TopBarsProps) {
  const [editing, setEditing] = useState(false);

  if (bars.length === 0) return <Text style={styles.muted}>{emptyLabel}</Text>;

  // Forgetting a bar deletes every visit and cannot be undone, so it takes a
  // deliberate trip through Edit and a confirmation rather than one stray tap.
  const confirmForget = (bar: TopBar) =>
    Alert.alert(`Forget ${bar.bar_name}?`, 'This deletes your visits there. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => onForget?.(bar),
      },
    ]);

  return (
    <View style={styles.list}>
      {onForget ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Stop editing your bars' : 'Edit your bars'}
          hitSlop={12}
          style={styles.editRow}
          onPress={() => setEditing((current) => !current)}>
          <Text style={styles.edit}>{editing ? 'Done' : 'Edit'}</Text>
        </Pressable>
      ) : null}
      {bars.map((bar, index) => (
        <View key={bar.bar_id} style={styles.row}>
          <Text style={styles.rank}>{index + 1}</Text>
          <View style={styles.details}>
            <Text style={styles.name} numberOfLines={1}>
              {bar.bar_name}
            </Text>
            <Text style={styles.muted} numberOfLines={1}>
              {[[bar.bar_city, bar.bar_state].filter(Boolean).join(', '), visitLabel(bar.visits)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {onForget && editing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${bar.bar_name}`}
              hitSlop={12}
              onPress={() => confirmForget(bar)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function visitLabel(visits: number): string {
  return visits === 1 ? '1 visit' : `${visits} visits`;
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  rank: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
    width: 18,
  },
  details: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  muted: {
    color: colors.muted,
  },
  editRow: {
    alignSelf: 'flex-end',
  },
  edit: {
    color: colors.accent,
    fontSize: 13,
  },
  remove: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
