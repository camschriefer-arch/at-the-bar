import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { fetchMyProfile, fetchMyStatus } from '../../lib/api';
import { useAuth } from '../../lib/AuthProvider';
import {
  getPermissionLevel,
  getCurrentPoint,
  requestLocationPermissions,
  startBackgroundUpdates,
  stopBackgroundUpdates,
  type PermissionLevel,
} from '../../lib/locationService';
import { clearStatus, syncStatusForLocation } from '../../lib/statusSync';
import { colors, spacing } from '../../lib/theme';
import type { Bar, Profile } from '../../lib/types';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [bar, setBar] = useState<Bar | null>(null);
  const [permission, setPermission] = useState<PermissionLevel>('denied');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [me, status, level] = await Promise.all([
        fetchMyProfile(userId),
        fetchMyStatus(userId),
        getPermissionLevel(),
      ]);
      setProfile(me);
      setBar(status.bar);
      setPermission(level);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your profile');
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const enableSharing = async () => {
    setBusy(true);
    setError(null);
    try {
      const level = await requestLocationPermissions();
      setPermission(level);

      if (level === 'denied') {
        setError('Location permission is required to set your status.');
        return;
      }

      if (level === 'background') await startBackgroundUpdates();

      const point = await getCurrentPoint();
      const result = await syncStatusForLocation(point);
      setBar(result.bar);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enable sharing');
    } finally {
      setBusy(false);
    }
  };

  const goOffline = async () => {
    setBusy(true);
    setError(null);
    try {
      await stopBackgroundUpdates();
      await clearStatus();
      setBar(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not go offline');
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = async () => {
    setBusy(true);
    setError(null);
    try {
      const point = await getCurrentPoint();
      const result = await syncStatusForLocation(point);
      setBar(result.bar);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check your location');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.name}>{profile?.display_name ?? '…'}</Text>
        <Text style={styles.muted}>{profile?.email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Your status</Text>
        {bar ? (
          <>
            <Text style={styles.status}>At the bar</Text>
            <Text style={styles.barName}>{bar.name}</Text>
            <Text style={styles.muted}>{[bar.city, bar.state].filter(Boolean).join(', ')}</Text>
          </>
        ) : (
          <Text style={styles.muted}>Not at a bar. Friends see nothing.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Location sharing</Text>
        <Text style={styles.muted}>
          {permission === 'background'
            ? 'On, including in the background.'
            : permission === 'foreground'
              ? 'On while the app is open. Allow "Always" to update in the background.'
              : 'Off. Friends cannot see when you are out.'}
        </Text>
        <Text style={styles.fineprint}>
          Your coordinates stay on your phone. Only the bar you are at is stored, and only friends
          you accepted can see it.
        </Text>
        <View style={styles.actions}>
          <Button
            title={permission === 'denied' ? 'Enable sharing' : 'Check in now'}
            onPress={permission === 'denied' ? enableSharing : refreshStatus}
            loading={busy}
          />
          <Button title="Go offline" variant="secondary" onPress={goOffline} disabled={busy} />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  status: {
    color: colors.text,
    fontSize: 16,
  },
  barName: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '600',
  },
  muted: {
    color: colors.muted,
  },
  fineprint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
  },
});
