// Injects the Android Google Maps key from the environment so it stays out of git.
// iOS renders with Apple Maps: react-native-maps' iOS Google backend now ships as
// the `react-native-maps/Google` subspec, while Expo's built-in Maps plugin still
// writes `pod 'react-native-google-maps'` when `ios.config.googleMapsApiKey` is
// set, which fails `pod install`. app.json holds everything else.
const androidKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID ??
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
  '';

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: { ...config.android?.config, googleMaps: { apiKey: androidKey } },
  },
});
