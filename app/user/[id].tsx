import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import {
  fetchIncomingRequestId,
  fetchPublicProfile,
  requestFriend,
  respondToRequest,
} from '../../lib/api';
import { signedAvatarUrl } from '../../lib/photos';
import { colors, spacing } from '../../lib/theme';
import type { PublicProfile } from '../../lib/types';

/**
 * Someone you are not friends with, reached from a comment on a photo. Their
 * name and picture are all this screen can show; everything else needs an
 * accepted friendship.
 */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const row = await fetchPublicProfile(id);
      setProfile(row);
      setError(null);
      if (!row) return;

      setRequestId(row.friend_state === 'incoming' ? await fetchIncomingRequestId(id) : null);
      setAvatarUrl(await signedAvatarUrl(row.avatar_url).catch(() => null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>This profile is not available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: profile.display_name, headerBackTitle: 'Back' }} />

      <Avatar uri={avatarUrl} name={profile.display_name} size={96} />
      <Text style={styles.name}>{profile.display_name}</Text>

      {profile.friend_state === 'friends' ? (
        <Button title="Open profile" onPress={() => router.replace(`/friend/${profile.id}`)} />
      ) : null}

      {profile.friend_state === 'none' ? (
        <Button
          title="Add friend"
          disabled={busy}
          onPress={() => void run(() => requestFriend(profile.id), 'Could not send that request')}
        />
      ) : null}

      {profile.friend_state === 'requested' ? <Text style={styles.muted}>Request sent</Text> : null}

      {profile.friend_state === 'incoming' && requestId ? (
        <>
          <Text style={styles.muted}>{profile.display_name} wants to be your friend.</Text>
          <Button
            title="Accept"
            disabled={busy}
            onPress={() =>
              void run(() => respondToRequest(requestId, true), 'Could not accept that request')
            }
          />
          <Button
            title="Decline"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              void run(() => respondToRequest(requestId, false), 'Could not decline that request')
            }
          />
        </>
      ) : null}

      {profile.friend_state !== 'self' && profile.friend_state !== 'friends' ? (
        <Text style={styles.note}>
          You will only see where {profile.display_name} is out once you are friends.
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  muted: {
    color: colors.muted,
  },
  note: {
    color: colors.muted,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
  },
});
