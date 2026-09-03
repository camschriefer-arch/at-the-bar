import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../lib/AuthProvider';
import { registerForPushNotifications } from '../lib/notifications';
import { checkInAt } from '../lib/statusSync';
import { colors } from '../lib/theme';
import { clearPendingVenue, VENUE_PROMPT_CONFIRM, VENUE_PROMPT_DISMISS } from '../lib/venuePrompt';

type BarEventPayload = { friendId?: string; kind?: string; barId?: string };

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  useEffect(() => {
    if (!session) return;
    // A refused permission is a normal outcome; the rest of the app works.
    registerForPushNotifications().catch(() => undefined);
  }, [session]);

  // "Bob is at the bar" says nothing about where; tapping it opens Bob, which
  // only renders his bar if the friendship still allows it.
  const tapped = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!session || !tapped) return;

    const { friendId, kind, barId } = tapped.notification.request.content.data as BarEventPayload;
    if (friendId) {
      router.push(`/friend/${friendId}`);
      return;
    }

    if (kind !== 'venue-confirm' && kind !== 'venue-choose') return;

    // The response outlives its handling, so it is cleared to keep a relaunch
    // from checking the user in at a restaurant they left hours ago.
    void Notifications.clearLastNotificationResponseAsync();

    if (tapped.actionIdentifier === VENUE_PROMPT_DISMISS) {
      void clearPendingVenue();
    } else if (tapped.actionIdentifier === VENUE_PROMPT_CONFIRM && barId) {
      void checkInAt(barId);
    } else {
      // Tapping the notification itself opens the screen that asks again.
      router.push('/(tabs)/profile');
    }
  }, [session, tapped, router]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="friend/[id]" options={{ title: 'Friend' }} />
      <Stack.Screen name="redeem" options={{ title: 'Invite' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
