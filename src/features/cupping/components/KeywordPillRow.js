import React from "react";
import { StyleSheet, Text, View } from "react-native";

function getReadableTextColour(backgroundColour) {
  const hex = String(backgroundColour || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return "#ffffff";
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72 ? "#222222" : "#ffffff";
}

export function KeywordPillRow({ pills = [], scale = 1, style }) {
  if (!Array.isArray(pills) || pills.length === 0) {
    return null;
  }

  return (
    <View style={[styles.row, { gap: 7 * scale }, style]}>
      {pills.map((pill) => {
        const backgroundColour = pill.colour || "#3f4852";
        return (
          <View
            key={`${pill.keyword}-${backgroundColour}`}
            style={[
              styles.pill,
              {
                borderRadius: 15 * scale,
                paddingHorizontal: 11 * scale,
                paddingVertical: 3 * scale,
                backgroundColor: backgroundColour,
              },
            ]}
          >
            <Text
              style={[
                styles.text,
                {
                  fontSize: 16 * scale,
                  lineHeight: 20 * scale,
                  color: getReadableTextColour(backgroundColour),
                },
              ]}
            >
              {pill.label || pill.keyword}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  pill: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "800",
    letterSpacing: 0,
  },
});
