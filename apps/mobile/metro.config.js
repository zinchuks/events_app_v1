const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
});

// Keep RN Web's barrel exports pointed at its own components. Replacing these
// internal exports with Uniwind wrappers creates a cycle during development.
const resolveUniwind = uniwindConfig.resolver.resolveRequest;
uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && context.originModulePath.endsWith('/react-native-web/dist/index.js')) {
    return (config.resolver.resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  }
  return resolveUniwind(context, moduleName, platform);
};

module.exports = uniwindConfig;
