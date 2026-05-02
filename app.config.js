const appJson = require("./app.json");

const baseExpo = appJson.expo || {};
const appName = "cup";
const slug = "cup";
const bundleIdentifier = "com.andrewstordy.cup";

module.exports = ({ config }) => {
  return {
    ...config,
    ...baseExpo,
    name: appName,
    slug,
    ios: {
      ...(baseExpo.ios || {}),
      bundleIdentifier,
      infoPlist: {
        ...((baseExpo.ios && baseExpo.ios.infoPlist) || {}),
        CFBundleDisplayName: appName,
      },
    },
    android: {
      ...(baseExpo.android || {}),
      package: bundleIdentifier,
    },
    extra: {
      ...(baseExpo.extra || {}),
      appDisplayName: appName,
    },
  };
};
