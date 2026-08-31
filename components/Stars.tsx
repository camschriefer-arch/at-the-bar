import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';

const VALUES = [1, 2, 3, 4, 5];

type StarsProps = {
  rating: number;
  onChange?: (rating: number) => void;
  size?: number;
};

export function Stars({ rating, onChange, size = 18 }: StarsProps) {
  if (!onChange) {
    return (
      <Text accessibilityLabel={`${rating} out of 5`} style={[styles.static, { fontSize: size }]}>
        {'★'.repeat(rating) + '☆'.repeat(VALUES.length - rating)}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      {VALUES.map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${value} out of 5`}
          hitSlop={6}
          onPress={() => onChange(value)}>
          <Text style={[styles.star, { fontSize: size }, value > rating && styles.empty]}>
            {value <= rating ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  star: {
    color: colors.accent,
  },
  empty: {
    color: colors.muted,
  },
  static: {
    color: colors.accent,
    letterSpacing: 2,
  },
});
