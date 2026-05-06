import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";

const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const sections = ["Fragrance", "Aroma", "Flavour", "Aftertaste", "Sweetness", "Mouthfeel", "Overall"];
const designBPages = [
  { id: "fragrance-aroma", rows: ["Fragrance", "Aroma"] },
  { id: "flavour-aftertaste", rows: ["Flavour", "Aftertaste"] },
  { id: "acidity", rows: ["Acidity"] },
  { id: "sweetness", rows: ["Sweetness"] },
  { id: "mouthfeel", rows: ["Mouthfeel"] },
  { id: "overall", rows: ["Overall"] },
];
const designCPage = {
  id: "design-c-main",
  rows: ["Fragrance", "Aroma", "Flavour", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel", "Overall"],
};
const sessionScoreLabels = ["Fr", "Ar", "Fl", "Af", "Ac", "Sw", "Mf", "Ov"];
const designCIndividualNoteRows = ["Acidity", "Sweetness", "Mouthfeel", "Overall"];
const emptyCupFlags = [false, false, false, false, false];
const defaultDesignBDefects = {
  nonUniform: emptyCupFlags,
  defective: emptyCupFlags,
  defects: {
    moldy: emptyCupFlags,
    phenolic: emptyCupFlags,
    potato: emptyCupFlags,
  },
};
const currentTemp = "56 °C";
const currentBrewTime = "03:45";
const balloonConfigs = [
  { color: "#E15A64", left: 0.14, size: 34, drift: 20 },
  { color: "#F2B84B", left: 0.32, size: 28, drift: -16 },
  { color: "#61A6D8", left: 0.5, size: 38, drift: 12 },
  { color: "#75B66A", left: 0.68, size: 30, drift: -22 },
  { color: "#C586D9", left: 0.84, size: 35, drift: 15 },
];
const sessionCups = [
  { name: "Red", color: "#E15A64" },
  { name: "Yellow", color: "#F2B84B" },
  { name: "Blue", color: "#61A6D8" },
  { name: "Green", color: "#75B66A" },
  { name: "Black", color: "#111820" },
];
const sessionCupRows = [
  {
    scores: [7, 7, 8, 7, 6, 7, 7, 8],
    finalScoreIndices: [2, 7],
    defects: [],
    finalScore: "7.1",
    cupUuid: "CUP-RED-01A7",
    coffeeNameOrigin: "Las Flores, Colombia",
    process: "Washed",
    flavours: ["apple"],
  },
  {
    scores: [6, 7, null, 6, 6, 7, 6, null],
    finalScoreIndices: [1, 5],
    defects: ["≠"],
    finalScore: "6.5",
    cupUuid: "CUP-YEL-02B4",
    coffeeNameOrigin: "Kibingo, Burundi",
    process: "Honey",
    flavours: ["apple"],
  },
  {
    scores: [8, 8, 8, 7, 7, 8, 8, 8],
    finalScoreIndices: [0, 1, 2, 5, 6, 7],
    defects: [],
    finalScore: "7.8",
    cupUuid: "CUP-BLU-03C9",
    coffeeNameOrigin: "Chelbesa, Ethiopia",
    process: "Natural",
    flavours: ["apple"],
  },
  {
    scores: [6, 6, 7, null, 5, 6, null, 6],
    finalScoreIndices: [2, 4],
    defects: ["≠", "M", "Ph", "Po"],
    finalScore: "6.0",
    cupUuid: "CUP-GRN-04D2",
    coffeeNameOrigin: "Finca El Alto, Guatemala",
    process: "Washed",
    flavours: ["apple"],
  },
  {
    scores: [7, 7, 7, 7, 7, 7, 7, 7],
    finalScoreIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    defects: ["Ph"],
    finalScore: "7.0",
    cupUuid: "CUP-BLK-05E8",
    coffeeNameOrigin: "Nyeri AA, Kenya",
    process: "Anaerobic",
    flavours: ["apple"],
  },
];

export default function App() {
  const [activeDesign, setActiveDesign] = useState("home");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [selectedScores, setSelectedScores] = useState({});
  const [notesBySection, setNotesBySection] = useState({});
  const [savedEntriesBySection, setSavedEntriesBySection] = useState({});
  const [designBPageIndex, setDesignBPageIndex] = useState(0);
  const [designBSelections, setDesignBSelections] = useState({});
  const [designBFinals, setDesignBFinals] = useState({});
  const [designBNotesByPage, setDesignBNotesByPage] = useState({});
  const [designBEntriesByPage, setDesignBEntriesByPage] = useState({});
  const [designBLastSavedByPage, setDesignBLastSavedByPage] = useState({});
  const [designBDefectsByPage, setDesignBDefectsByPage] = useState({});
  const [designCFragranceAromaNotes, setDesignCFragranceAromaNotes] = useState("");
  const [designCFlavourAftertasteNotes, setDesignCFlavourAftertasteNotes] = useState("");
  const [designCIndividualNotes, setDesignCIndividualNotes] = useState({});
  const [isDesignBDrawerOpen, setIsDesignBDrawerOpen] = useState(false);
  const [isDesignCNotesFocused, setIsDesignCNotesFocused] = useState(false);
  const [focusedDesignCNote, setFocusedDesignCNote] = useState(null);
  const [currentCupIndex, setCurrentCupIndex] = useState(0);
  const [expandedSessionCup, setExpandedSessionCup] = useState(null);
  const designCNotesInputRef = useRef(null);
  const designCScrollRef = useRef(null);
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 616, 0.58), 1.05);
  const isDesignC = activeDesign === "design";
  const currentCup = sessionCups[currentCupIndex] || sessionCups[0];
  const currentCupLabel = `${currentCupIndex + 1}/${sessionCups.length}`;
  const isHomeABrewing = activeDesign === "home-brewing";
  const isHomeAScanned = isHomeABrewing;
  const homeAPageTitle = isHomeABrewing ? "Brewing" : "Home";
  const homeATemperature = "76 °C";
  const isSessionComplete = sessionCupRows.every(
    (row) =>
      row.scores.every((score) => score !== null && score !== undefined) &&
      row.finalScoreIndices.length === row.scores.length,
  );
  const sessionStatus = isSessionComplete ? "Complete" : "Pending";
  const currentSection = sections[sectionIndex];
  const currentDesignBPage = isDesignC ? designCPage : designBPages[designBPageIndex];
  const selectedScore = selectedScores[currentSection] || null;
  const notes = notesBySection[currentSection] || "";
  const savedEntries = savedEntriesBySection[currentSection] || [];
  const designBNotes = designBNotesByPage[currentDesignBPage.id] || "";
  const designBEntries = designBEntriesByPage[currentDesignBPage.id] || [];
  const currentDesignBDefects = designBDefectsByPage[currentDesignBPage.id] || defaultDesignBDefects;
  const designCDefectBadges = [
    {
      id: "non-uniform",
      icon: "≠",
      label: "Non-uniform",
      isVisible: currentDesignBDefects.nonUniform.some(Boolean),
    },
    {
      id: "moldy",
      icon: "M",
      label: "Mouldy",
      isVisible: Array.isArray(currentDesignBDefects.defects.moldy)
        ? currentDesignBDefects.defects.moldy.some(Boolean)
        : Boolean(currentDesignBDefects.defects.moldy),
    },
    {
      id: "phenolic",
      icon: "Ph",
      label: "Phenolic",
      isVisible: Array.isArray(currentDesignBDefects.defects.phenolic)
        ? currentDesignBDefects.defects.phenolic.some(Boolean)
        : Boolean(currentDesignBDefects.defects.phenolic),
    },
    {
      id: "potato",
      icon: "Po",
      label: "Potato",
      isVisible: Array.isArray(currentDesignBDefects.defects.potato)
        ? currentDesignBDefects.defects.potato.some(Boolean)
        : Boolean(currentDesignBDefects.defects.potato),
    },
  ].filter((badge) => badge.isVisible);
  const isAnyDesignCNoteFocused = isDesignCNotesFocused || Boolean(focusedDesignCNote);
  const designCKeyboardShift = isDesignC && isDesignCNotesFocused ? -230 * scale : 0;
  const emptyDesignBPageState = {
    notes: "",
    fragranceAromaNotes: isDesignC ? "" : undefined,
    flavourAftertasteNotes: isDesignC ? "" : undefined,
    individualNotes: isDesignC
      ? designCIndividualNoteRows.reduce((noteState, row) => ({ ...noteState, [row]: "" }), {})
      : undefined,
    defects: defaultDesignBDefects,
    rows: currentDesignBPage.rows.map((row) => ({
      row,
      score: null,
      final: false,
    })),
  };
  const currentDesignBPageState = {
    notes: designBNotes.trim(),
    fragranceAromaNotes: isDesignC ? designCFragranceAromaNotes.trim() : undefined,
    flavourAftertasteNotes: isDesignC ? designCFlavourAftertasteNotes.trim() : undefined,
    individualNotes: isDesignC
      ? designCIndividualNoteRows.reduce(
          (noteState, row) => ({ ...noteState, [row]: (designCIndividualNotes[row] || "").trim() }),
          {},
        )
      : undefined,
    defects: currentDesignBDefects,
    rows: currentDesignBPage.rows.map((row) => ({
      row,
      score: designBSelections[row] || null,
      final: Boolean(designBFinals[row]),
    })),
  };
  const isDesignBDirty =
    JSON.stringify(currentDesignBPageState) !==
    JSON.stringify(designBLastSavedByPage[currentDesignBPage.id] || emptyDesignBPageState);
  const isDesignBSaveAction = isDesignBDirty || isDesignBDrawerOpen;
  const dismissKeyboardAndResetFocus = () => {
    Keyboard.dismiss();
    setIsDesignCNotesFocused(false);
    setFocusedDesignCNote(null);
  };
  const focusDesignCNotes = () => {
    setIsDesignCNotesFocused(true);
    requestAnimationFrame(() => {
      designCNotesInputRef.current?.focus();
    });
  };
  const setCurrentDesignBNotes = (text) => {
    setDesignBNotesByPage((currentNotes) => ({
      ...currentNotes,
      [currentDesignBPage.id]: text,
    }));
  };
  const setDesignCIndividualNote = (label, text) => {
    setDesignCIndividualNotes((currentNotes) => ({
      ...currentNotes,
      [label]: text,
    }));
  };
  const focusDesignCInlineNote = (noteId, scrollY) => {
    setFocusedDesignCNote(noteId);
    requestAnimationFrame(() => {
      designCScrollRef.current?.scrollTo({
        y: scrollY,
        animated: true,
      });
    });
  };
  const renderDesignCInlineNote = (noteId, value, onChangeText, scrollY) => {
    const isFocused = focusedDesignCNote === noteId;
    const noteStyle = [
      styles.pairedNotesInput,
      {
        minHeight: 74 * scale,
        borderRadius: 13 * scale,
        paddingHorizontal: 15 * scale,
        paddingTop: 12 * scale,
        paddingBottom: 12 * scale,
        fontSize: 18 * scale,
        lineHeight: 23 * scale,
      },
    ];

    if (isFocused) {
      return (
        <TextInput
          autoFocus
          value={value}
          onChangeText={onChangeText}
          onFocus={() => focusDesignCInlineNote(noteId, scrollY)}
          onBlur={() => setFocusedDesignCNote(null)}
          placeholder="Add notes"
          placeholderTextColor="#7E858B"
          multiline
          textAlignVertical="top"
          style={noteStyle}
        />
      );
    }

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit notes"
        onPress={() => focusDesignCInlineNote(noteId, scrollY)}
        style={noteStyle}
      >
        <View style={[styles.altMessageNotesLine, { rowGap: 5 * scale }]}>
          {(value || "Add notes").split(/(apple)/gi).map((part, partIndex) =>
            part.toLowerCase() === "apple" ? (
              <View
                key={`${noteId}-apple-${partIndex}`}
                style={[
                  styles.applePill,
                  {
                    borderRadius: 13 * scale,
                    paddingHorizontal: 9 * scale,
                    paddingVertical: 2 * scale,
                  },
                ]}
              >
                <Text style={[styles.applePillText, { fontSize: 18 * scale, lineHeight: 22 * scale }]}>
                  {part}
                </Text>
              </View>
            ) : (
              <Text
                key={`${noteId}-text-${partIndex}`}
                style={[
                  value ? styles.designCNotesPreviewText : styles.designCNotesPlaceholder,
                  { fontSize: 18 * scale, lineHeight: 23 * scale },
                ]}
              >
                {part}
              </Text>
            ),
          )}
        </View>
      </Pressable>
    );
  };
  const toggleDesignBCupFlag = (group, index) => {
    setDesignBDefectsByPage((currentDefectsByPage) => {
      const currentDefects = currentDefectsByPage[currentDesignBPage.id] || defaultDesignBDefects;
      const nextGroup = currentDefects[group].map((checked, flagIndex) =>
        flagIndex === index ? !checked : checked,
      );

      return {
        ...currentDefectsByPage,
        [currentDesignBPage.id]: {
          ...currentDefects,
          [group]: nextGroup,
          defects: { ...currentDefects.defects },
        },
      };
    });
  };
  const toggleDesignBDefect = (defect, index) => {
    setDesignBDefectsByPage((currentDefectsByPage) => {
      const currentDefects = currentDefectsByPage[currentDesignBPage.id] || defaultDesignBDefects;
      const currentDefectFlags = Array.isArray(currentDefects.defects[defect])
        ? currentDefects.defects[defect]
        : emptyCupFlags;
      const nextDefectFlags = currentDefectFlags.map((checked, flagIndex) =>
        flagIndex === index ? !checked : checked,
      );

      return {
        ...currentDefectsByPage,
        [currentDesignBPage.id]: {
          ...currentDefects,
          nonUniform: [...currentDefects.nonUniform],
          defective: [...currentDefects.defective],
          defects: {
            ...currentDefects.defects,
            [defect]: nextDefectFlags,
          },
        },
      };
    });
  };
  const balloonAnimations = useRef(balloonConfigs.map(() => new Animated.Value(0))).current;
  const triggerBalloons = () => {
    balloonAnimations.forEach((animation) => animation.setValue(0));
    Animated.stagger(
      90,
      balloonAnimations.map((animation) =>
        Animated.timing(animation, {
          toValue: 1,
          duration: 1700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();
  };
  const goToSection = (nextIndex) => {
    Keyboard.dismiss();
    setSectionIndex(Math.min(Math.max(nextIndex, 0), sections.length - 1));
  };
  const saveEntry = () => {
    const trimmedNotes = notes.trim();
    const hasFinalSelected = savedEntries.some((entry) => entry.isFinal);

    if (!selectedScore && !trimmedNotes) {
      if (hasFinalSelected) {
        triggerBalloons();
      }
      return;
    }

    const now = new Date();
    const entry = {
      id: `${currentSection}-${now.getTime()}`,
      score: selectedScore || "-",
      notes: trimmedNotes,
      temp: currentTemp,
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isFinal: false,
    };

    setSavedEntriesBySection((currentEntries) => ({
      ...currentEntries,
      [currentSection]: [...(currentEntries[currentSection] || []), entry],
    }));
    setSelectedScores((currentScores) => ({
      ...currentScores,
      [currentSection]: null,
    }));
    setNotesBySection((currentNotes) => ({
      ...currentNotes,
      [currentSection]: "",
    }));
    if (hasFinalSelected) {
      triggerBalloons();
    }
    Keyboard.dismiss();
  };
  const toggleFinalEntry = (entryId) => {
    setSavedEntriesBySection((currentEntries) => ({
      ...currentEntries,
      [currentSection]: (currentEntries[currentSection] || []).map((entry) => ({
        ...entry,
        isFinal: entry.id === entryId ? !entry.isFinal : false,
      })),
    }));
  };
  const saveDesignBEntry = () => {
    const trimmedNotes = designBNotes.trim();

    if (!isDesignBDirty) {
      setIsDesignBDrawerOpen(false);
      if (isDesignC) {
        setCurrentCupIndex((currentIndex) => Math.min(currentIndex + 1, sessionCups.length - 1));
      }
      return;
    }

    if (trimmedNotes) {
      setDesignBEntriesByPage((currentEntriesByPage) => ({
        ...currentEntriesByPage,
        [currentDesignBPage.id]: [
          ...(currentEntriesByPage[currentDesignBPage.id] || []),
          {
            id: `design-b-${Date.now()}`,
            notes: trimmedNotes,
            temp: currentTemp,
            brewTime: currentBrewTime,
          },
        ],
      }));
    }
    setDesignBLastSavedByPage((currentSavedStates) => ({
      ...currentSavedStates,
      [currentDesignBPage.id]: {
        ...currentDesignBPageState,
        notes: isDesignC ? trimmedNotes : "",
      },
    }));
    if (!isDesignC) {
      setCurrentDesignBNotes("");
    }
    Keyboard.dismiss();
    setIsDesignCNotesFocused(false);
    setIsDesignBDrawerOpen(false);
  };
  const deleteDesignBEntry = (entryId) => {
    setDesignBEntriesByPage((currentEntriesByPage) => ({
      ...currentEntriesByPage,
      [currentDesignBPage.id]: (currentEntriesByPage[currentDesignBPage.id] || []).filter(
        (entry) => entry.id !== entryId,
      ),
    }));
  };
  const renderDesignBDefectDrawer = () => (
    <View style={styles.defectDrawer}>
      <View style={[styles.defectDrawerIntro, { marginBottom: (isDesignC ? 42 : 34) * scale }]}>
        <Text style={[styles.defectDrawerIntroText, { fontSize: 21 * scale, lineHeight: 27 * scale }]}>
          Record any negative flavours that affect cup quality.
        </Text>
      </View>

      <View style={[styles.defectItem, isDesignC ? { minHeight: 150 * scale } : null]}>
        <View style={styles.cupFlagRow}>
          <Text style={[styles.defectDrawerLabel, { fontSize: 25 * scale, lineHeight: 31 * scale }]}>
            NON-UNIFORM CUPS
          </Text>
          <View style={[styles.cupBoxRow, { gap: 10 * scale }]}>
            {currentDesignBDefects.nonUniform.map((checked, index) => (
              <Pressable
                key={`nonUniform-${index}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={`NON-UNIFORM CUPS cup ${index + 1}`}
                onPress={() => toggleDesignBCupFlag("nonUniform", index)}
                style={[
                  styles.defectCheckbox,
                  {
                    width: 30 * scale,
                    height: 30 * scale,
                    borderWidth: 2.4 * scale,
                  },
                  checked ? styles.defectCheckboxSelected : null,
                ]}
              />
            ))}
          </View>
        </View>
        <Text style={[styles.defectDescription, { marginTop: 3 * scale, fontSize: 21 * scale, lineHeight: 27 * scale }]}>
          Inconsistent flavour between cups of the same sample
        </Text>
      </View>

      <View style={styles.defectDrawerSection}>
        {[
          ["MOLDY", "moldy", "Musty, damp, mould-like flavour (wet cardboard / mildew)."],
          ["PHENOLIC", "phenolic", "Medicinal, chemical, plastic-like or smoky taint."],
          ["POTATO", "potato", "Raw potato smell/taste; earthy, starchy, savoury defect."],
        ].map(([label, defect, description]) => {
          const defectFlags = Array.isArray(currentDesignBDefects.defects[defect])
            ? currentDesignBDefects.defects[defect]
            : emptyCupFlags;
          return (
            <View
              key={defect}
              style={[
                styles.defectItem,
                isDesignC
                  ? {
                      minHeight: 150 * scale,
                    }
                  : {
                      marginTop: 28 * scale,
                    },
              ]}
            >
              <View style={styles.cupFlagRow}>
                <Text style={[styles.defectDrawerLabel, { fontSize: 25 * scale, lineHeight: 31 * scale }]}>{label}</Text>
                <View style={[styles.cupBoxRow, { gap: 10 * scale }]}>
                  {defectFlags.map((checked, index) => (
                    <Pressable
                      key={`${defect}-${index}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${label} cup ${index + 1}`}
                      onPress={() => toggleDesignBDefect(defect, index)}
                      style={[
                        styles.defectCheckbox,
                        {
                          width: 30 * scale,
                          height: 30 * scale,
                          borderWidth: 2.4 * scale,
                        },
                        checked ? styles.defectCheckboxSelected : null,
                      ]}
                    />
                  ))}
                </View>
              </View>
              <Text style={[styles.defectDescription, { marginTop: 3 * scale, fontSize: 21 * scale, lineHeight: 27 * scale }]}>
                {description}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          Keyboard.dismiss();
          setSectionIndex((currentIndex) => Math.min(currentIndex + 1, sections.length - 1));
        }

        if (gestureState.dx > 50) {
          Keyboard.dismiss();
          setSectionIndex((currentIndex) => Math.max(currentIndex - 1, 0));
        }
      },
    }),
  ).current;
  const designBPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          Keyboard.dismiss();
          setDesignBPageIndex((currentIndex) => Math.min(currentIndex + 1, designBPages.length - 1));
        }

        if (gestureState.dx > 50) {
          Keyboard.dismiss();
          setDesignBPageIndex((currentIndex) => Math.max(currentIndex - 1, 0));
        }
      },
    }),
  ).current;
  if (activeDesign === "home") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.homeScreen, { paddingHorizontal: 26 * scale }]}>
          <View style={styles.homeTitleGroup}>
            <Text style={[styles.homeTitle, { fontSize: 34 * scale, lineHeight: 40 * scale }]}>Cupping Mockups</Text>
            <Text style={[styles.homeSubtitle, { marginTop: 8 * scale, fontSize: 16 * scale, lineHeight: 22 * scale }]}>
              Choose a screen direction to test.
            </Text>
          </View>

          <View style={[styles.homeButtonGroup, { gap: 14 * scale }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Cupping"
              onPress={() => {
                dismissKeyboardAndResetFocus();
                setIsDesignBDrawerOpen(false);
                setCurrentCupIndex(0);
                setActiveDesign("design");
              }}
              style={styles.homeButton}
            >
              <Text style={[styles.homeButtonText, { fontSize: 18 * scale, lineHeight: 22 * scale }]}>Cupping</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Home"
              onPress={() => {
                dismissKeyboardAndResetFocus();
                setIsDesignBDrawerOpen(false);
                setActiveDesign("home-a");
              }}
              style={[styles.homeButton, styles.homeButtonSecondary]}
            >
              <Text style={[styles.homeButtonText, styles.homeButtonTextSecondary, { fontSize: 18 * scale, lineHeight: 22 * scale }]}>
                Home
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Brewing"
              onPress={() => {
                dismissKeyboardAndResetFocus();
                setIsDesignBDrawerOpen(false);
                setActiveDesign("home-brewing");
              }}
              style={[styles.homeButton, styles.homeButtonSecondary]}
            >
              <Text style={[styles.homeButtonText, styles.homeButtonTextSecondary, { fontSize: 18 * scale, lineHeight: 22 * scale }]}>
                Brewing
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Session"
              onPress={() => {
                dismissKeyboardAndResetFocus();
                setIsDesignBDrawerOpen(false);
                setActiveDesign("session");
              }}
              style={[styles.homeButton, styles.homeButtonSecondary]}
            >
              <Text style={[styles.homeButtonText, styles.homeButtonTextSecondary, { fontSize: 18 * scale, lineHeight: 22 * scale }]}>
                Session
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (activeDesign === "session") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.homeAMockScreen}>
          <View style={styles.homeAHeader}>
            <View style={styles.homeAHeaderSide}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => setActiveDesign("home")}
                style={styles.homeAHeaderAction}
              >
                <Text style={styles.homeAHeaderBackGlyph}>‹</Text>
              </Pressable>
            </View>
            <Text style={styles.homeAHeaderTitle} numberOfLines={1}>
              Session
            </Text>
            <View style={styles.homeAHeaderSide}>
              <View style={styles.homeAHeaderSpacer} />
            </View>
          </View>
          <View
            style={[
              styles.sessionBlankBody,
              {
                paddingHorizontal: 26 * scale,
                paddingTop: 30 * scale,
                paddingBottom: 24 * scale,
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 22 * scale }}
            >
            <View style={[styles.sessionMetaList, { gap: 18 * scale }]}>
              {[
                { label: "Session UUID", value: "SESSION-19DAFB6B" },
                { label: "Date", value: "02 May 2026" },
                { label: "Session Name", value: "Morning Cupping" },
                { label: "Status", value: sessionStatus },
              ].map((item) => (
                <View key={item.label} style={[styles.sessionMetaRow, { paddingBottom: 16 * scale }]}>
                  <Text style={[styles.sessionMetaLabel, { fontSize: 16 * scale, lineHeight: 20 * scale }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.sessionMetaValue, { marginTop: 5 * scale, fontSize: 25 * scale, lineHeight: 31 * scale }]}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[styles.sessionCupList, { marginTop: 24 * scale }]}>
              {sessionCups.map((cup, index) => {
                const row = sessionCupRows[index];
                const isExpanded = expandedSessionCup === cup.name;
                const hasAllScores = row.scores.every((score) => score !== null && score !== undefined);
                const hasAllFinalScores = row.finalScoreIndices.length === row.scores.length;
                const isFinalScoreAvailable = hasAllScores && hasAllFinalScores;
                return (
                  <View
                    key={cup.name}
                    style={styles.sessionCupDrawer}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${isExpanded ? "Close" : "Open"} ${cup.name} cup details`}
                      onPress={() => setExpandedSessionCup((currentCupName) => (currentCupName === cup.name ? null : cup.name))}
                      style={[
                        styles.sessionCupRow,
                        {
                          minHeight: 112 * scale,
                          paddingVertical: 10 * scale,
                          gap: 9 * scale,
                        },
                      ]}
                    >
                      <View style={styles.sessionCupTopLine}>
                        <View style={[styles.sessionCupIdentity, { gap: 7 * scale }]}>
                          <View
                            style={[
                              styles.sessionCupDot,
                              {
                                width: 17 * scale,
                                height: 17 * scale,
                                borderRadius: 9 * scale,
                                backgroundColor: cup.color,
                              },
                            ]}
                          />
                          <Text style={[styles.sessionCupNumber, { fontSize: 22 * scale, lineHeight: 27 * scale }]}>
                            Cup {index + 1}/5
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.sessionCupScoresLine, { gap: 6 * scale }]}>
                          {row.scores.map((score, scoreIndex) => {
                            const isFinalScore = row.finalScoreIndices.includes(scoreIndex);
                            return (
                              <View
                                key={`${cup.name}-score-${scoreIndex}`}
                                style={[styles.sessionScoreItem, { gap: 3 * scale }]}
                              >
                                <Text style={[styles.sessionScoreLabel, { fontSize: 12 * scale, lineHeight: 15 * scale }]}>
                                  {sessionScoreLabels[scoreIndex]}
                                </Text>
                                <View
                                  style={[
                                    styles.sessionScoreCircle,
                                    {
                                      width: 38 * scale,
                                      height: 38 * scale,
                                      borderRadius: 7 * scale,
                                      borderWidth: 2.2 * scale,
                                    },
                                    isFinalScore ? styles.sessionScoreCircleFinal : null,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.sessionScoreCircleText,
                                      { fontSize: 25 * scale, lineHeight: 29 * scale },
                                      isFinalScore ? styles.sessionScoreCircleTextFinal : null,
                                    ]}
                                  >
                                    {score ?? "-"}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}

                        <View style={[styles.sessionDefectIconRow, { gap: 4 * scale }]}>
                          {row.defects.length > 0 ? (
                            row.defects.map((defect) => (
                              <View
                                key={`${cup.name}-${defect}`}
                                style={[
                                  styles.sessionDefectIcon,
                                  {
                                    width: 32 * scale,
                                    height: 32 * scale,
                                    borderRadius: 16 * scale,
                                  },
                                ]}
                              >
                                <Text style={[styles.sessionDefectIconText, { fontSize: 18 * scale, lineHeight: 22 * scale }]}>
                                  {defect}
                                </Text>
                              </View>
                            ))
                          ) : (
                            <Text style={[styles.sessionNoDefectsText, { fontSize: 20 * scale, lineHeight: 24 * scale }]}>-</Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.sessionCupFinalLine}>
                        <Text
                          style={[
                            styles.sessionFinalScore,
                            { fontSize: 22 * scale, lineHeight: 27 * scale },
                            !isFinalScoreAvailable ? styles.sessionFinalScoreUnavailable : null,
                          ]}
                        >
                          {isFinalScoreAvailable ? `Final score ${row.finalScore}` : "Final score -"}
                        </Text>
                      </View>
                      <Text style={[styles.sessionCupDrawerGlyph, { fontSize: 34 * scale, lineHeight: 38 * scale }]}>
                        {isExpanded ? "⌃" : "⌄"}
                      </Text>
                    </Pressable>
                    {isExpanded ? (
                      <View
                        style={[
                          styles.sessionCupDrawerBody,
                          {
                            paddingHorizontal: 18 * scale,
                            paddingTop: 13 * scale,
                            paddingBottom: 16 * scale,
                            gap: 14 * scale,
                          },
                        ]}
                      >
                        {[
                          { label: "Cup UUID", value: row.cupUuid },
                          { label: "Coffee", value: row.coffeeNameOrigin },
                          { label: "Process", value: row.process },
                        ].map((item) => (
                          <View key={`${cup.name}-${item.label}`} style={styles.sessionCupDrawerInfoRow}>
                            <Text style={[styles.sessionCupDrawerLabel, { width: 130 * scale, fontSize: 20 * scale, lineHeight: 25 * scale }]}>
                              {item.label}
                            </Text>
                            <Text style={[styles.sessionCupDrawerValue, { flex: 1, fontSize: 22 * scale, lineHeight: 27 * scale }]}>
                              {item.value}
                            </Text>
                          </View>
                        ))}
                        <View style={styles.sessionCupDrawerInfoRow}>
                          <Text style={[styles.sessionCupDrawerLabel, { width: 130 * scale, fontSize: 20 * scale, lineHeight: 25 * scale }]}>
                            Flavours
                          </Text>
                          <View style={[styles.sessionFlavourPillRow, { gap: 8 * scale }]}>
                            {row.flavours.map((flavour) => (
                              <View
                                key={`${cup.name}-${flavour}`}
                                style={[
                                  styles.applePill,
                                  {
                                    borderRadius: 15 * scale,
                                    paddingHorizontal: 12 * scale,
                                    paddingVertical: 3 * scale,
                                  },
                                ]}
                              >
                                <Text style={[styles.applePillText, { fontSize: 20 * scale, lineHeight: 25 * scale }]}>
                                  {flavour}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan cup"
              style={[
                styles.scanButton,
                {
                  width: "100%",
                  backgroundColor: "#007AFF",
                },
              ]}
            >
              <Text style={[styles.scanButtonText, { fontSize: 19 * scale, lineHeight: 23 * scale }]}>SCAN CUP</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (activeDesign === "home-a" || activeDesign === "home-brewing") {
    return (
        <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.homeAMockScreen}>
          <View style={styles.homeAHeader}>
            <View style={styles.homeAHeaderSide}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open menu"
                onPress={() => setActiveDesign("home")}
                style={styles.homeAHeaderAction}
              >
                <Text style={styles.homeAHeaderIcon}>☰</Text>
              </Pressable>
            </View>
            <Text style={styles.homeAHeaderTitle} numberOfLines={1}>
              {homeAPageTitle}
            </Text>
            <View style={styles.homeAHeaderSide}>
              <View style={styles.homeAHeaderSpacer} />
            </View>
          </View>

          <View
            style={[styles.homeAContent, { paddingHorizontal: 24 * scale, paddingBottom: 24 * scale }]}
          >
            <View style={[styles.homeAHeroGroup, { marginTop: -80 * scale }]}>
              {isHomeABrewing ? (
                <Text
                  style={[
                    styles.homeABrewingPercent,
                    {
                      top: 46 * scale,
                      fontSize: 38 * scale,
                      lineHeight: 44 * scale,
                    },
                  ]}
                >
                  50%
                </Text>
              ) : null}
              <View
                style={[
                  styles.homeACupImageContainer,
                  {
                    width: 450,
                    height: 450,
                    marginBottom: 16,
                  },
                ]}
              >
                <Image source={require("./assets/cup_image.png")} style={styles.homeACupImage} resizeMode="contain" />
                {isHomeABrewing ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.homeABrewingTimerRing,
                      {
                        width: 232,
                        height: 232,
                        borderRadius: 116,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.homeABrewingTimerTrack,
                        {
                          borderRadius: 116,
                          borderWidth: 8,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.homeABrewingHalfClip,
                        {
                          width: 116,
                          height: 232,
                          right: 0,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.homeABrewingProgressHalf,
                          {
                            width: 232,
                            height: 232,
                            borderRadius: 116,
                            borderWidth: 8,
                            right: 0,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Scan cup"
                  onPress={() => setActiveDesign("home-brewing")}
                  style={[
                    styles.homeAScanOverlayButton,
                    {
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      top: 180,
                      left: 181,
                    },
                  ]}
                />
              </View>

              {isHomeAScanned ? (
                <Text
                  style={[
                    styles.homeAReadyTemperature,
                    {
                      marginTop: -166 * scale,
                      marginBottom: 10 * scale,
                      fontSize: 44 * scale,
                      lineHeight: 50 * scale,
                    },
                  ]}
                >
                  {homeATemperature}
                </Text>
              ) : null}

              <Text
                style={[
                  styles.homeAScanInstruction,
                  {
                    marginTop: isHomeAScanned ? 0 : -106 * scale,
                    marginBottom: 18 * scale,
                    paddingHorizontal: 18 * scale,
                    fontSize: 30 * scale,
                    lineHeight: 36 * scale,
                  },
                ]}
              >
                Press scan and hold your phone near the base of the cup.
              </Text>

              <View style={styles.homeAInstructionsGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Scan cup"
                  onPress={() => setActiveDesign("home-brewing")}
                  style={[
                    styles.scanButton,
                    {
                      width: width - 52 * scale,
                      backgroundColor: "#007AFF",
                    },
                  ]}
                >
                  <Text style={[styles.scanButtonText, { fontSize: 19 * scale, lineHeight: 23 * scale }]}>SCAN CUP</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (activeDesign === "alternative" || activeDesign === "design") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
        <View style={styles.gestureView} {...(isDesignC ? {} : designBPanResponder.panHandlers)}>
        <TouchableWithoutFeedback onPress={dismissKeyboardAndResetFocus} accessible={false}>
        <View style={styles.altScreen}>
          <View
            pointerEvents="none"
            style={[
              styles.headerTopMask,
              {
                top: -140 * scale,
                height: 140 * scale,
              },
            ]}
          />
          <View
            style={[
              styles.pageHeader,
              isDesignC
                ? styles.homeAHeaderLike
                : {
                    height: 56 * scale,
                    paddingTop: 20 * scale,
                    paddingHorizontal: 26 * scale,
                  },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => {
                dismissKeyboardAndResetFocus();
                setActiveDesign("home");
              }}
              style={[
                styles.backButton,
                isDesignC
                  ? styles.homeAHeaderBackButton
                  : {
                      left: 18 * scale,
                      bottom: -4 * scale,
                      width: 58 * scale,
                      height: 48 * scale,
                    },
              ]}
            >
              <Text
                style={[
                  styles.backArrow,
                  isDesignC
                    ? styles.homeAHeaderBackText
                    : { fontSize: 44 * scale, lineHeight: 48 * scale },
                ]}
              >
                ‹
              </Text>
            </Pressable>
            <View style={[styles.altTitleGroup, { gap: isDesignC ? 8 * scale : 12 * scale }]}>
              {isDesignC ? (
                <>
                  <View
                    style={[
                      styles.cuppingHeaderSampleDot,
                      {
                        width: 14 * scale,
                        height: 14 * scale,
                        borderRadius: 7 * scale,
                        backgroundColor: currentCup.color,
                      },
                    ]}
                  />
                  <Text style={[styles.homeAHeaderCuppingTitle, { fontSize: 30 * scale, lineHeight: 36 * scale }]}>
                    {currentCupLabel}
                  </Text>
                </>
              ) : (
                <Text style={[styles.pageTitle, { fontSize: 30 * scale, lineHeight: 36 * scale }]}>▲</Text>
              )}
              {isDesignC ? null : (
                <View
                  style={[
                    styles.pagination,
                    {
                      gap: 8 * scale,
                    },
                  ]}
                >
                  {designBPages.map((page, index) => {
                    const active = index === designBPageIndex;
                    return (
                      <View
                        key={`design-b-title-${page.id}`}
                        style={[
                          styles.paginationDot,
                          {
                            width: active ? 22 * scale : 11 * scale,
                            height: 11 * scale,
                            borderRadius: 6 * scale,
                          },
                          active ? styles.paginationDotActive : null,
                        ]}
                      />
                    );
                  })}
                </View>
              )}
            </View>
            <View
              style={[
                styles.titleMetaGroup,
                {
                  right: isDesignC ? 10 : 18 * scale,
                  bottom: isDesignC ? 12 : 3 * scale,
                  gap: 14 * scale,
                },
              ]}
            >
              <View style={[styles.titleMetaItem, { gap: 7 * scale }]}>
                <View style={[styles.thermometerIcon, { width: 14 * scale, height: 32 * scale }]}>
                  <View
                    style={[
                      styles.thermometerStem,
                      {
                        width: 6 * scale,
                        height: 23 * scale,
                        borderRadius: 3 * scale,
                        borderWidth: 2 * scale,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.thermometerBulb,
                      {
                        width: 14 * scale,
                        height: 14 * scale,
                        borderRadius: 7 * scale,
                        borderWidth: 2 * scale,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.titleMetaText,
                    isDesignC
                      ? styles.homeAHeaderMetaText
                      : { fontSize: 18 * scale, lineHeight: 23 * scale },
                  ]}
                >
                  {currentTemp}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            ref={designCScrollRef}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={isDesignC}
            onScrollBeginDrag={Keyboard.dismiss}
            canCancelContentTouches
            directionalLockEnabled
            scrollEnabled={isDesignC}
            showsVerticalScrollIndicator={isDesignC}
            contentContainerStyle={{
              paddingBottom: isDesignC ? 190 * scale : 0,
            }}
            style={[
              styles.designCContentLayer,
              isDesignC
                ? {
                    transform: [{ translateY: designCKeyboardShift }],
                  }
                : null,
              ]}
            >
          <View style={styles.designCScoreArea}>
          {isDesignC ? (
            <View
              style={[
                styles.titleWithInfo,
                {
                  marginTop: 12 * scale,
                  gap: 8 * scale,
                },
              ]}
            >
              <Text style={[styles.designCScoreCta, { fontSize: 22 * scale, lineHeight: 28 * scale }]}>
                Score Sample
              </Text>
              <View
                style={[
                  styles.infoIcon,
                  {
                    width: 22 * scale,
                    height: 22 * scale,
                    borderRadius: 11 * scale,
                    borderWidth: 2 * scale,
                  },
                ]}
              >
                <Text style={[styles.infoIconText, { fontSize: 14 * scale, lineHeight: 17 * scale }]}>i</Text>
              </View>
            </View>
          ) : null}
          <View
            style={[
              styles.altScoreTable,
              {
                marginTop: (isDesignC ? 7 : 40) * scale,
                paddingTop: (isDesignC ? 3 : 8) * scale,
                paddingHorizontal: (isDesignC ? 10 : 14) * scale,
              },
            ]}
          >
            {currentDesignBPage.rows.map((label) => (
              <React.Fragment key={label}>
              <View style={[styles.altScoreSection, { paddingBottom: (isDesignC ? 11 : 12) * scale }]}>
                <Text style={[styles.altScoreLabel, { fontSize: (isDesignC ? 22 : 24) * scale, lineHeight: (isDesignC ? 28 : 31) * scale }]}>
                  {label}
                </Text>
                <View style={[styles.altScoreControls, { marginTop: (isDesignC ? 2 : 6) * scale }]}>
                  {scores.map((score) => {
                    const selected = designBSelections[label] === score;
                    return (
                    <Pressable
                      key={score}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} score ${score}`}
                      onPress={() => {
                        if (isDesignC && isAnyDesignCNoteFocused) {
                          dismissKeyboardAndResetFocus();
                          return;
                        }

                        setDesignBSelections((currentSelections) => {
                          const isClearingScore = currentSelections[label] === score;
                          if (isClearingScore) {
                            setDesignBFinals((currentFinals) => ({
                              ...currentFinals,
                              [label]: false,
                            }));
                          }

                          return {
                            ...currentSelections,
                            [label]: isClearingScore ? null : score,
                          };
                        });
                      }}
                      style={[
                        styles.altScoreCircle,
                        {
                          width: (isDesignC ? 38 : 40) * scale,
                          height: (isDesignC ? 38 : 40) * scale,
                          borderRadius: (isDesignC ? 19 : 20) * scale,
                          borderWidth: (isDesignC ? 2.3 : 2.4) * scale,
                        },
                        selected ? styles.altScoreCircleSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.altScoreText,
                          {
                            fontSize: (isDesignC ? 27 : 28) * scale,
                            lineHeight: (isDesignC ? 30 : 31) * scale,
                          },
                          selected ? styles.altScoreTextSelected : null,
                        ]}
                      >
                        {score}
                      </Text>
                    </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label} final score`}
                    disabled={!designBSelections[label]}
                    onPress={() => {
                      if (isDesignC && isAnyDesignCNoteFocused) {
                        dismissKeyboardAndResetFocus();
                        return;
                      }

                      setDesignBFinals((currentFinals) => ({
                        ...currentFinals,
                        [label]: !currentFinals[label],
                      }));
                    }}
                    style={[
                      styles.altFinalPill,
                      {
                        width: (isDesignC ? 84 : 88) * scale,
                        height: (isDesignC ? 38 : 40) * scale,
                        borderRadius: (isDesignC ? 19 : 20) * scale,
                        marginLeft: (isDesignC ? 12 : 14) * scale,
                      },
                      designBSelections[label] && designBFinals[label] ? styles.altFinalPillSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.altFinalText,
                        {
                          fontSize: (isDesignC ? 16 : 17) * scale,
                          lineHeight: (isDesignC ? 19 : 20) * scale,
                        },
                        designBSelections[label] && designBFinals[label] ? styles.altFinalTextSelected : null,
                      ]}
                    >
                      FINAL
                    </Text>
                  </Pressable>
                </View>
              </View>
              {isDesignC && label === "Aroma" ? (
                <View
                  style={[
                    styles.pairedNotesBlock,
                    {
                      marginTop: 1 * scale,
                      marginBottom: 14 * scale,
                    },
                  ]}
                >
                  {renderDesignCInlineNote(
                    "fragrance-aroma",
                    designCFragranceAromaNotes,
                    setDesignCFragranceAromaNotes,
                    95 * scale,
                  )}
                </View>
              ) : null}
              {isDesignC && label === "Aftertaste" ? (
                <View
                  style={[
                    styles.pairedNotesBlock,
                    {
                      marginTop: 1 * scale,
                      marginBottom: 14 * scale,
                    },
                  ]}
                >
                  {renderDesignCInlineNote(
                    "flavour-aftertaste",
                    designCFlavourAftertasteNotes,
                    setDesignCFlavourAftertasteNotes,
                    310 * scale,
                  )}
                </View>
              ) : null}
              {isDesignC && designCIndividualNoteRows.includes(label) ? (
                <View
                  style={[
                    styles.pairedNotesBlock,
                    {
                      marginTop: 1 * scale,
                      marginBottom: 14 * scale,
                    },
                  ]}
                >
                  {renderDesignCInlineNote(
                    label,
                    designCIndividualNotes[label] || "",
                    (text) => setDesignCIndividualNote(label, text),
                    (
                      {
                        Acidity: 500,
                        Sweetness: 665,
                        Mouthfeel: 830,
                        Overall: 995,
                      }[label] || 500
                    ) * scale,
                  )}
                </View>
              ) : null}
              </React.Fragment>
            ))}
          </View>
          </View>

          {isDesignC && !isAnyDesignCNoteFocused && designCDefectBadges.length > 0 ? (
            <View
              style={[
                styles.designCDefectBadgeRow,
                {
                  paddingHorizontal: 22 * scale,
                  paddingTop: 4 * scale,
                  paddingBottom: 180 * scale,
                  gap: 10 * scale,
                },
              ]}
            >
              {designCDefectBadges.map((badge) => (
                <View
                  key={badge.id}
                  accessibilityLabel={badge.label}
                  style={[
                    styles.designCDefectBadge,
                    {
                      minHeight: 38 * scale,
                      borderRadius: 19 * scale,
                      paddingLeft: 6 * scale,
                      paddingRight: 13 * scale,
                      gap: 6 * scale,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.designCDefectBadgeIcon,
                      {
                        width: 27 * scale,
                        height: 27 * scale,
                        borderRadius: 14 * scale,
                      },
                    ]}
                  >
                    <Text style={[styles.designCDefectBadgeIconText, { fontSize: 13 * scale, lineHeight: 16 * scale }]}>
                      {badge.icon}
                    </Text>
                  </View>
                  <Text style={[styles.designCDefectBadgeText, { fontSize: 14 * scale, lineHeight: 18 * scale }]}>
                    {badge.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {!isDesignC ? (
            <>
            <View
              style={[
                styles.titleWithInfo,
                {
                  marginTop: 14 * scale,
                  marginHorizontal: 22 * scale,
                  gap: 8 * scale,
                },
              ]}
            >
              <Text style={[styles.altMessagesTitle, { fontSize: 24 * scale, lineHeight: 31 * scale }]}>
                Notes:
              </Text>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              alwaysBounceVertical
              showsVerticalScrollIndicator
              style={[
                styles.altMessagesArea,
                {
                  paddingHorizontal: 22 * scale,
                  paddingTop: 16 * scale,
                },
              ]}
              contentContainerStyle={[
                styles.altMessagesContent,
                {
                  paddingBottom: (isDesignBDrawerOpen ? 340 : 220) * scale,
                },
              ]}
            >
              {designBEntries.map((entry, index) => {
                const isLeftMessage = index % 2 === 0;
                return (
              <View
                key={entry.id}
                style={[
                  styles.altMessageWrapper,
                  {
                    alignItems: isLeftMessage ? "flex-start" : "flex-end",
                    marginBottom: 16 * scale,
                  },
                ]}
              >
                <View style={[styles.altMessageTimestamp, { gap: 12 * scale }]}>
                  <View style={[styles.messageMetaItem, { gap: 5 * scale }]}>
                    <View style={[styles.messageCupIcon, { width: 21 * scale, height: 22 * scale }]}>
                      <View style={[styles.steamRow, { gap: 3 * scale }]}>
                        {[0, 1, 2].map((steam) => (
                          <View
                            key={steam}
                            style={[
                              styles.steamLine,
                              {
                                width: 2 * scale,
                                height: 7 * scale,
                                borderRadius: 1 * scale,
                              },
                            ]}
                          />
                        ))}
                      </View>
                      <View
                        style={[
                          styles.cupBowl,
                          {
                            width: 17 * scale,
                            height: 9 * scale,
                            borderRadius: 4 * scale,
                            borderWidth: 1.5 * scale,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.cupHandle,
                          {
                            width: 6 * scale,
                            height: 7 * scale,
                            borderRadius: 3 * scale,
                            borderWidth: 1.5 * scale,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.altMessageTimestampText, { fontSize: 16 * scale, lineHeight: 20 * scale }]}>
                      {entry.brewTime}
                    </Text>
                  </View>
                  <View style={[styles.messageMetaItem, { gap: 5 * scale }]}>
                    <View style={[styles.messageThermometerIcon, { width: 10 * scale, height: 23 * scale }]}>
                      <View
                        style={[
                          styles.thermometerStem,
                          {
                            width: 4 * scale,
                            height: 17 * scale,
                            borderRadius: 2 * scale,
                            borderWidth: 1.5 * scale,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.thermometerBulb,
                          {
                            width: 10 * scale,
                            height: 10 * scale,
                            borderRadius: 5 * scale,
                            borderWidth: 1.5 * scale,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.altMessageTimestampText, { fontSize: 16 * scale, lineHeight: 20 * scale }]}>
                      {entry.temp}
                    </Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete note"
                  onPress={() => deleteDesignBEntry(entry.id)}
                  hitSlop={8}
                  style={[
                    styles.deleteNoteButton,
                    {
                      marginTop: 5 * scale,
                      marginBottom: 2 * scale,
                      paddingHorizontal: 10 * scale,
                      minHeight: 24 * scale,
                      borderRadius: 12 * scale,
                    },
                  ]}
                >
                  <Text style={[styles.deleteNoteText, { fontSize: 12 * scale, lineHeight: 15 * scale }]}>Delete</Text>
                </Pressable>

                <View
                  style={[
                    styles.altMessageRecord,
                    {
                      borderRadius: 18 * scale,
                      paddingHorizontal: 16 * scale,
                      paddingVertical: 11 * scale,
                      marginTop: 7 * scale,
                    },
                    isLeftMessage ? styles.altMessageRecordLeft : styles.altMessageRecordRight,
                  ]}
                >
                  <View style={[styles.altMessageNotesLine, { rowGap: 5 * scale }]}>
                    {(entry.notes || "No notes").split(/(apple)/gi).map((part, partIndex) =>
                      part.toLowerCase() === "apple" ? (
                        <View
                          key={`${entry.id}-apple-${partIndex}`}
                          style={[
                            styles.applePill,
                            {
                              borderRadius: 15 * scale,
                              paddingHorizontal: 10 * scale,
                              paddingVertical: 2 * scale,
                            },
                          ]}
                        >
                          <Text style={[styles.applePillText, { fontSize: 23 * scale, lineHeight: 27 * scale }]}>
                            {part}
                          </Text>
                        </View>
                      ) : (
                        <Text
                          key={`${entry.id}-text-${partIndex}`}
                          style={[styles.altMessageNotes, { fontSize: 23 * scale, lineHeight: 29 * scale }]}
                        >
                          {part}
                        </Text>
                      ),
                    )}
                  </View>
                  <View
                    style={[
                      styles.altMessageTail,
                      {
                        bottom: 0,
                        borderTopWidth: 12 * scale,
                      },
                      isLeftMessage
                        ? {
                            left: -5 * scale,
                            borderRightWidth: 14 * scale,
                            borderRightColor: "#E9E9EB",
                          }
                        : {
                            right: -5 * scale,
                            borderLeftWidth: 14 * scale,
                            borderLeftColor: "#E9E9EB",
                          },
                    ]}
                  />
                </View>
              </View>
              );
              })}
            </ScrollView>
            </>
          ) : null}
          </ScrollView>

          {isDesignBDrawerOpen ? (
            <View
              style={[
                isDesignC ? styles.designCDefectDrawerOverlay : styles.defectDrawerOverlay,
                {
                  top: isDesignC ? 56 : (currentDesignBPage.rows.length > 1 ? 286 : 198) * scale,
                  paddingTop: isDesignC ? 0 : 20 * scale,
                  paddingHorizontal: isDesignC ? 0 : 26 * scale,
                  paddingBottom: isDesignC ? 0 : 180 * scale,
                },
              ]}
            >
              {isDesignC ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close defect drawer"
                  onPress={() => setIsDesignBDrawerOpen(false)}
                  style={[
                    styles.designCDefectSection,
                    {
                      minHeight: 58 * scale,
                      paddingHorizontal: 26 * scale,
                    },
                  ]}
                >
                  <Text style={[styles.designCDefectSectionText, { fontSize: 20 * scale, lineHeight: 25 * scale }]}>
                    ⌄ Defects
                  </Text>
                </Pressable>
              ) : null}
              {isDesignC ? (
                <View
                  style={{
                    paddingTop: 34 * scale,
                    paddingHorizontal: 26 * scale,
                    paddingBottom: 16 * scale,
                  }}
                >
                  {renderDesignBDefectDrawer()}
                </View>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingTop: 74 * scale,
                    paddingBottom: 28 * scale,
                  }}
                >
                  {renderDesignBDefectDrawer()}
                </ScrollView>
              )}
            </View>
          ) : null}

          {!isDesignC && !isAnyDesignCNoteFocused ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDesignBDrawerOpen ? "Close defect drawer" : "Open defect drawer"}
            onPress={() => setIsDesignBDrawerOpen((isOpen) => !isOpen)}
            style={[
              styles.drawerHandle,
              {
                ...(isDesignBDrawerOpen
                  ? {
                      top: (isDesignC ? 494 : currentDesignBPage.rows.length > 1 ? 300 : 212) * scale,
                    }
                  : {
                      bottom: (isDesignC ? 142 : 232) * scale,
                    }),
                paddingHorizontal: 28 * scale,
                minHeight: 44 * scale,
                borderRadius: 22 * scale,
              },
            ]}
          >
            <Text style={[styles.drawerHandleText, { fontSize: 18 * scale, lineHeight: 22 * scale }]}>
              {isDesignBDrawerOpen ? "⌄ Defects" : "⌃ Defects"}
            </Text>
          </Pressable>
          ) : null}

          {isAnyDesignCNoteFocused ? null : (
          <View
            style={[
              styles.altNotesDock,
              {
                paddingHorizontal: isDesignC ? 0 : 26 * scale,
                paddingTop: isDesignC ? 0 : 26 * scale,
                paddingBottom: 24 * scale,
              },
            ]}
          >
            {isDesignC && !isDesignBDrawerOpen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open defect drawer"
                onPress={() => setIsDesignBDrawerOpen(true)}
                style={[
                  styles.designCDefectSection,
                  {
                    minHeight: 58 * scale,
                    paddingHorizontal: 26 * scale,
                  },
                ]}
              >
                <Text style={[styles.designCDefectSectionText, { fontSize: 20 * scale, lineHeight: 25 * scale }]}>
                  ⌃ Defects
                </Text>
              </Pressable>
            ) : isDesignC ? null : (
              <View
                style={[
                  styles.notesEntryRow,
                  {
                    gap: 14 * scale,
                  },
                ]}
              >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add attachment"
                style={[
                  styles.plusButton,
                  {
                    width: 42 * scale,
                    height: 58 * scale,
                  },
                ]}
              >
                <Text style={[styles.plusText, { fontSize: 42 * scale, lineHeight: 46 * scale }]}>+</Text>
              </Pressable>
              <TextInput
                value={designBNotes}
                onChangeText={setCurrentDesignBNotes}
                placeholder="Add notes"
                placeholderTextColor="#7E858B"
                multiline
                textAlignVertical="top"
                style={[
                  styles.notesInput,
                  {
                    minHeight: 58 * scale,
                    paddingHorizontal: 22 * scale,
                    paddingTop: 15 * scale,
                    paddingBottom: 15 * scale,
                    borderRadius: 29 * scale,
                    fontSize: 18 * scale,
                    lineHeight: 22 * scale,
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Record note"
                style={[
                  styles.micButton,
                  {
                    width: 52 * scale,
                    height: 58 * scale,
                  },
                ]}
              >
                <View
                  style={[
                    styles.micHead,
                    {
                      width: 19 * scale,
                      height: 30 * scale,
                      borderRadius: 10 * scale,
                      borderWidth: 3 * scale,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.micStem,
                    {
                      width: 3 * scale,
                      height: 11 * scale,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.micBase,
                    {
                      width: 18 * scale,
                      height: 3 * scale,
                      borderRadius: 2 * scale,
                    },
                  ]}
                />
              </Pressable>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDesignBSaveAction ? "Save" : "Scan cup"}
              onPress={saveDesignBEntry}
              style={[
                styles.scanButton,
                {
                  backgroundColor: isDesignBSaveAction ? ink : "#007AFF",
                  marginTop: (isDesignC && isDesignBDrawerOpen ? 0 : 14) * scale,
                  marginHorizontal: isDesignC ? 26 * scale : 0,
                },
              ]}
            >
              <Text style={[styles.scanButtonText, { fontSize: 19 * scale, lineHeight: 23 * scale }]}>
                {isDesignBSaveAction ? "Save" : "SCAN CUP"}
              </Text>
            </Pressable>
          </View>
          )}
        </View>
        </TouchableWithoutFeedback>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.gestureView} {...panResponder.panHandlers}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.screen}>
            <View
              style={[
                styles.pageHeader,
                {
                  height: 56 * scale,
                  paddingTop: 20 * scale,
                  paddingHorizontal: 26 * scale,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => setActiveDesign("home")}
                style={[
                  styles.backButton,
                  {
                    left: 18 * scale,
                    bottom: -4 * scale,
                    width: 58 * scale,
                    height: 48 * scale,
                  },
                ]}
              >
                <Text style={[styles.backArrow, { fontSize: 44 * scale, lineHeight: 48 * scale }]}>‹</Text>
              </Pressable>
              <View style={[styles.titleGroup, { gap: 8 * scale }]}>
                <Text style={[styles.triangleText, { fontSize: 24 * scale, lineHeight: 36 * scale }]}>▲</Text>
                <Text style={[styles.pageTitle, { fontSize: 30 * scale, lineHeight: 36 * scale }]}>{currentSection}</Text>
              </View>
              <Text
                style={[
                  styles.headerSideText,
                  {
                    right: 26 * scale,
                    bottom: 0,
                    fontSize: 24 * scale,
                    lineHeight: 36 * scale,
                  },
                ]}
              >
                {currentTemp}
              </Text>
            </View>

            <View
              style={[
                styles.savedEntriesArea,
                {
                  paddingHorizontal: 22 * scale,
                  paddingTop: 18 * scale,
                },
              ]}
            >
              {savedEntries.map((entry) => (
                <View
                  key={entry.id}
                  style={[
                    styles.entryBubble,
                    {
                      borderRadius: 14 * scale,
                      paddingHorizontal: 16 * scale,
                      paddingVertical: 12 * scale,
                      marginBottom: 12 * scale,
                    },
                  ]}
                >
                  <View style={styles.entryTopRow}>
                    <View style={[styles.entryDataRow, { gap: 12 * scale }]}>
                      <View
                        style={[
                          styles.entryScoreCircle,
                          {
                            width: 44 * scale,
                            height: 44 * scale,
                            borderRadius: 22 * scale,
                            borderWidth: 2.2 * scale,
                          },
                        ]}
                      >
                        <Text style={[styles.entryScore, { fontSize: 29 * scale, lineHeight: 32 * scale }]}>
                          {entry.score}
                        </Text>
                      </View>
                      <Text style={[styles.entryTemp, { fontSize: 28 * scale, lineHeight: 34 * scale }]}>
                        {entry.temp}
                      </Text>
                      <Text style={[styles.entryMeta, { fontSize: 14 * scale, lineHeight: 18 * scale }]}>
                        {entry.time}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${currentSection} score as final`}
                      onPress={() => toggleFinalEntry(entry.id)}
                      style={[
                        styles.finalPill,
                        {
                          minWidth: 70 * scale,
                          height: 30 * scale,
                          borderRadius: 15 * scale,
                        },
                        entry.isFinal ? styles.finalPillSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.finalPillText,
                          { fontSize: 13 * scale, lineHeight: 16 * scale },
                          entry.isFinal ? styles.finalPillTextSelected : null,
                        ]}
                      >
                        FINAL
                      </Text>
                    </Pressable>
                  </View>

                  {entry.notes ? (
                    <Text style={[styles.entryNotes, { marginTop: 8 * scale, fontSize: 15 * scale, lineHeight: 20 * scale }]}>
                      {entry.notes}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.bottomContent}>
              <View
                style={[
                  styles.pagination,
                  {
                    marginBottom: 12 * scale,
                    gap: 7 * scale,
                  },
                ]}
              >
                {sections.map((section, index) => {
                  const active = index === sectionIndex;
                  return (
                    <Pressable
                      key={section}
                      accessibilityRole="button"
                      accessibilityLabel={`Go to ${section}`}
                      onPress={() => goToSection(index)}
                      style={[
                        styles.paginationDot,
                        {
                          width: active ? 18 * scale : 7 * scale,
                          height: 7 * scale,
                          borderRadius: 4 * scale,
                        },
                        active ? styles.paginationDotActive : null,
                      ]}
                    />
                  );
                })}
              </View>

          <View style={styles.panel}>

            <View
              style={[
                styles.notesArea,
                {
                  minHeight: 120 * scale,
                  paddingTop: 18 * scale,
                  paddingLeft: 26 * scale,
                  paddingRight: 26 * scale,
                },
              ]}
            >
              <Text style={[styles.notesLabel, { fontSize: 17 * scale, lineHeight: 20 * scale }]}>Notes</Text>
              <View
                style={[
                  styles.notesEntryRow,
                  {
                    marginTop: 12 * scale,
                    gap: 14 * scale,
                  },
                ]}
              >
                <TextInput
                  value={notes}
                  onChangeText={(text) =>
                    setNotesBySection((currentNotes) => ({
                      ...currentNotes,
                      [currentSection]: text,
                    }))
                  }
                  placeholder="Add notes"
                  placeholderTextColor="#7E858B"
                  multiline
                  textAlignVertical="top"
                  style={[
                    styles.notesInput,
                    {
                      minHeight: 58 * scale,
                      paddingHorizontal: 22 * scale,
                      paddingTop: 15 * scale,
                      paddingBottom: 15 * scale,
                      borderRadius: 29 * scale,
                      fontSize: 18 * scale,
                      lineHeight: 22 * scale,
                    },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Record note"
                  style={[
                    styles.micButton,
                    {
                      width: 52 * scale,
                      height: 58 * scale,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.micHead,
                      {
                        width: 19 * scale,
                        height: 30 * scale,
                        borderRadius: 10 * scale,
                        borderWidth: 3 * scale,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.micStem,
                      {
                        width: 3 * scale,
                        height: 11 * scale,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.micBase,
                      {
                        width: 18 * scale,
                        height: 3 * scale,
                        borderRadius: 2 * scale,
                      },
                    ]}
                  />
                </Pressable>
              </View>
            </View>

            <View style={[styles.divider, { marginTop: 4 * scale, marginLeft: 26 * scale, marginRight: 36 * scale }]} />

            <View
              style={[
                styles.headerBlock,
                {
                  paddingTop: 10 * scale,
                  paddingBottom: 10 * scale,
                  paddingLeft: 26 * scale,
                  paddingRight: 26 * scale,
                },
              ]}
            >
              <View style={styles.scoreRow}>
                {scores.map((score) => {
                  const selected = score === selectedScore;
                  return (
                    <Pressable
                      key={score}
                      accessibilityRole="button"
                      accessibilityLabel={`Score ${score}`}
                      onPress={() =>
                        setSelectedScores((currentScores) => ({
                          ...currentScores,
                          [currentSection]: score,
                        }))
                      }
                      style={[
                        styles.scoreButton,
                        {
                          width: 44 * scale,
                          height: 44 * scale,
                          borderRadius: 22 * scale,
                          borderWidth: 2.2 * scale,
                        },
                        selected ? styles.scoreButtonSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreText,
                          { fontSize: 29 * scale, lineHeight: 32 * scale },
                          selected ? styles.scoreTextSelected : null,
                        ]}
                      >
                        {score}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={[styles.scanButtonWrap, { paddingHorizontal: 26 * scale, paddingBottom: 24 * scale }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={saveEntry} style={styles.scanButton}>
              <Text style={[styles.scanButtonText, { fontSize: 19 * scale, lineHeight: 23 * scale }]}>Save</Text>
            </Pressable>
          </View>
            </View>
            <View pointerEvents="none" style={styles.balloonLayer}>
              {balloonConfigs.map((balloon, index) => {
                const animation = balloonAnimations[index];
                const translateY = animation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -640 * scale],
                });
                const translateX = animation.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, balloon.drift * scale, -balloon.drift * scale],
                });
                const opacity = animation.interpolate({
                  inputRange: [0, 0.1, 0.82, 1],
                  outputRange: [0, 1, 1, 0],
                });

                return (
                  <Animated.View
                    key={balloon.color}
                    style={[
                      styles.balloon,
                      {
                        left: width * balloon.left,
                        bottom: 92 * scale,
                        width: balloon.size * scale,
                        height: balloon.size * 1.28 * scale,
                        borderRadius: (balloon.size / 2) * scale,
                        backgroundColor: balloon.color,
                        opacity,
                        transform: [{ translateX }, { translateY }],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.balloonKnot,
                        {
                          borderLeftWidth: 5 * scale,
                          borderRightWidth: 5 * scale,
                          borderTopWidth: 8 * scale,
                          bottom: -7 * scale,
                          borderTopColor: balloon.color,
                        },
                      ]}
                    />
                  </Animated.View>
                );
              })}
            </View>
          </View>
        </TouchableWithoutFeedback>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ink = "#3F4A54";
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  homeScreen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  homeTitleGroup: {
    alignItems: "center",
  },
  homeTitle: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  homeSubtitle: {
    color: "#667078",
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
  },
  homeButtonGroup: {
    marginTop: 42,
  },
  homeButton: {
    minHeight: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ink,
  },
  homeButtonSecondary: {
    backgroundColor: "#EEF0F2",
    borderWidth: 1,
    borderColor: "#D5D8DB",
  },
  homeButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0,
  },
  homeButtonTextSecondary: {
    color: ink,
  },
  homeAMockScreen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  homeAHeader: {
    minHeight: 56,
    borderBottomWidth: 1,
    borderColor: "#DDDDDD",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  homeAHeaderSide: {
    width: 48,
    alignItems: "flex-start",
  },
  homeAHeaderAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  homeAHeaderIcon: {
    color: "#666666",
    fontSize: 20,
    lineHeight: 22,
  },
  homeAHeaderBackGlyph: {
    color: "#666666",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "600",
    letterSpacing: 0,
  },
  homeAHeaderTitle: {
    flex: 1,
    paddingRight: 8,
    color: "#222222",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center",
  },
  homeAHeaderSpacer: {
    width: 40,
    height: 40,
  },
  homeAContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  sessionBlankBody: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "space-between",
  },
  sessionMetaList: {
    width: "100%",
  },
  sessionMetaRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F2",
  },
  sessionMetaLabel: {
    color: "#667078",
    fontWeight: "800",
    letterSpacing: 0,
  },
  sessionMetaValue: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  sessionCupList: {
    width: "100%",
  },
  sessionCupDrawer: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F2",
  },
  sessionCupRow: {
    width: "100%",
    alignItems: "stretch",
  },
  sessionCupTopLine: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionCupIdentity: {
    flexDirection: "row",
    alignItems: "center",
  },
  sessionCupDot: {
    backgroundColor: "#E15A64",
  },
  sessionCupNumber: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  sessionScoreCircleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  sessionCupScoresLine: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  sessionScoreItem: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  sessionScoreLabel: {
    color: "#667078",
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  sessionScoreCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  sessionScoreCircleFinal: {
    borderColor: "#AEB4BA",
    backgroundColor: "#AEB4BA",
  },
  sessionScoreCircleText: {
    color: ink,
    fontWeight: "600",
    letterSpacing: 0,
  },
  sessionScoreCircleTextFinal: {
    color: "#FFFFFF",
  },
  sessionDefectIconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  sessionDefectIcon: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ink,
  },
  sessionDefectIconText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0,
  },
  sessionNoDefectsText: {
    color: "#C5CBD0",
    fontWeight: "800",
    letterSpacing: 0,
  },
  sessionFinalScore: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "left",
  },
  sessionFinalScoreUnavailable: {
    color: "#AEB4BA",
  },
  sessionCupFinalLine: {
    width: "100%",
    alignItems: "flex-start",
  },
  sessionCupDrawerGlyph: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  sessionCupDrawerBody: {
    width: "100%",
    backgroundColor: "#F6F7F8",
  },
  sessionCupDrawerInfoRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  sessionCupDrawerLabel: {
    color: "#667078",
    fontWeight: "800",
    letterSpacing: 0,
  },
  sessionCupDrawerValue: {
    color: ink,
    fontWeight: "700",
    letterSpacing: 0,
  },
  sessionFlavourPillRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  homeAHeroGroup: {
    alignItems: "center",
  },
  homeACupImageContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  homeABrewingPercent: {
    position: "absolute",
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
    zIndex: 4,
  },
  homeACupImage: {
    width: "100%",
    height: "100%",
  },
  homeABrewingTimerRing: {
    position: "absolute",
    zIndex: 3,
    backgroundColor: "transparent",
  },
  homeABrewingTimerTrack: {
    ...StyleSheet.absoluteFillObject,
    borderColor: "#C5CBD0",
  },
  homeABrewingHalfClip: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
  },
  homeABrewingProgressHalf: {
    position: "absolute",
    top: 0,
    borderColor: ink,
  },
  homeAScanOverlayButton: {
    position: "absolute",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    opacity: 1,
  },
  homeAInstructionsGroup: {
    alignItems: "center",
    width: "100%",
  },
  homeAStatusCard: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DDDDDD",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  homeAInstructionEmphasis: {
    color: "#222222",
    fontWeight: "700",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  homeATagLine: {
    color: "#666666",
    letterSpacing: 0,
  },
  homeAScanInstruction: {
    maxWidth: 390,
    color: "#666666",
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  homeAReadyTemperature: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  homeAScannedStatusCard: {
    borderWidth: 1,
    borderColor: "#D5D8DB",
    backgroundColor: "#EEF0F2",
  },
  homeAScannedStatusTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  homeAScannedStatusLabel: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  homeAScannedStatusTemp: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  homeAScannedStatusMeta: {
    color: "#667078",
    fontWeight: "700",
    letterSpacing: 0,
  },
  homeAPagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  homeAPaginationDot: {
    backgroundColor: "#C5CBD0",
  },
  homeAPaginationDotActive: {
    backgroundColor: ink,
  },
  homeATemperature: {
    color: "#222222",
    fontWeight: "700",
    letterSpacing: 0,
  },
  homeAStateTime: {
    color: "#666666",
    letterSpacing: 0,
  },
  homeMockScreen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  homeMockTitle: {
    flex: 1,
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  homeMockBody: {
    flex: 1,
    justifyContent: "center",
  },
  homeMockBodyText: {
    color: "#667078",
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center",
  },
  altScreen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  altScoreTable: {
    width: "100%",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  altTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  cuppingHeaderSampleDot: {
    backgroundColor: "#E15A64",
  },
  titleMetaGroup: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "flex-end",
  },
  titleMetaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleMetaText: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  designCScoreCta: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  titleWithInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  notesTitleEditingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  infoIcon: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: ink,
  },
  infoIconText: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  keyboardDoneButton: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ink,
  },
  keyboardDoneButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0,
  },
  designCScoreArea: {
    position: "relative",
  },
  designCScoreVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    zIndex: 5,
  },
  designCContentLayer: {
    flex: 1,
  },
  thermometerIcon: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  thermometerStem: {
    borderColor: ink,
    backgroundColor: "#FFFFFF",
    marginBottom: -2,
  },
  thermometerBulb: {
    borderColor: ink,
    backgroundColor: ink,
  },
  steamCupIcon: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  steamRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  steamLine: {
    backgroundColor: ink,
  },
  cupBowl: {
    borderColor: ink,
    borderTopWidth: 0,
    backgroundColor: "#FFFFFF",
  },
  cupHandle: {
    position: "absolute",
    right: -1,
    bottom: 1,
    borderLeftWidth: 0,
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  altScoreSection: {
    alignItems: "stretch",
  },
  altScoreLabel: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  altScoreControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  altScoreCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  altScoreCircleSelected: {
    backgroundColor: ink,
  },
  altScoreText: {
    color: ink,
    fontWeight: "600",
    letterSpacing: 0,
  },
  altScoreTextSelected: {
    color: "#FFFFFF",
  },
  altFinalPill: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#AEB4BA",
    backgroundColor: "#FFFFFF",
  },
  altFinalPillSelected: {
    borderColor: ink,
    backgroundColor: ink,
  },
  altFinalText: {
    color: "#AEB4BA",
    fontWeight: "800",
    letterSpacing: 0,
  },
  altFinalTextSelected: {
    color: "#FFFFFF",
  },
  pairedNotesBlock: {
    width: "100%",
  },
  pairedNotesInput: {
    width: "100%",
    color: "#111111",
    fontWeight: "500",
    letterSpacing: 0,
    backgroundColor: "#EEF0F2",
    borderWidth: 1,
    borderColor: "#D5D8DB",
    marginTop: 7,
  },
  altTableRule: {
    height: 1,
    backgroundColor: ink,
  },
  altNotesDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EEF0F2",
    zIndex: 20,
    elevation: 20,
  },
  defectDrawer: {
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  defectDrawerIntro: {
    width: "100%",
    alignItems: "flex-start",
  },
  defectDrawerTitle: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  defectDrawerIntroText: {
    color: "#667078",
    fontWeight: "600",
    letterSpacing: 0,
  },
  defectDrawerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 15,
    elevation: 15,
  },
  designCDefectDrawerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 15,
    elevation: 15,
  },
  defectDrawerSection: {
    alignItems: "flex-start",
  },
  cupFlagRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cupBoxRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  defectItem: {
    width: "100%",
  },
  defectDrawerLabel: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  defectDescription: {
    color: "#667078",
    fontStyle: "italic",
    fontWeight: "500",
    letterSpacing: 0,
  },
  defectRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  defectCheckbox: {
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  defectCheckboxSelected: {
    backgroundColor: ink,
  },
  drawerHandle: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF0F2",
    borderWidth: 1,
    borderColor: "#D5D8DB",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 22,
    zIndex: 30,
  },
  drawerHandleText: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  designCDefectSection: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF0F2",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D5D8DB",
  },
  designCDefectSectionText: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  altMessagesArea: {
    flex: 1,
  },
  designCNotesArea: {
    flex: 1,
  },
  designCNotesInput: {
    width: "100%",
    color: "#111111",
    fontWeight: "500",
    letterSpacing: 0,
    backgroundColor: "#EEF0F2",
    borderWidth: 1,
    borderColor: "#D5D8DB",
  },
  designCNotesPreviewText: {
    color: "#111111",
    fontWeight: "500",
    letterSpacing: 0,
  },
  designCNotesPlaceholder: {
    color: "#7E858B",
    fontWeight: "500",
    letterSpacing: 0,
  },
  designCDefectBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
  },
  designCDefectBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF0F2",
    borderWidth: 1,
    borderColor: "#D5D8DB",
  },
  designCDefectBadgeIcon: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ink,
  },
  designCDefectBadgeIconText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0,
  },
  designCDefectBadgeText: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  altMessagesContent: {
    alignItems: "flex-end",
  },
  altMessagesTitle: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  altMessageWrapper: {
    width: "100%",
  },
  altMessageTimestamp: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  messageMetaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  messageCupIcon: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  messageThermometerIcon: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  altMessageTimestampText: {
    color: "#9AA1A8",
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center",
  },
  deleteNoteButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F2F3",
  },
  deleteNoteText: {
    color: "#8D949A",
    fontWeight: "800",
    letterSpacing: 0,
  },
  altMessageRecord: {
    maxWidth: "82%",
  },
  altMessageRecordLeft: {
    backgroundColor: "#E9E9EB",
  },
  altMessageRecordRight: {
    backgroundColor: "#E9E9EB",
  },
  altMessageNotes: {
    color: "#111111",
    fontWeight: "500",
    letterSpacing: 0,
  },
  altMessageNotesLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  applePill: {
    backgroundColor: "#A7E8B3",
  },
  applePillText: {
    color: "#0D3B20",
    fontWeight: "800",
    letterSpacing: 0,
  },
  altMessageTail: {
    position: "absolute",
    width: 0,
    height: 0,
    borderTopColor: "transparent",
  },
  keyboardView: {
    flex: 1,
  },
  gestureView: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "space-between",
  },
  pageHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    zIndex: 40,
    elevation: 40,
  },
  homeAHeaderLike: {
    height: 56,
    minHeight: 56,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderColor: "#DDDDDD",
  },
  headerTopMask: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 39,
    elevation: 39,
  },
  backButton: {
    position: "absolute",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  homeAHeaderBackButton: {
    left: 10,
    bottom: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
  },
  backArrow: {
    color: ink,
    fontWeight: "600",
    letterSpacing: 0,
  },
  homeAHeaderBackText: {
    color: "#666666",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "600",
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  triangleText: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  pageTitle: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  homeAHeaderCuppingTitle: {
    color: "#222222",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
  },
  homeAHeaderMetaText: {
    color: "#222222",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  },
  headerSideText: {
    position: "absolute",
    textAlign: "right",
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  bottomContent: {
    width: "100%",
  },
  savedEntriesArea: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  entryBubble: {
    width: "100%",
    backgroundColor: "#EEF0F2",
    borderWidth: 1,
    borderColor: "#D5D8DB",
  },
  entryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  entryDataRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  entryScoreCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  entryScore: {
    color: ink,
    fontWeight: "600",
    letterSpacing: 0,
  },
  finalPill: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#9AA3AA",
    backgroundColor: "#FFFFFF",
  },
  finalPillSelected: {
    borderColor: ink,
    backgroundColor: ink,
  },
  finalPillText: {
    color: "#7A838A",
    fontWeight: "800",
    letterSpacing: 0,
  },
  finalPillTextSelected: {
    color: "#FFFFFF",
  },
  entryNotes: {
    color: "#2F3A42",
    fontWeight: "500",
    letterSpacing: 0,
  },
  entryTemp: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  entryMeta: {
    color: "#667078",
    fontWeight: "700",
    letterSpacing: 0,
  },
  panel: {
    width: "100%",
    marginBottom: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  paginationDot: {
    backgroundColor: "#C5CBD0",
  },
  paginationDotActive: {
    backgroundColor: ink,
  },
  headerBlock: {
    alignItems: "stretch",
  },
  title: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scoreButton: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: ink,
    backgroundColor: "#FFFFFF",
  },
  scoreButtonSelected: {
    backgroundColor: ink,
  },
  scoreText: {
    color: ink,
    fontWeight: "600",
    letterSpacing: 0,
  },
  scoreTextSelected: {
    color: "#FFFFFF",
  },
  divider: {
    height: 1,
    backgroundColor: "#8D949A",
  },
  notesArea: {},
  notesLabel: {
    color: ink,
    fontWeight: "800",
    letterSpacing: 0,
  },
  notesEntryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  plusButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  plusText: {
    color: ink,
    fontWeight: "300",
    letterSpacing: 0,
  },
  notesInput: {
    flex: 1,
    color: ink,
    backgroundColor: "#E7E8EA",
    borderWidth: 1,
    borderColor: "#D5D8DB",
    fontWeight: "500",
  },
  micButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  micHead: {
    borderColor: ink,
    backgroundColor: "transparent",
  },
  micStem: {
    marginTop: -1,
    backgroundColor: ink,
  },
  micBase: {
    backgroundColor: ink,
  },
  scanButtonWrap: {
    width: "100%",
  },
  scanButton: {
    minHeight: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ink,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  balloonLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  balloon: {
    position: "absolute",
    alignItems: "center",
  },
  balloonKnot: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
