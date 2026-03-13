import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { floating_action_button as FloatingActionButton } from "../../../components/ui/floating_action_button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { listSessions } from "../../../data/sessionRepository";

const SESSION_FILTER_OPTIONS = [
  "All",
  "Sourcing Decision",
  "Quality Control",
  "Product Development",
  "Training Session",
  "Other",
];

function SessionFilterRow({ options, selectedOption, onSelect }) {
  return (
    <View style={styles.filterRowWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRowContent}
      >
        {options.map((option) => {
          const selected = selectedOption === option;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${option}`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CuppingSessionCard({ item, onPress }) {
  const isComplete = item.status === "COMPLETE";

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={styles.sessionCard}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.status}`}
    >
      <View style={styles.sessionContent}>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.sessionCategory}>{item.category}</Text>
          <Text style={[styles.sessionStatus, isComplete ? styles.statusComplete : styles.statusPending]}>
            {item.status}
          </Text>
        </View>
        <Text style={styles.sessionDate}>{item.date}</Text>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function Block({ title, text }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

export function CuppingSessionScreen({
  onBackPress,
  onSearchPress,
  onNewSessionPress,
  onSessionPress,
}) {
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadSessions = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        const rows = await listSessions();
        if (isCancelled) {
          return;
        }

        setSessions(
          rows.map((row) => ({
            id: row.id,
            title: row.sessionName || row.sessionDisplayId || "Untitled Session",
            category: row.sessionType || "Other",
            status: String(row.status || "pending").toUpperCase(),
            date: row.sessionDate || "",
          }))
        );
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error?.message || "Failed to load saved sessions.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSessions();

    return () => {
      isCancelled = true;
    };
  }, []);

  const visibleSessions =
    selectedFilter === "All"
      ? sessions
      : sessions.filter((item) => item.category === selectedFilter);

  const handleSessionPress = (item) => {
    if (onSessionPress) {
      onSessionPress(item);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Cupping Session"
        variant="back-search"
        onBackPress={onBackPress}
        onSearchPress={onSearchPress}
        backAccessibilityLabel="Back"
        searchAccessibilityLabel="Search"
      />
      <SessionFilterRow
        options={SESSION_FILTER_OPTIONS}
        selectedOption={selectedFilter}
        onSelect={setSelectedFilter}
      />
      <ScreenContainer>
        {visibleSessions.map((session) => (
          <CuppingSessionCard key={session.id} item={session} onPress={handleSessionPress} />
        ))}

        {loadError ? (
          <Block title="Load Error" text={loadError} />
        ) : null}

        {!loadError && isLoading ? (
          <Block title="Loading" text="Loading saved sessions..." />
        ) : null}

        {!loadError && !isLoading && visibleSessions.length === 0 ? (
          <Block title="No Sessions" text="No sessions found for the selected filter." />
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScreenContainer>

      <FloatingActionButton
        label="New Session"
        onPress={onNewSessionPress || (() => {})}
        accessibilityLabel="Create new session"
        leftIcon={<Text style={styles.fabPlus}>＋</Text>}
        style={styles.fabRight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterRowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
  },
  filterRowContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  filterChip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  filterChipSelected: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#667085",
  },
  filterChipTextSelected: {
    color: "#ffffff",
  },
  block: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  blockText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    minHeight: 88,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sessionContent: {
    flex: 1,
    gap: 4,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  sessionCategory: {
    fontSize: 13,
    color: "#98a2b3",
    fontWeight: "600",
  },
  sessionStatus: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  statusComplete: {
    color: "#1d2939",
  },
  statusPending: {
    color: "#344054",
  },
  sessionDate: {
    fontSize: 12,
    color: "#98a2b3",
    fontWeight: "600",
  },
  chevron: {
    fontSize: 28,
    color: "#cbd5e1",
    lineHeight: 28,
    paddingRight: 4,
  },
  fabPlus: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  fabRight: {
    alignSelf: "flex-end",
    marginRight: 16,
  },
  bottomSpacer: {
    height: 96,
  },
});
