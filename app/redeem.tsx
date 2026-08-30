import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { acceptInvite } from '../lib/api';
import { colors, spacing } from '../lib/theme';

export default function InviteDeepLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState(
    token ? 'Accepting your invite…' : 'This invite link is missing its code.'
  );

  useEffect(() => {
    if (!token) return;

    acceptInvite(token)
      .then(() => {
        setState('done');
        setMessage('You are now friends.');
      })
      .catch((cause: unknown) => {
        setState('error');
        setMessage(cause instanceof Error ? cause.message : 'Could not accept this invite');
      });
  }, [token]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Invite' }} />
      {state === 'working' ? <ActivityIndicator color={colors.accent} /> : null}
      <Text style={state === 'error' ? styles.error : styles.message}>{message}</Text>
      {state !== 'working' ? (
        <Button title="Go to friends" onPress={() => router.replace('/(tabs)')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  message: {
    color: colors.text,
    fontSize: 18,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 16,
    textAlign: 'center',
  },
});
