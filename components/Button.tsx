import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '../lib/theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        (pressed || isDisabled) && styles.dimmed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.background : colors.text} />
      ) : (
        <Text style={variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    paddingVertical: spacing.sm + 6,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
  },
  dimmed: {
    opacity: 0.6,
  },
  primaryLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
