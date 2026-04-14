const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude PowerSync native modules from web builds
// They use native SQLite which doesn't work on web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName.includes('@powersync/react-native') ||
      moduleName.includes('@powersync/react') ||
      moduleName.includes('@powersync/common') ||
      moduleName.includes('@journeyapps/react-native-quick-sqlite'))
  ) {
    return {
      type: 'empty',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
