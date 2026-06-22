import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import AntDesign from "@expo/vector-icons/AntDesign";
import Ionicons from "@expo/vector-icons/Ionicons";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { ScreenFooter } from "../../../components/ui/ScreenFooter";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import {
  deleteSessionById,
  getSessionById,
  getSessionSampleFinalStatus,
  listSessions,
} from "../../../data/sessionRepository";
import { logAppError } from "../../../services/errorLogger";
import {
  getSessionDateLabel,
  getSessionStatusBadgeLabel,
  getSessionTypeLabel,
} from "../constants/sessionDetails";
import { SessionStatusBadge } from "../../style-guide/components/SessionStatusBadge";

function CuppingSessionCard({ item, scale, onPress, onDelete }) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.sessionCard,
        { padding: 16 * scale },
        pressed && styles.sessionCardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open session ${item.title}`}
    >
      <View style={styles.cardTop}>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Pressable
          onPress={(event) => {
            event?.stopPropagation?.();
            onDelete(item);
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Delete session ${item.title}`}
        >
          <AntDesign name="close" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Text style={styles.sessionCategory}>{item.category}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.sessionDate}>{item.date}</Text>
        <SessionStatusBadge status={item.statusLabel} />
      </View>
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
  onNewSessionPress,
  onSessionPress,
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadSessions = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const rows = await listSessions();
        const sessionRows = await Promise.all(
          rows.map(async (row) => {
            const [loadedSession, sampleStatusById] = await Promise.all([
              getSessionById(row.id),
              getSessionSampleFinalStatus(row.id),
            ]);
            const samples = loadedSession?.samples || [];

            return {
              id: row.id,
              title: row.sessionName || row.sessionDisplayId || "Untitled Session",
              category: getSessionTypeLabel(row.sessionType) || "Other",
              status: row.status || "new",
              statusLabel: getSessionStatusBadgeLabel({
                samples,
                sampleStatusById,
                isSessionComplete: String(row.status || "").toLowerCase() === "complete",
              }),
              date: getSessionDateLabel(row.sessionDate) || row.sessionDate || "",
            };
          })
        );
        if (isCancelled) return;
        setSessions(sessionRows);
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

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sessions;
    }

    return sessions.filter((session) =>
      [
        session.title,
        session.category,
        session.statusLabel,
        session.date,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery))
    );
  }, [query, sessions]);

  const closeDeleteDialog = () => {
    setDeleteCandidate(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate?.id) {
      closeDeleteDialog();
      return;
    }

    const sessionToDelete = deleteCandidate;

    try {
      await deleteSessionById(sessionToDelete.id);
      setSessions((prev) => prev.filter((session) => session.id !== sessionToDelete.id));
      closeDeleteDialog();
    } catch (error) {
      void logAppError({
        screen: "CuppingSessionScreen",
        route: "Sessions",
        flow: "delete_session",
        friendlyMessage: error?.message || "Delete failed.",
        error,
        context: {
          sessionId: sessionToDelete.id,
          sessionTitle: sessionToDelete.title,
        },
      });
      closeDeleteDialog();
      setDeleteErrorMessage(error?.message || "Delete failed.");
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Sessions"
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back"
        debugTag="CuppingSessionScreen"
      />

      <View
        style={[
          styles.searchBar,
          {
            marginHorizontal: 16 * scale,
            marginVertical: 12 * scale,
          },
        ]}
      >
        <Ionicons name="search" size={20} color={colors.inkSoft} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search sessions"
          placeholderTextColor={colors.inkSoft}
          style={styles.searchInput}
          clearButtonMode="while-editing"
          accessibilityLabel="Search sessions"
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingHorizontal: 16 * scale,
            paddingTop: 16 * scale,
            paddingBottom: 48 * scale,
            gap: 12 * scale,
          },
        ]}
      >
        {filteredSessions.map((session) => (
          <CuppingSessionCard
            key={session.id}
            item={session}
            scale={scale}
            onPress={onSessionPress || (() => {})}
            onDelete={setDeleteCandidate}
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

        {!loadError && !isLoading && sessions.length > 0 && filteredSessions.length === 0 ? (
          <EmptyState title="No matches" body="No sessions match your search." />
        ) : null}
      </ScrollView>

      <ScreenFooter
        label="ADD SESSION"
        onPress={onNewSessionPress || (() => {})}
        accessibilityLabel="Add session"
      />

      <WarningDialog
        visible={Boolean(deleteCandidate)}
        title="Delete Session?"
        message={
          deleteCandidate
            ? `Delete "${deleteCandidate.title}"? This will permanently delete the session and all saved sample feedback stored on this device.`
            : ""
        }
        okLabel="Cancel"
        onDismiss={closeDeleteDialog}
        onOk={closeDeleteDialog}
        secondaryLabel="Delete"
        onSecondary={handleConfirmDelete}
      />

      <WarningDialog
        visible={Boolean(deleteErrorMessage)}
        title="Delete Failed"
        message={deleteErrorMessage}
        okLabel="OK"
        onDismiss={() => setDeleteErrorMessage("")}
        onOk={() => setDeleteErrorMessage("")}
      />
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
    flexGrow: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.input,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    ...typography.text_body,
    color: colors.ink,
    padding: 0,
    letterSpacing: 0,
  },

  // Session card
  sessionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    borderRadius: 12,
    gap: spacing.sm,
  },
  sessionCardPressed: {
    opacity: 0.7,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sessionTitle: {
    ...typography.text_section_title,
    letterSpacing: 0,
    flex: 1,
  },
  sessionCategory: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
    letterSpacing: 0,
  },
  sessionDate: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
    letterSpacing: 0,
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

});
