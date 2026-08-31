// Injects the Google Maps keys from the environment so they stay out of git.
// A Google key can carry only one application restriction, so iOS (bundle id)
// and Android (package + SHA-1) need separate keys; EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
// is the fallback for when you only have one. app.json holds everything else.
const iosKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS ??
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
  '';
const androidKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID ??
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
  '';

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    config: { ...config.ios?.config, googleMapsApiKey: iosKey },
  },
  android: {
    ...config.android,
    config: { ...config.android?.config, googleMaps: { apiKey: androidKey } },
  },
});
