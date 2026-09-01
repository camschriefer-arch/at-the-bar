import AsyncStorage from '@react-native-async-storage/async-storage';

const SHARING_KEY = 'atb:sharing';

/**
 * Whether the user has taken themselves offline. Sharing is on by default once
 * permission is granted; going offline is an explicit, remembered choice, so a
 * relaunch cannot quietly put someone back on the map.
 */
export async function isSharingEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SHARING_KEY)) !== 'off';
}

export async function setSharingEnabled(enabled: boolean): Promise<void> {
  if (enabled) await AsyncStorage.removeItem(SHARING_KEY);
  else await AsyncStorage.setItem(SHARING_KEY, 'off');
}
