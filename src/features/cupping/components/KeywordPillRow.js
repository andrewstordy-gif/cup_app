import React from "react";
import { StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";

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

export function KeywordPillRow({ pills = [], scale = 1, outline = false, style }) {
  if (!Array.isArray(pills) || pills.length === 0) {
    return null;
  }

  return (
    <View style={[styles.row, { gap: 7 * scale }, style]}>
      {pills.map((pill, index) => {
        if (outline) {
          return (
            <View
              key={`${pill.keyword || pill.label}-${index}`}
              style={[
                styles.pill,
                styles.pillOutline,
                {
                  borderRadius: 15 * scale,
                  paddingHorizontal: 11 * scale,
                  paddingVertical: 3 * scale,
                },
              ]}
            >
              <Text style={styles.textOutline}>{pill.label || pill.keyword}</Text>
            </View>
          );
        }

        const backgroundColour = pill.colour || "#3f4852";
        return (
          <View
            key={`${pill.keyword || pill.label}-${backgroundColour}-${index}`}
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
                { color: getReadableTextColour(backgroundColour) },
              ]}
            >
              {pill.label || pill.keyword}{pill.tempC != null ? ` ${Math.round(pill.tempC)}°` : ""}
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
  pillOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    ...typography.text_secondary_body,
  },
  textOutline: {
    ...typography.text_secondary_body,
    color: colors.ink,
  },
});
