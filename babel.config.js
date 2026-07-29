module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin must be last — Reanimated 4 requires it.
    plugins: ['react-native-worklets/plugin'],
  };
};
