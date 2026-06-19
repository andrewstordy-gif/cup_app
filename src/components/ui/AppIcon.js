import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { iconGlyphs, iconography } from "../../theme/iconography";

export function AppIcon({
  name,
  role = "icon_action",
  color,
  size,
  style,
}) {
  const token = iconography[role] || iconography.icon_action;
  const iconSize = size || token.size;
  const iconColor = color || token.color;

  if (name === "search") {
    return (
      <Ionicons
        accessible={false}
        name="search"
        size={iconSize}
        color={iconColor}
        style={style}
      />
    );
  }

  if (name === "back" || name === "chevron-up" || name === "chevron-down") {
    const strokeLength = iconSize * 0.48;
    const strokeWidth = Math.max(2, iconSize * 0.1);
    const isBack = name === "back";
    const yOffset = name === "chevron-up" ? iconSize * 0.05 : -iconSize * 0.05;
    const firstRotation = isBack ? "-45deg" : name === "chevron-up" ? "-45deg" : "45deg";
    const secondRotation = isBack ? "45deg" : name === "chevron-up" ? "45deg" : "-45deg";
    const firstTranslateX = isBack ? strokeLength * 0.08 : -strokeLength * 0.28;
    const secondTranslateX = isBack ? strokeLength * 0.08 : strokeLength * 0.28;
    const firstTranslateY = isBack ? -strokeLength * 0.24 : yOffset;
    const secondTranslateY = isBack ? strokeLength * 0.24 : yOffset;

    return (
      <View
        accessible={false}
        style={[
          styles.chevron,
          {
            width: iconSize,
            height: iconSize,
          },
          style,
        ]}
      >
        <View
          style={[
            styles.chevronStroke,
            {
              width: strokeLength,
              height: strokeWidth,
              borderRadius: strokeWidth / 2,
              backgroundColor: iconColor,
              transform: [
                { translateX: firstTranslateX },
                { translateY: firstTranslateY },
                { rotate: firstRotation },
              ],
            },
          ]}
        />
        <View
          style={[
            styles.chevronStroke,
            {
              width: strokeLength,
              height: strokeWidth,
              borderRadius: strokeWidth / 2,
              backgroundColor: iconColor,
              transform: [
                { translateX: secondTranslateX },
                { translateY: secondTranslateY },
                { rotate: secondRotation },
              ],
            },
          ]}
        />
      </View>
    );
  }

  return (
    <Text
      accessible={false}
      style={[
        styles.icon,
        {
          color: iconColor,
          fontSize: iconSize,
          lineHeight: iconSize,
        },
        style,
      ]}
    >
      {iconGlyphs[name] || name}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    backgroundColor: "transparent",
    textAlign: "center",
  },
  chevron: {
    alignItems: "center",
    backgroundColor: "transparent",
    justifyContent: "center",
  },
  chevronStroke: {
    position: "absolute",
  },
});
