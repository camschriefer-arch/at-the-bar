import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { acceptInvite, createInviteLink, inviteByEmail } from '../../lib/api';
import { inviteToken } from '../../lib/inviteToken';
import { colors, spacing } from '../../lib/theme';

function inviteUrl(token: string): string {
  return Linking.createURL('/redeem', { queryParams: { token } });
}

export default function InviteScreen() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const createLink = async () => {
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createInviteLink();
      setLink(inviteUrl(created.token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create an invite link');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    setNotice('Invite link copied.');
  };

  const shareLink = async () => {
    if (!link) return;
    await Share.share({ message: `Join me on At The Bar: ${link}` });
  };

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
        await Share.share({
          message: `Join me on At The Bar: ${inviteUrl(result.token)}`,
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
      await acceptInvite(inviteToken(token));
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
        <Text style={styles.title}>Invite by link</Text>
        <Text style={styles.muted}>
          Anyone who opens this link becomes your friend, so only send it to people you want
          seeing when you are out. It lasts 30 days or until someone uses it.
        </Text>
        {link ? (
          <>
            <Text style={styles.link} selectable>
              {link}
            </Text>
            <Button title="Copy link" onPress={copyLink} />
            <Button title="Send it" variant="secondary" onPress={shareLink} />
          </>
        ) : (
          <Button title="Create invite link" onPress={createLink} loading={creating} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Invite by email</Text>
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
        <Text style={styles.muted}>Paste the code or the whole link a friend sent you.</Text>
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
  link: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
    color: colors.text,
    padding: spacing.sm,
  },
  notice: {
    color: colors.accent,
  },
  error: {
    color: colors.danger,
  },
});
