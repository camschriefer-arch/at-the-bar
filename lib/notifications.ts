import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const TOKEN_KEY = 'atb:pushToken';
const ANDROID_CHANNEL = 'bar-events';

type EasExtra = { eas?: { projectId?: string } };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function projectId(): string {
  const extra = Constants.expoConfig?.extra as EasExtra | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!id) {
    throw new Error(
      'Missing EAS project id. Run `eas init` so push tokens can be issued for this app.'
    );
  }

  return id;
}

/**
 * Asks for notification permission and stores this device's Expo push token
 * against the signed-in user. Returns null when the user says no.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Friends at the bar',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });

  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw error;

  await AsyncStorage.setItem(TOKEN_KEY, token);
  return token;
}

/** Stops this device receiving a signed-out account's notifications. */
export async function unregisterPushNotifications(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;

  await AsyncStorage.removeItem(TOKEN_KEY);
  await supabase.rpc('unregister_push_token', { p_token: token });
}

/**
 * Nudges the sender so friends hear about a check-in immediately. The queue is
 * also swept on a schedule, so a failure here only costs latency.
 */
export async function flushPendingNotifications(): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: {} });
  } catch {
    // Delivery is the cron sweep's problem from here.
  }
}
