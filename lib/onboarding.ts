import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_INTRO_KEY = 'atb:location-intro';

/**
 * Whether the location explainer has been shown. iOS grants its one Always
 * prompt per install, so it is only worth spending after the user has been
 * told what it buys them.
 */
export async function hasSeenLocationIntro(): Promise<boolean> {
  return (await AsyncStorage.getItem(LOCATION_INTRO_KEY)) === 'seen';
}

export async function markLocationIntroSeen(): Promise<void> {
  await AsyncStorage.setItem(LOCATION_INTRO_KEY, 'seen');
}
