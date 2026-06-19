import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";

function ScoreBox({ label, score, isFinal, scale }) {
  return (
    <View style={[styles.scoreItem, { gap: 4 * scale }]}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View
        style={[
          styles.scoreBox,
          {
            width: 46 * scale,
            height: 46 * scale,
            borderRadius: 7 * scale,
            borderWidth: 2 * scale,
          },
          isFinal && styles.scoreBoxFinal,
        ]}
      >
        <Text style={[styles.scoreBoxText, isFinal && styles.scoreBoxTextFinal]}>
          {score ?? "-"}
        </Text>
      </View>
    </View>
  );
}

function TotalBox({ total, scale }) {
  const hasScore = total != null;
  const displayValue = hasScore ? parseFloat(total.toFixed(2)).toString() : "P";
  return (
    <View style={[styles.scoreItem, styles.totalItem, { gap: 4 * scale }]}>
      <Text style={styles.scoreLabel}>Total</Text>
      <View
        style={[
          styles.scoreBox,
          styles.totalBox,
          {
            height: 46 * scale,
            borderRadius: 7 * scale,
            borderWidth: 2 * scale,
          },
          hasScore && styles.totalBoxFilled,
        ]}
      >
        <Text style={[styles.scoreBoxText, styles.totalBoxInnerText, hasScore && styles.totalBoxText]} numberOfLines={1}>
          {displayValue}
        </Text>
      </View>
    </View>
  );
}

export function ScoreRow({ scores, totalScore, scale }) {
  return (
    <View style={[styles.row, { gap: 4 * scale }]}>
      {scores.map(item => (
        <ScoreBox
          key={item.key}
          label={item.label}
          score={item.score}
          isFinal={item.isFinal}
          scale={scale}
        />
      ))}
      <TotalBox total={totalScore} scale={scale} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    width: "100%",
  },
  scoreItem: {
    alignItems: "center",
  },
  totalItem: {
    flex: 1,
  },
  scoreLabel: {
    ...typography.text_caption,
    fontSize: 9,
    letterSpacing: 0.3,
    color: colors.inkSoft,
  },
  scoreBox: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.quietBorder,
    backgroundColor: colors.surface,
  },
  scoreBoxFinal: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  scoreBoxText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 13,
    includeFontPadding: false,
    color: colors.ink,
  },
  scoreBoxTextFinal: {
    color: "#ffffff",
  },
  totalBox: {
    borderColor: colors.inkSoft,
    borderStyle: "dashed",
    alignSelf: "stretch",
  },
  totalBoxFilled: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderStyle: "solid",
  },
  totalBoxInnerText: {
    fontSize: 11,
    lineHeight: 11,
  },
  totalBoxText: {
    color: "#ffffff",
  },
});
