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
      moduleName.includes('@journeyapps/react-native-quick-sqlite') ||
      moduleName.includes('react-native-vision-camera') ||
      moduleName.includes('react-native-vision-camera-mlkit') ||
      moduleName.includes('react-native-worklets-core'))
  ) {
    return {
      type: 'empty',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
