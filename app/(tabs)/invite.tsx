import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { acceptInvite, createInviteLink, inviteByEmail } from '../../lib/api';
import { failureMessage } from '../../lib/failureMessage';
import { inviteToken } from '../../lib/inviteToken';
import { colors, spacing } from '../../lib/theme';

type Section = 'link' | 'email' | 'code';

type Feedback = { section: Section; text: string; failed: boolean };

function inviteUrl(token: string): string {
  return Linking.createURL('/redeem', { queryParams: { token } });
}

export default function InviteScreen() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const say = (section: Section, text: string) => setFeedback({ section, text, failed: false });
  const fail = (section: Section, cause: unknown, fallback: string) =>
    setFeedback({ section, text: failureMessage(cause, fallback), failed: true });

  const renderFeedback = (section: Section) =>
    feedback?.section === section ? (
      <Text style={feedback.failed ? styles.error : styles.notice}>{feedback.text}</Text>
    ) : null;

  const createLink = async () => {
    setCreating(true);
    setFeedback(null);
    try {
      const created = await createInviteLink();
      setLink(inviteUrl(created.token));
    } catch (cause) {
      fail('link', cause, 'Could not create an invite link');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    say('link', 'Invite link copied.');
  };

  const shareLink = async () => {
    if (!link) return;
    await Share.share({ message: `Join me on At The Bar: ${link}` });
  };

  const send = async () => {
    setSending(true);
    setFeedback(null);
    try {
      const result = await inviteByEmail(email.trim());

      if (result.kind === 'friendship') {
        say(
          'email',
          result.status === 'accepted'
            ? 'You are already friends.'
            : 'Friend request sent. They will see it in the app.'
        );
      } else {
        await Share.share({
          message: `Join me on At The Bar: ${inviteUrl(result.token)}`,
        });
        say('email', `Invite created for ${result.email}.`);
      }

      setEmail('');
    } catch (cause) {
      fail('email', cause, 'Could not send the invite');
    } finally {
      setSending(false);
    }
  };

  const redeem = async () => {
    setRedeeming(true);
    setFeedback(null);
    try {
      await acceptInvite(inviteToken(token));
      say('code', 'Invite accepted. You are now friends.');
      setToken('');
    } catch (cause) {
      fail('code', cause, 'Could not accept the invite');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled">
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
        {renderFeedback('link')}
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
        {renderFeedback('email')}
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
        {renderFeedback('code')}
      </View>
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
