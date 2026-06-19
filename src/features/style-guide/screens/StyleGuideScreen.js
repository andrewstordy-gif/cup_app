import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { IconButton } from "../../../components/ui/IconButton";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { iconography } from "../../../theme/iconography";
import { ScreenFooter, ScreenFooterDual } from "../../../components/ui/ScreenFooter";
import { SessionPrototypeScreen } from "./SessionPrototypeScreen";
import { SessionDraftScreen } from "./SessionDraftScreen";
import { SessionInProgressScreen } from "./SessionInProgressScreen";
import { SessionCompleteScreen } from "./SessionCompleteScreen";
import { SessionsListScreen } from "./SessionsListScreen";
import { SessionStatusBadge } from "../components/SessionStatusBadge";
import { ScoreRow } from "../components/ScoreRow";
import { makeScores, EMPTY_SCORES, computeScore } from "../components/SampleCard";

const TEXT_STYLES = [
  {
    key: "text_screen_title",
    example: "Active Session",
  },
  {
    key: "text_section_title",
    example: "Fragrance",
  },
  {
    key: "text_primary_metric",
    example: "76 °C",
  },
  {
    key: "text_secondary_metric",
    example: "Score 82.5",
  },
  {
    key: "text_body",
    example: "Press scan and hold your phone near the base of the cup.",
  },
  {
    key: "text_secondary_body",
    example: "Record any negative flavours that affect cup quality.",
  },
  {
    key: "text_field_auto",
    example: "SESSION-A1B2C3D4",
  },
];

const COLOUR_STYLES = [
  { key: "ink", label: "Primary text and save actions" },
  { key: "inkSoft", label: "Secondary text" },
  { key: "muted", label: "Disabled controls" },
  { key: "subtle", label: "Quiet indicators" },
  { key: "panel", label: "Grouped areas" },
  { key: "input", label: "Input backgrounds" },
  { key: "quietBorder", label: "Dividers and borders" },
  { key: "action", label: "Primary scan action" },
];

const ICON_STYLES = [
  {
    key: "icon_navigation",
    label: "Navigation",
    names: ["menu", "back", "chevron-up", "chevron-down"],
  },
  {
    key: "icon_action",
    label: "Actions",
    names: ["close", "edit", "add"],
  },
  {
    key: "icon_status",
    label: "Status",
    names: ["info", "defect-non-uniform", "defect-mouldy", "defect-phenolic", "defect-potato"],
  },
  {
    key: "icon_compact",
    label: "Compact controls",
    names: ["search", "chevron-right"],
  },
];

const SCORE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function TypographyExample({ token, example }) {
  return (
    <View style={styles.example}>
      <Text style={styles.tokenLabel}>{token}</Text>
      <Text style={typography[token]}>{example}</Text>
    </View>
  );
}

function ColourExample({ token, label }) {
  return (
    <View style={styles.colourRow}>
      <View style={[styles.swatch, { backgroundColor: colors[token] }]} />
      <View style={styles.colourText}>
        <Text style={styles.colourName}>{token}</Text>
        <Text style={styles.colourDescription}>{label}</Text>
      </View>
      <Text style={styles.colourHex}>{colors[token].toUpperCase()}</Text>
    </View>
  );
}

function IconographyExample({ token, label, names }) {
  return (
    <View style={styles.iconRow}>
      <View style={styles.iconDescription}>
        <Text style={styles.tokenLabel}>{token}</Text>
        <Text style={typography.text_secondary_body}>
          {label}: {iconography[token].size}px icon, {iconography[token].touchTarget}px touch target
        </Text>
      </View>
      <View style={styles.iconList}>
        {names.map((name) => (
          <IconButton
            key={`${token}-${name}`}
            name={name}
            role={token}
            accessibilityLabel={`${label} ${name} example`}
          />
        ))}
      </View>
    </View>
  );
}

function ScoreCircleExample({ value, selected = false, disabled = false, scale = 1 }) {
  return (
    <View
      style={[
        styles.scoreCircle,
        {
          width: 46 * scale,
          height: 46 * scale,
          borderRadius: 23 * scale,
          borderWidth: 2.3 * scale,
        },
        selected && styles.scoreCircleSelected,
        disabled && styles.scoreCircleDisabled,
      ]}
      accessibilityLabel={`Score ${value} ${selected ? "selected" : disabled ? "disabled" : "default"} example`}
    >
      <Text
        style={[
          styles.scoreCircleText,
          selected && styles.scoreCircleTextSelected,
          disabled && styles.scoreCircleTextDisabled,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function ScoreRowExample({ scale }) {
  return (
    <View style={styles.scoreRowExample}>
      <Text style={typography.text_section_title}>Fragrance</Text>
      <View style={styles.scoreCircleRow}>
        {SCORE_VALUES.map((value) => (
          <ScoreCircleExample
            key={`score-example-${value}`}
            value={value}
            selected={value === 4}
            disabled={value === 8 || value === 9}
            scale={scale}
          />
        ))}
      </View>
      <View style={styles.scoreStateLegend}>
        <View style={styles.scoreStateItem}>
          <ScoreCircleExample value={1} scale={scale} />
          <Text style={typography.text_secondary_body}>Default</Text>
        </View>
        <View style={styles.scoreStateItem}>
          <ScoreCircleExample value={4} selected scale={scale} />
          <Text style={typography.text_secondary_body}>Selected</Text>
        </View>
        <View style={styles.scoreStateItem}>
          <ScoreCircleExample value={9} disabled scale={scale} />
          <Text style={typography.text_secondary_body}>Disabled</Text>
        </View>
      </View>
    </View>
  );
}

function CupSelectorExample({ selected = false, disabled = false, scale = 1 }) {
  return (
    <View
      style={[
        styles.cupSelectorTouchTarget,
        {
          width: 46 * scale,
          height: 46 * scale,
        },
        disabled && styles.cupSelectorDisabledTouchTarget,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`Cup selector ${selected ? "selected" : disabled ? "disabled" : "default"} example`}
    >
      <View
        style={[
          styles.cupSelector,
          {
            width: 46 * scale,
            height: 46 * scale,
            borderRadius: 23 * scale,
            borderWidth: 2.3 * scale,
          },
          selected && styles.cupSelectorSelected,
          disabled && styles.cupSelectorDisabled,
        ]}
      >
        <View
          style={[
            styles.cupSelectorInnerRim,
            {
              width: 39 * scale,
              height: 39 * scale,
              borderRadius: 19.5 * scale,
              borderWidth: 1 * scale,
            },
            selected && styles.cupSelectorInnerRimSelected,
            disabled && styles.cupSelectorInnerRimDisabled,
          ]}
        />
      </View>
    </View>
  );
}

function CupSelectorRowExample({ scale }) {
  return (
    <View style={styles.cupSelectorExample}>
      <Text style={typography.text_section_title}>Non-uniform cups</Text>
      <Text style={typography.text_secondary_body}>
        Circular selectors represent physical cups viewed from above.
      </Text>
      <View style={styles.cupSelectorRow}>
        <CupSelectorExample scale={scale} />
        <CupSelectorExample selected scale={scale} />
        <CupSelectorExample scale={scale} />
        <CupSelectorExample disabled scale={scale} />
      </View>
      <View style={styles.scoreStateLegend}>
        <View style={styles.scoreStateItem}>
          <CupSelectorExample scale={scale} />
          <Text style={typography.text_secondary_body}>Default</Text>
        </View>
        <View style={styles.scoreStateItem}>
          <CupSelectorExample selected scale={scale} />
          <Text style={typography.text_secondary_body}>Selected</Text>
        </View>
        <View style={styles.scoreStateItem}>
          <CupSelectorExample disabled scale={scale} />
          <Text style={typography.text_secondary_body}>Disabled</Text>
        </View>
      </View>
    </View>
  );
}

function DefectSelectorExample({ selected = false, disabled = false, scale = 1 }) {
  return (
    <View
      style={[
        styles.cupSelectorTouchTarget,
        {
          width: 46 * scale,
          height: 46 * scale,
        },
        disabled && styles.cupSelectorDisabledTouchTarget,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`Defect selector ${selected ? "selected" : disabled ? "disabled" : "default"} example`}
    >
      <View
        style={[
          styles.defectSelector,
          {
            width: 46 * scale,
            height: 46 * scale,
            borderRadius: 23 * scale,
            borderWidth: 2.3 * scale,
          },
          selected && styles.defectSelectorSelected,
          disabled && styles.defectSelectorDisabled,
        ]}
      >
        {selected ? (
          <View
            style={[
              styles.defectSelectorCross,
              {
                width: 22 * scale,
                height: 22 * scale,
              },
            ]}
          >
            <View
              style={[
                styles.defectSelectorCrossStroke,
                {
                  width: 27 * scale,
                  height: 2.5 * scale,
                  borderRadius: 1.25 * scale,
                  transform: [{ rotate: "45deg" }],
                },
              ]}
            />
            <View
              style={[
                styles.defectSelectorCrossStroke,
                {
                  width: 27 * scale,
                  height: 2.5 * scale,
                  borderRadius: 1.25 * scale,
                  transform: [{ rotate: "-45deg" }],
                },
              ]}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DefectSelectorRowExample({ scale }) {
  return (
    <View style={styles.cupSelectorExample}>
      <Text style={typography.text_section_title}>Mouldy</Text>
      <Text style={typography.text_secondary_body}>
        Single defect selectors mark a negative occurrence with a grey cross.
      </Text>
      <View style={styles.cupSelectorRow}>
        <DefectSelectorExample scale={scale} />
        <DefectSelectorExample selected scale={scale} />
        <DefectSelectorExample disabled scale={scale} />
      </View>
      <View style={styles.scoreStateLegend}>
        <View style={styles.scoreStateItem}>
          <DefectSelectorExample scale={scale} />
          <Text style={typography.text_secondary_body}>Default</Text>
        </View>
        <View style={styles.scoreStateItem}>
          <DefectSelectorExample selected scale={scale} />
          <Text style={typography.text_secondary_body}>Selected</Text>
        </View>
        <View style={styles.scoreStateItem}>
          <DefectSelectorExample disabled scale={scale} />
          <Text style={typography.text_secondary_body}>Disabled</Text>
        </View>
      </View>
    </View>
  );
}

function FooterLinkRow({ label, description, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${label} example`}
      style={({ pressed }) => [styles.footerLinkRow, pressed && styles.footerLinkRowPressed]}
    >
      <View style={styles.footerLinkMeta}>
        <Text style={styles.spacingLabel}>{label}</Text>
        <Text style={typography.text_secondary_body}>{description}</Text>
      </View>
      <Text style={styles.footerLinkChevron}>›</Text>
    </Pressable>
  );
}

function FooterSingleDemo({ onBack }) {
  return (
    <View style={styles.screen}>
      <Header title="Single Action Footer" variant="back" onBackPress={onBack} backAccessibilityLabel="Back to Style Guide" />
      <ScrollView contentContainerStyle={styles.demoBody}>
        <Text style={typography.text_body}>
          Use a single footer when there is one clear action at this stage of the flow.
        </Text>
      </ScrollView>
      <ScreenFooter label="CONFIRM" onPress={() => {}} />
    </View>
  );
}

function FooterDualDemo({ onBack }) {
  return (
    <View style={styles.screen}>
      <Header title="Dual Action Footer" variant="back" onBackPress={onBack} backAccessibilityLabel="Back to Style Guide" />
      <ScrollView contentContainerStyle={styles.demoBody}>
        <Text style={typography.text_body}>
          Use a dual footer when a secondary action is available but should not compete with the primary.
          The secondary button uses an outline style.
        </Text>
      </ScrollView>
      <ScreenFooterDual
        primaryLabel="CONFIRM"
        onPrimaryPress={() => {}}
        secondaryLabel="CANCEL"
        onSecondaryPress={() => {}}
      />
    </View>
  );
}

export function StyleGuideScreen({ onBackPress }) {
  const { width } = useWindowDimensions();
  const scoreScale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [subScreen, setSubScreen] = useState(null);

  if (subScreen === "footer-single") {
    return <FooterSingleDemo onBack={() => setSubScreen(null)} />;
  }
  if (subScreen === "footer-dual") {
    return <FooterDualDemo onBack={() => setSubScreen(null)} />;
  }
  if (subScreen === "session-prototype") {
    return <SessionPrototypeScreen onBackPress={() => setSubScreen(null)} />;
  }

  if (subScreen === "session-draft") {
    return <SessionDraftScreen onBackPress={() => setSubScreen(null)} />;
  }

  if (subScreen === "session-in-progress") {
    return <SessionInProgressScreen onBackPress={() => setSubScreen(null)} />;
  }
  if (subScreen === "session-complete") {
    return <SessionCompleteScreen onBackPress={() => setSubScreen(null)} />;
  }
  if (subScreen === "sessions-list") {
    return (
      <SessionsListScreen
        onBackPress={() => setSubScreen(null)}
        onAddSession={() => setSubScreen("session-prototype")}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="Style Guide" variant="back" onBackPress={onBackPress} backAccessibilityLabel="Return home" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={typography.text_body}>A quiet interface for focused coffee cupping.</Text>
        <Text style={typography.text_secondary_body}>
          Use these shared roles when building or refining screens.
        </Text>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Prototypes</Text>
          <Text style={typography.text_secondary_body}>
            Work-in-progress screens for design review.
          </Text>
          <View style={styles.footerLinkList}>
            <FooterLinkRow
              label="Session — New"
              description="Session screen in New/Draft state."
              onPress={() => setSubScreen("session-prototype")}
            />
            <FooterLinkRow
              label="Session — Pending"
              description="Session screen in Pending state."
              onPress={() => setSubScreen("session-draft")}
            />
            <FooterLinkRow
              label="Session — In Progress"
              description="Session screen with cupping underway."
              onPress={() => setSubScreen("session-in-progress")}
            />
            <FooterLinkRow
              label="Session — Complete"
              description="Session screen with all samples scored."
              onPress={() => setSubScreen("session-complete")}
            />
            <FooterLinkRow
              label="Sessions List"
              description="List of cupping sessions as cards."
              onPress={() => setSubScreen("sessions-list")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Components</Text>
          <Text style={typography.text_secondary_body}>Reusable UI elements used across screens.</Text>
          <View style={[styles.exampleList, { marginTop: 16 }]}>
            <Text style={[styles.tokenLabel, { marginBottom: 8 }]}>Session Status Badge</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["Draft", "Pending", "In Progress", "Complete"].map(status => (
                <SessionStatusBadge key={status} status={status} />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Typography</Text>
          <View style={styles.exampleList}>
            {TEXT_STYLES.map((item) => (
              <TypographyExample key={item.key} token={item.key} example={item.example} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Colour</Text>
          <View style={styles.colourList}>
            {COLOUR_STYLES.map((item) => (
              <ColourExample key={item.key} token={item.key} label={item.label} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Iconography</Text>
          <Text style={typography.text_secondary_body}>
            Use shared icon roles and icon buttons instead of raw text symbols.
          </Text>
          <View style={styles.iconographyList}>
            {ICON_STYLES.map((item) => (
              <IconographyExample
                key={item.key}
                token={item.key}
                label={item.label}
                names={item.names}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Spacing & Layout</Text>
          <Text style={typography.text_secondary_body}>
            All layout values (padding, margin, gap, dimensions) are multiplied by the screen scale factor. Font sizes are never scaled.
          </Text>
          <View style={styles.spacingList}>
            {[
              { label: "Screen edge padding", value: 26, description: "Horizontal padding on all main screen content" },
              { label: "xs", value: spacing.xs, description: "Tight gaps between related items" },
              { label: "sm", value: spacing.sm, description: "Gap between list rows and small components" },
              { label: "md", value: spacing.md, description: "Section internal padding" },
              { label: "lg", value: spacing.lg, description: "Between major sections" },
            ].map((item) => (
              <View key={item.label} style={styles.spacingRow}>
                <View style={styles.spacingMeta}>
                  <Text style={styles.spacingLabel}>{item.label}</Text>
                  <Text style={typography.text_secondary_body}>{item.description}</Text>
                  <View style={styles.spacingVisual}>
                    <View style={styles.spacingBar} />
                    <View style={{ height: item.value, backgroundColor: colors.action, opacity: 0.25 }} />
                    <View style={styles.spacingBar} />
                  </View>
                </View>
                <Text style={styles.spacingValue}>{item.value}px</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Primary Actions</Text>
          <Text style={typography.text_secondary_body}>
            Use blue for a neutral forward action and charcoal when the user needs to save edits.
          </Text>
          <View style={styles.actionList}>
            <FullPageButton label="Scan Cup" style={styles.scanButton} />
            <FullPageButton label="Save" style={styles.saveButton} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Secondary Actions</Text>
          <Text style={typography.text_secondary_body}>
            Use a quiet bordered button for an extra action that should not compete with the primary bottom action.
          </Text>
          <View style={styles.actionList}>
            <FullPageButton
              label="Add Aroma"
              style={styles.secondaryActionButton}
              textStyle={styles.secondaryActionButtonText}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Score Rows</Text>
          <Text style={typography.text_secondary_body}>
            Use large circular controls for cupping scores. Selected scores use charcoal fill with white text.
          </Text>
          <ScoreRowExample scale={scoreScale} />
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Score Summary Row</Text>
          <Text style={typography.text_secondary_body}>
            Used on sample cards to show scored attributes at a glance. Empty boxes show a dash; filled boxes use charcoal with white text.
          </Text>
          <View style={{ gap: spacing.md, paddingTop: spacing.xs }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.tokenLabel}>No scores</Text>
              <ScoreRow scores={EMPTY_SCORES} totalScore={null} scale={scoreScale} />
            </View>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.tokenLabel}>Partial scores</Text>
              <ScoreRow scores={makeScores([8, 7, 9, 8, null, null, null, null])} totalScore={null} scale={scoreScale} />
            </View>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.tokenLabel}>All scores</Text>
              {(() => { const s = makeScores([8, 8, 9, 8, 8, 7, 8, 8]); return <ScoreRow scores={s} totalScore={computeScore(s)} scale={scoreScale} />; })()}
            </View>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.tokenLabel}>Score 100</Text>
              {(() => { const s = makeScores([9, 9, 9, 9, 9, 9, 9, 9]); return <ScoreRow scores={s} totalScore={computeScore(s)} scale={scoreScale} />; })()}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Cup Selectors</Text>
          <Text style={typography.text_secondary_body}>
            Use circular cup selectors for physical cup inputs in the defects drawer.
          </Text>
          <CupSelectorRowExample scale={scoreScale} />
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Defect Selectors</Text>
          <Text style={typography.text_secondary_body}>
            Use a matching circular selector for single defect types such as Mouldy.
          </Text>
          <DefectSelectorRowExample scale={scoreScale} />
        </View>

        <View style={styles.section}>
          <Text style={typography.text_section_title}>Screen Footers</Text>
          <Text style={typography.text_secondary_body}>
            The footer is the fixed area at the bottom of the screen that holds the primary call to action. It does not scroll with the content.
          </Text>
          <View style={styles.footerLinkList}>
            <FooterLinkRow
              label="Single action"
              description="One primary button — use when there is one clear next step."
              onPress={() => setSubScreen("footer-single")}
            />
            <FooterLinkRow
              label="Dual action"
              description="Primary + secondary button — use when a second option is available but should not compete."
              onPress={() => setSubScreen("footer-dual")}
            />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  section: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  exampleList: {
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  example: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
  },
  tokenLabel: {
    ...typography.text_caption,
    color: colors.inkSoft,
  },
  spacingList: {
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  spacingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
    gap: spacing.sm,
  },
  spacingMeta: {
    flex: 1,
    gap: 2,
  },
  spacingLabel: {
    ...typography.text_body,
    color: colors.ink,
  },
  spacingValue: {
    ...typography.text_body,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  spacingVisual: {
    marginTop: 8,
    width: 120,
  },
  spacingBar: {
    height: 2,
    backgroundColor: colors.quietBorder,
  },
  footerLinkList: {
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  footerLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
    gap: spacing.sm,
  },
  footerLinkRowPressed: {
    opacity: 0.6,
  },
  footerLinkMeta: {
    flex: 1,
    gap: 2,
  },
  footerLinkChevron: {
    ...typography.text_body,
    color: colors.inkSoft,
    fontSize: 20,
  },
  demoBody: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  colourList: {
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  colourRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.quietBorder,
  },
  colourText: {
    flex: 1,
  },
  colourName: {
    ...typography.text_body,
    fontSize: 16,
  },
  colourDescription: {
    ...typography.text_secondary_body,
    fontSize: 14,
  },
  colourHex: {
    ...typography.text_caption,
    color: colors.inkSoft,
  },
  iconographyList: {
    borderTopWidth: 1,
    borderColor: colors.quietBorder,
  },
  iconRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderColor: colors.quietBorder,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  iconDescription: {
    gap: 2,
  },
  iconList: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionList: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  scanButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.action,
  },
  saveButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
  },
  secondaryActionButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
  },
  secondaryActionButtonText: {
    color: colors.ink,
  },
  scoreRowExample: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  scoreCircleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scoreCircle: {
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircleSelected: {
    backgroundColor: colors.ink,
  },
  scoreCircleDisabled: {
    borderColor: colors.muted,
  },
  scoreCircleText: {
    ...typography.text_body,
    lineHeight: 23,
    fontWeight: "600",
    color: colors.ink,
  },
  scoreCircleTextSelected: {
    color: colors.surface,
  },
  scoreCircleTextDisabled: {
    color: colors.muted,
  },
  scoreStateLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  scoreStateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  cupSelectorExample: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  cupSelectorRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  cupSelectorTouchTarget: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  cupSelectorDisabledTouchTarget: {
    opacity: 0.8,
  },
  cupSelector: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2.3,
    borderColor: colors.inkSoft,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cupSelectorSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  cupSelectorDisabled: {
    borderColor: colors.muted,
    backgroundColor: colors.panel,
  },
  cupSelectorInnerRim: {
    width: 39,
    height: 39,
    borderRadius: 19.5,
    borderWidth: 1,
    borderColor: colors.quietBorder,
  },
  cupSelectorInnerRimSelected: {
    borderColor: colors.surface,
  },
  cupSelectorInnerRimDisabled: {
    borderColor: colors.muted,
  },
  defectSelector: {
    borderColor: colors.inkSoft,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  defectSelectorSelected: {
    borderColor: colors.inkSoft,
    backgroundColor: colors.inkSoft,
  },
  defectSelectorDisabled: {
    borderColor: colors.muted,
    backgroundColor: colors.panel,
  },
  defectSelectorCross: {
    alignItems: "center",
    justifyContent: "center",
  },
  defectSelectorCrossStroke: {
    position: "absolute",
    backgroundColor: colors.surface,
  },
});
