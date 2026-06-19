import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { full_page_button as FullPageButton } from "../../../components/ui/full_page_button";
import { AppIcon } from "../../../components/ui/AppIcon";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { listSessions } from "../../../data/sessionRepository";


function SessionStatusBadge({ status }) {
  const s = String(status || "").toUpperCase();
  const isComplete = s === "COMPLETE";
  const isPending = s === "PENDING";
  const label = isComplete ? "Complete" : isPending ? "Pending" : "New";
  return (
    <Text style={isComplete ? styles.statusComplete : styles.statusPending}>
      {label}
    </Text>
  );
}

function CuppingSessionCard({ item, onPress }) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.sessionCard, pressed && styles.sessionCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.status}`}
    >
      <View style={styles.sessionContent}>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.sessionCategory}>{item.category}</Text>
        <SessionStatusBadge status={item.status} />
        {item.date ? (
          <Text style={styles.sessionDate}>{item.date}</Text>
        ) : null}
      </View>
      <AppIcon name="chevron-right" role="icon_navigation" style={styles.chevron} />
    </Pressable>
  );
}

function EmptyState({ title, body }) {
  return (
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function CuppingSessionScreen({
  onBackPress,
  onSearchPress,
  onNewSessionPress,
  onSessionPress,
}) {
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
        if (isCancelled) return;
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
    return () => { isCancelled = true; };
  }, []);

  return (
    <View style={styles.screen}>
      <Header
        title="Cupping Sessions"
        variant="back-search"
        onBackPress={onBackPress}
        onSearchPress={onSearchPress}
        backAccessibilityLabel="Back"
        searchAccessibilityLabel="Search"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {sessions.map((session) => (
          <CuppingSessionCard
            key={session.id}
            item={session}
            onPress={onSessionPress || (() => {})}
          />
        ))}

        {loadError ? (
          <EmptyState title="Load error" body={loadError} />
        ) : null}

        {!loadError && isLoading ? (
          <EmptyState title="Loading" body="Loading saved sessions…" />
        ) : null}

        {!loadError && !isLoading && sessions.length === 0 ? (
          <EmptyState title="No sessions" body="No sessions found for the selected filter." />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <FullPageButton
          label="NEW SESSION"
          onPress={onNewSessionPress || (() => {})}
          accessibilityLabel="Create new session"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Session list
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 104,
    gap: spacing.sm,
  },

  // Session card
  sessionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sessionCardPressed: {
    opacity: 0.8,
  },
  sessionContent: {
    flex: 1,
    gap: spacing.xs,
  },
  sessionTitle: {
    ...typography.text_body,
  },
  sessionCategory: {
    ...typography.text_secondary_body,
  },
  sessionDate: {
    ...typography.text_secondary_body,
    color: colors.muted,
  },
  chevron: {
    color: colors.subtle,
  },

  // Status text
  statusComplete: {
    ...typography.text_secondary_body,
    color: colors.ink,
  },
  statusPending: {
    ...typography.text_secondary_body,
    color: colors.muted,
  },

  // Empty / error state
  emptyBlock: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.text_body,
  },
  emptyBody: {
    ...typography.text_secondary_body,
    textAlign: "center",
  },

  // Footer
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
