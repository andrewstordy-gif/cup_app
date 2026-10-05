#!/usr/bin/env node

// Check only the live app projects; archived and mock projects are not release inputs.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const uniqueMatch = (source, pattern, label) => {
  const matches = [...source.matchAll(pattern)];
  check(matches.length === 1, `Expected one ${label}; found ${matches.length}`);
  return matches.length === 1 ? matches[0][1] : undefined;
};

const appJson = JSON.parse(read("app.json"));
const expo = require(path.join(root, "app.config.js"))({ config: appJson.expo });
const packageJson = JSON.parse(read("package.json"));
const project = read("ios/cup.xcodeproj/project.pbxproj");
const plist = read("ios/cup/Info.plist");
const gradle = read("android/app/build.gradle");

check(/^\d+\.\d+\.\d+$/.test(expo.version || ""), "Expo public version must be numeric major.minor.patch");
check(/^\d+$/.test(String(expo.ios?.buildNumber || "")), "Expo iOS build number must be a positive integer");
check(Number(expo.ios?.buildNumber) > 0, "Expo iOS build number must be positive");
check(Number.isInteger(expo.android?.versionCode) && expo.android.versionCode > 0, "Expo Android versionCode must be a positive integer");
check(appJson.expo.version === expo.version, "app.json public version differs from live Expo config");
check(appJson.expo.ios?.buildNumber === expo.ios?.buildNumber, "app.json iOS build number differs from live Expo config");
check(appJson.expo.android?.versionCode === expo.android?.versionCode, "app.json Android versionCode differs from live Expo config");
check(packageJson.version === expo.version, `package.json version ${packageJson.version} differs from Expo ${expo.version}`);

const targetConfigs = uniqueMatch(
  project,
  /13B07F931A680F5B00A75B9A \/\* Build configuration list for PBXNativeTarget "cup" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/g,
  "cup native target configuration list",
);
for (const configName of ["Debug", "Release"]) {
  const id = targetConfigs && uniqueMatch(
    targetConfigs,
    new RegExp(`([A-F0-9]{24}) \\/\\* ${configName} \\*\\/`, "g"),
    `cup ${configName} configuration ID`,
  );
  if (!id) continue;
  const block = uniqueMatch(
    project,
    new RegExp(`${id} \\/\\* ${configName} \\*\\/ = \\{([\\s\\S]*?)\\n\\t\\t\\};`, "g"),
    `cup ${configName} build configuration`,
  );
  if (!block) continue;
  const marketing = uniqueMatch(block, /\bMARKETING_VERSION = ([^;]+);/g, `${configName} MARKETING_VERSION`);
  const build = uniqueMatch(block, /\bCURRENT_PROJECT_VERSION = ([^;]+);/g, `${configName} CURRENT_PROJECT_VERSION`);
  check(marketing === expo.version, `iOS ${configName} MARKETING_VERSION ${marketing} differs from Expo ${expo.version}`);
  check(build === String(expo.ios?.buildNumber), `iOS ${configName} CURRENT_PROJECT_VERSION ${build} differs from Expo ${expo.ios?.buildNumber}`);
}

const plistValue = (key) => uniqueMatch(plist, new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]*)<\\/string>`, "g"), `Info.plist ${key}`);
check(plistValue("CFBundleShortVersionString") === "$(MARKETING_VERSION)", "Info.plist public version must use $(MARKETING_VERSION)");
check(plistValue("CFBundleVersion") === "$(CURRENT_PROJECT_VERSION)", "Info.plist build number must use $(CURRENT_PROJECT_VERSION)");

const defaultConfig = uniqueMatch(gradle, /\bdefaultConfig\s*\{([\s\S]*?)\n\s*\}/g, "Android defaultConfig");
if (defaultConfig) {
  const versionName = uniqueMatch(defaultConfig, /\bversionName\s+"([^"]+)"/g, "Android versionName");
  const versionCode = uniqueMatch(defaultConfig, /\bversionCode\s+(\d+)\b/g, "Android versionCode");
  check(versionName === expo.version, `Android versionName ${versionName} differs from Expo ${expo.version}`);
  check(versionCode === String(expo.android?.versionCode), `Android versionCode ${versionCode} differs from Expo ${expo.android?.versionCode}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS live app version metadata: iOS ${expo.version} (${expo.ios.buildNumber}); Android ${expo.version} (${expo.android.versionCode})`);
}
