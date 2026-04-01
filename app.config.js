const appJson = require("./app.json");

const baseExpo = appJson.expo || {};

const normalizeVariant = (value) => {
  const raw = String(value || "A").trim().toUpperCase();
  return raw === "B" ? "B" : "A";
};

module.exports = ({ config }) => {
  const variant = normalizeVariant(process.env.APP_VARIANT);
  const isVariantB = variant === "B";
  const appName = isVariantB ? "cup_B" : "cup_A";
  const slug = isVariantB ? "cup-user-test-app-b" : "cup-user-test-app-a";
  const bundleIdBase = "com.andrewstordy.cupusertestapp";
  const bundleIdentifier = isVariantB ? `${bundleIdBase}.b` : `${bundleIdBase}.a`;

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
      appVariant: variant,
      appDisplayName: appName,
    },
  };
};
