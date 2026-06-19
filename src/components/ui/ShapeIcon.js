import React from "react";
import { View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { iconography } from "../../theme/iconography";

const SHAPE_MAP = {
  "circle":         { icon: "circle" },
  "circle-outline": { icon: "circle-o" },
  "circle-thin":    { icon: "play" },
  "circle-target":  { icon: "dot-circle-o" },
  "circle-plus":    { icon: "plus-circle" },
  "circle-minus":   { icon: "minus-circle" },
  "circle-times":   { icon: "times-circle" },
  "circle-check":   { icon: "check-circle" },
  "square":         { icon: "square" },
  "square-outline": { icon: "flag" },
  "square-plus":    { icon: "plus-square" },
  "square-minus":   { icon: "minus-square" },
  "square-check":   { icon: "check-square" },
  "star":           { icon: "star" },
  "star-outline":   { icon: "bolt" },
  "star-half":      { icon: "bookmark" },
  "certificate":    { icon: "certificate" },
  "heart":          { icon: "heart" },
  "heart-outline":  { icon: "shield" },
  "diamond":        { icon: "leaf" },
};

export function ShapeIcon({ shape = "circle", size, color, style }) {
  const token = iconography.icon_shape || iconography.icon_action;
  const iconSize = size || token.size;
  const iconColor = color || token.color;

  const def = SHAPE_MAP[shape] || SHAPE_MAP.circle;

  return (
    <View
      accessible={false}
      style={[
        { width: iconSize, height: iconSize, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <FontAwesome name={def.icon} size={iconSize} color={iconColor} />
    </View>
  );
}
