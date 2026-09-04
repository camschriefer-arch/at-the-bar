import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../lib/theme';
import type { TopBar } from '../lib/types';

type TopBarsProps = {
  bars: TopBar[];
  emptyLabel: string;
  onForget?: (bar: TopBar) => void;
};

export function TopBars({ bars, emptyLabel, onForget }: TopBarsProps) {
  if (bars.length === 0) return <Text style={styles.muted}>{emptyLabel}</Text>;

  return (
    <View style={styles.list}>
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
          {onForget ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Forget ${bar.bar_name}`}
              hitSlop={12}
              onPress={() => onForget(bar)}>
              <Text style={styles.forget}>Forget</Text>
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
  forget: {
    color: colors.muted,
    fontSize: 13,
  },
});
