if (!Array.prototype.toReversed) {
  Object.defineProperty(Array.prototype, "toReversed", {
    value() {
      return [...this].reverse();
    },
  });
}

const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
