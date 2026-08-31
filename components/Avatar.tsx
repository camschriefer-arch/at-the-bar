import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';

type AvatarProps = {
  uri: string | null;
  name: string;
  size?: number;
};

export function Avatar({ uri, name, size = 72 }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={uri} style={[styles.image, style]} contentFit="cover" transition={150} />;
  }

  return (
    <View style={[styles.fallback, style]}>
      <Text style={[styles.initial, { fontSize: size / 2.4 }]}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surface,
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: 'center',
  },
  initial: {
    color: colors.accent,
    fontWeight: '800',
  },
});
