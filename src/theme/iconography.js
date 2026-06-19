import { colors } from "./colors";

export const iconography = {
  icon_navigation: {
    size: 24,
    color: colors.inkSoft,
    touchTarget: 44,
  },
  icon_action: {
    size: 20,
    color: colors.inkSoft,
    touchTarget: 44,
  },
  icon_status: {
    size: 22,
    color: colors.ink,
    touchTarget: 44,
  },
  icon_compact: {
    size: 18,
    color: colors.inkSoft,
    touchTarget: 32,
  },
  icon_shape: {
    size: 24,
    color: colors.ink,
    touchTarget: 44,
  },
};

export const SAMPLE_SHAPES = [
  { key: "circle",         label: "Circle" },
  { key: "circle-outline", label: "Circle Out." },
  { key: "circle-thin",    label: "Play" },
  { key: "circle-target",  label: "Target" },
  { key: "circle-plus",    label: "Circle Plus" },
  { key: "circle-minus",   label: "Circle Minus" },
  { key: "circle-times",   label: "Circle ×" },
  { key: "circle-check",   label: "Circle Check" },
  { key: "square",         label: "Square" },
  { key: "square-outline", label: "Flag" },
  { key: "square-plus",    label: "Square Plus" },
  { key: "square-minus",   label: "Square Minus" },
  { key: "square-check",   label: "Square Check" },
  { key: "star",           label: "Star" },
  { key: "star-outline",   label: "Bolt" },
  { key: "star-half",      label: "Bookmark" },
  { key: "certificate",    label: "Certificate" },
  { key: "heart",          label: "Heart" },
  { key: "heart-outline",  label: "Shield" },
  { key: "diamond",        label: "Leaf" },
];

export const iconGlyphs = {
  menu: "☰",
  back: "←",
  close: "✕",
  search: "⌕",
  edit: "✎",
  add: "＋",
  info: "i",
  "chevron-right": "›",
  "chevron-up": "⌃",
  "chevron-down": "⌄",
  "defect-non-uniform": "≠",
  "defect-mouldy": "M",
  "defect-phenolic": "Ph",
  "defect-potato": "Po",
  "defect-other-bean": "Ot",
  "defect-underdeveloped": "Ud",
  "defect-baked": "Bk",
  "defect-uneven-roast": "Ur",
  "defect-overdeveloped": "Od",
};
