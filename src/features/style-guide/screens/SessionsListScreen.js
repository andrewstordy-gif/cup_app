import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import AntDesign from "@expo/vector-icons/AntDesign";
import Ionicons from "@expo/vector-icons/Ionicons";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { ScreenFooter } from "../../../components/ui/ScreenFooter";
import { SessionStatusBadge } from "../components/SessionStatusBadge";
import { colors } from "../../../theme/colors";
import { typography } from "../../../theme/typography";
import { getSessionTypeLabel } from "../../cupping/constants/sessionDetails";

const SESSIONS = [
  {
    id: "1",
    name: "Cup of Excellence 2026",
    type: 5,
    status: "Complete",
    date: "17 Jun 2026",
  },
  {
    id: "2",
    name: "Q2 Quality Control",
    type: 2,
    status: "In Progress",
    date: "16 Jun 2026",
  },
  {
    id: "3",
    name: "New Origin Tasting",
    type: 1,
    status: "Pending",
    date: "15 Jun 2026",
  },
  {
    id: "4",
    name: "Team Training — Sensory",
    type: 4,
    status: "Draft",
    date: "14 Jun 2026",
  },
  {
    id: "5",
    name: "Blend Development",
    type: 3,
    status: "Complete",
    date: "10 Jun 2026",
  },
  {
    id: "6",
    name: "Supplier A — Screening",
    type: 1,
    status: "Complete",
    date: "4 Jun 2026",
  },
];

function SessionCard({ session, scale, onPress, onDelete }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open session ${session.name}`}
      style={({ pressed }) => [styles.card, { padding: 16 * scale }, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{session.name}</Text>
        <Pressable
          onPress={onDelete}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Delete session ${session.name}`}
        >
          <AntDesign name="close" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Text style={styles.cardType}>{getSessionTypeLabel(session.type)}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>{session.date}</Text>
        <SessionStatusBadge status={session.status} />
      </View>
    </Pressable>
  );
}

export function SessionsListScreen({ onBackPress, onAddSession }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const [sessions, setSessions] = useState(SESSIONS);
  const [query, setQuery] = useState("");

  const deleteSession = (id) => setSessions(prev => prev.filter(s => s.id !== id));

  const filtered = query.trim()
    ? sessions.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        getSessionTypeLabel(s.type).toLowerCase().includes(query.toLowerCase())
      )
    : sessions;

  return (
    <View style={styles.screen}>
      <Header
        title="Sessions"
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back to Style Guide"
        debugTag="SessionsListScreen"
      />
      <View style={[styles.searchBar, { marginHorizontal: 16 * scale, marginVertical: 12 * scale }]}>
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
          styles.body,
          {
            paddingHorizontal: 16 * scale,
            paddingTop: 16 * scale,
            paddingBottom: 48 * scale,
            gap: 12 * scale,
          },
        ]}
      >
        {filtered.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            scale={scale}
            onPress={() => {}}
            onDelete={() => deleteSession(session.id)}
          />
        ))}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No sessions yet.</Text>
          </View>
        )}
      </ScrollView>
      <ScreenFooter
        label="ADD SESSION"
        onPress={onAddSession}
        accessibilityLabel="Add session"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.quietBorder,
    gap: 6,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDate: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
    letterSpacing: 0,
  },
  cardName: {
    ...typography.text_section_title,
    letterSpacing: 0,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  cardType: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
    letterSpacing: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyText: {
    ...typography.text_body,
    color: colors.inkSoft,
  },
});
