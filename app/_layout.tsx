import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../lib/AuthProvider';
import { getPermissionLevel, resumeBackgroundUpdates } from '../lib/locationService';
import { registerForPushNotifications } from '../lib/notifications';
import { hasSeenLocationIntro } from '../lib/onboarding';
import { checkInAt } from '../lib/statusSync';
import { colors } from '../lib/theme';
import { clearPendingVenue, VENUE_PROMPT_CONFIRM, VENUE_PROMPT_DISMISS } from '../lib/venuePrompt';

type BarEventPayload = {
  friendId?: string;
  kind?: string;
  barId?: string;
  postId?: string;
  event?: string;
};

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

  useEffect(() => {
    if (!session) return;

    const resume = () => {
      // Nothing here is worth an error to the user: the tracking either
      // restarts or the next launch tries again.
      void resumeBackgroundUpdates().catch(() => undefined);
    };

    resume();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') resume();
    });

    return () => subscription.remove();
  }, [session]);

  // iOS never offers Always in its first dialog and only allows one upgrade
  // prompt per install, so the explainer runs before either of them.
  useEffect(() => {
    if (!session) return;

    let stale = false;
    void (async () => {
      try {
        const [seen, level] = await Promise.all([hasSeenLocationIntro(), getPermissionLevel()]);
        if (stale || seen || level === 'background') return;
        router.replace('/location-access');
      } catch {
        // The explainer is a nicety; failing to read it must not block the app.
      }
    })();

    return () => {
      stale = true;
    };
  }, [session, router]);

  // "Bob is at the bar" says nothing about where; tapping it opens Bob, which
  // only renders his bar if the friendship still allows it.
  const tapped = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!session || !tapped) return;

    const { friendId, kind, barId, postId, event } = tapped.notification.request.content
      .data as BarEventPayload;
    if (friendId && event === 'requested') {
      // Not friends yet, so only the limited profile — where the request can be
      // accepted — is open to them.
      router.push(`/user/${friendId}`);
      return;
    }
    if (friendId) {
      // A drink post opens on the photo it announced; everything else opens the
      // gallery as it stands.
      router.push(postId ? `/friend/${friendId}?post=${postId}` : `/friend/${friendId}`);
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
        // Without this iOS labels the button with the previous route's name,
        // which is the tab group's own "(tabs)".
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      {/* iOS takes the back label from the previous screen's title when a screen
          does not carry headerBackTitle of its own, and the group's route name
          is "(tabs)". The header here is hidden, so the title is only ever read
          as that label. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
      <Stack.Screen name="location-access" options={{ headerShown: false }} />
      <Stack.Screen name="friend/[id]" options={{ title: 'Friend', headerBackTitle: 'Back' }} />
      <Stack.Screen name="user/[id]" options={{ title: 'Profile', headerBackTitle: 'Back' }} />
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
