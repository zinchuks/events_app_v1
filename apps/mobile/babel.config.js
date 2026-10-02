// Adapted from Obytes: Expo preset retained; unused module/reanimated plugins removed.
module.exports = function (api) {
  api.cache(true);
  return { presets: [['babel-preset-expo', { web: { unstable_transformImportMeta: true } }]] };
};
