import { colors } from "./colors";

const classifiedText = {
  backgroundColor: "transparent",
};

export const typography = {
  text_screen_title: {
    ...classifiedText,
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  text_section_title: {
    ...classifiedText,
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
  },
  text_primary_metric: {
    ...classifiedText,
    fontSize: 44,
    fontWeight: "800",
    color: colors.ink,
  },
  text_secondary_metric: {
    ...classifiedText,
    fontSize: 30,
    fontWeight: "700",
    color: colors.ink,
  },
  text_body: {
    ...classifiedText,
    fontSize: 18,
    fontWeight: "600",
    color: colors.ink,
  },
  text_secondary_body: {
    ...classifiedText,
    fontSize: 15,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  text_instruction_emphasis: {
    ...classifiedText,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: colors.text,
  },
  text_instruction_body: {
    ...classifiedText,
    fontSize: 18,
    fontWeight: "500",
    color: colors.text,
  },
  text_button_primary: {
    ...classifiedText,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#ffffff",
  },
  text_field_auto: {
    ...classifiedText,
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
  text_caption: {
    ...classifiedText,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.textMuted,
  },
};
