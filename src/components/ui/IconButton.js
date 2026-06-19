import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { iconography } from "../../theme/iconography";
import { AppIcon } from "./AppIcon";

export function IconButton({
  name,
  role = "icon_action",
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
  iconStyle,
  color,
  size,
}) {
  const token = iconography[role] || iconography.icon_action;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        {
          width: token.touchTarget,
          height: token.touchTarget,
          borderRadius: token.touchTarget / 2,
        },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <AppIcon name={name} role={role} color={color} size={size} style={iconStyle} />
    </Pressable>
  );
}

export function MenuButton(props) {
  return <IconButton {...props} name="menu" role="icon_navigation" />;
}

export function BackButton(props) {
  return <IconButton {...props} name="back" role="icon_navigation" />;
}

export function CloseButton(props) {
  return <IconButton {...props} name="close" role="icon_action" />;
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.4,
  },
});
