import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import {
  requestAlwaysPermission,
  requestLocationPermissions,
  startBackgroundUpdates,
  type PermissionLevel,
} from '../lib/locationService';
import { markLocationIntroSeen } from '../lib/onboarding';
import { isSharingEnabled } from '../lib/sharing';
import { colors, spacing } from '../lib/theme';

/**
 * Shown once, before the system dialogs. iOS grants one Always upgrade prompt
 * per install and never offers Always in the first dialog, so the reason for
 * it has to land before the user is asked.
 */
export default function LocationAccess() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<PermissionLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    await markLocationIntroSeen();
    router.replace('/(tabs)');
  };

  const startBackgroundIfSharing = async () => {
    if (await isSharingEnabled()) await startBackgroundUpdates();
  };

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const granted = await requestLocationPermissions();
      setLevel(granted);

      if (granted === 'background') {
        await startBackgroundIfSharing();
        await done();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not ask for location');
    } finally {
      setBusy(false);
    }
  };

  const askAlways = async () => {
    setBusy(true);
    setError(null);
    try {
      const granted = await requestAlwaysPermission();
      setLevel(granted);

      if (granted === 'background') {
        await startBackgroundIfSharing();
        await done();
        return;
      }

      // The upgrade dialog is one-shot, and after "Allow Once" the system
      // refuses it outright, so Settings is the only remaining route.
      await Linking.openSettings();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not ask for Always');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
      ]}>
      <Text style={styles.title}>Let friends know you are out</Text>

      <View style={styles.card}>
        <Text style={styles.body}>
          At The Bar watches for you settling in at a bar, pub or restaurant, then asks whether to
          tell your friends. Your phone is usually in your pocket by then, so it needs location
          access set to &quot;Always&quot; to notice at all.
        </Text>
        <Text style={styles.body}>
          iOS asks in two steps: first whether the app can use your location, then whether it can
          keep doing so in the background. Choose &quot;Allow While Using App&quot;, then
          &quot;Change to Always Allow&quot;.
        </Text>
        <Text style={styles.fineprint}>
          Your coordinates never leave your phone. Only a bar you confirm is stored, only friends
          you accepted can see it, and nothing is shared while you are anywhere else.
        </Text>
      </View>

      {level === 'foreground' ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            Location is on while the app is open, which is not enough to catch you arriving
            somewhere. Allow &quot;Always&quot; to finish.
          </Text>
        </View>
      ) : null}

      {level === 'denied' ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            Without location the app cannot set your status. You can still use it to see friends,
            and turn sharing on later from the You tab.
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {level === 'foreground' ? (
          <Button title="Allow Always" onPress={askAlways} loading={busy} />
        ) : (
          <Button
            title={level === 'denied' ? 'Ask again' : 'Continue'}
            onPress={ask}
            loading={busy}
          />
        )}
        <Button title="Not now" variant="secondary" onPress={() => void done()} disabled={busy} />
      </View>
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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  body: {
    color: colors.text,
    fontSize: 15,
  },
  fineprint: {
    color: colors.muted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
  },
  actions: {
    gap: spacing.sm,
  },
});
