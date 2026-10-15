export default ({ config }) => ({
  ...config,
  plugins: Array.from(
    new Set([...(config.plugins ?? []), "expo-web-browser"])
  ),
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
});
