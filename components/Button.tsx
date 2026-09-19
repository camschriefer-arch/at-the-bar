import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '../lib/theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'quietOn';
  size?: 'regular' | 'small';
};

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'regular',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const onDark = variant === 'primary' || variant === 'quietOn';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'small' && styles.small,
        fills[variant],
        (pressed || isDisabled) && styles.dimmed,
      ]}>
      {loading ? (
        <ActivityIndicator color={onDark ? colors.background : colors.text} />
      ) : (
        <Text style={[labels[variant], size === 'small' && styles.smallLabel]}>{title}</Text>
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
  small: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
  },
  quiet: {
    backgroundColor: 'transparent',
    borderColor: colors.quiet,
    borderWidth: 1,
  },
  quietOn: {
    backgroundColor: colors.quiet,
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
  quietLabel: {
    color: colors.quiet,
    fontSize: 16,
    fontWeight: '600',
  },
  smallLabel: {
    fontSize: 13,
  },
});

const fills = {
  primary: styles.primary,
  secondary: styles.secondary,
  quiet: styles.quiet,
  quietOn: styles.quietOn,
};

const labels = {
  primary: styles.primaryLabel,
  secondary: styles.secondaryLabel,
  quiet: styles.quietLabel,
  quietOn: styles.primaryLabel,
};
