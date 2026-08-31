import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { acceptInvite, inviteByEmail } from '../../lib/api';
import { colors, spacing } from '../../lib/theme';

export default function InviteScreen() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const send = async () => {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await inviteByEmail(email.trim());

      if (result.kind === 'friendship') {
        setNotice(
          result.status === 'accepted'
            ? 'You are already friends.'
            : 'Friend request sent. They will see it in the app.'
        );
      } else {
        const url = Linking.createURL('/redeem', { queryParams: { token: result.token } });
        await Share.share({
          message: `Join me on At The Bar: ${url}`,
        });
        setNotice(`Invite created for ${result.email}.`);
      }

      setEmail('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the invite');
    } finally {
      setSending(false);
    }
  };

  const redeem = async () => {
    setRedeeming(true);
    setError(null);
    setNotice(null);
    try {
      await acceptInvite(token.trim());
      setNotice('Invite accepted. You are now friends.');
      setToken('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not accept the invite');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.title}>Invite a friend</Text>
        <Text style={styles.muted}>
          If they already have an account they get a friend request. Otherwise you get an invite
          link to send them.
        </Text>
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          value={email}
        />
        <Button title="Send invite" onPress={send} loading={sending} disabled={!email.trim()} />
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Have an invite code?</Text>
        <Field label="Invite code" autoCapitalize="none" onChangeText={setToken} value={token} />
        <Button
          title="Accept invite"
          variant="secondary"
          onPress={redeem}
          loading={redeeming}
          disabled={!token.trim()}
        />
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  muted: {
    color: colors.muted,
  },
  notice: {
    color: colors.accent,
  },
  error: {
    color: colors.danger,
  },
});
