import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { TypographyAuditText as Text } from "../../../components/ui/TypographyAuditText";
import { Header } from "../../../components/ui/Header";
import { ScreenContainer } from "../../../components/layout/ScreenContainer";
import { ScreenFooter } from "../../../components/ui/ScreenFooter";
import { WarningDialog } from "../../../components/ui/WarningDialog";
import { getUserProfile, saveUserProfile } from "../../../data/userProfileRepository";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

async function copyPhotoToDocuments(sourceUri, previousUri) {
  if (!sourceUri || !FileSystem.documentDirectory) {
    return "";
  }

  const targetUri = `${FileSystem.documentDirectory}profile-photo-${Date.now()}.jpg`;
  await FileSystem.copyAsync({
    from: sourceUri,
    to: targetUri,
  });

  if (previousUri && previousUri !== targetUri) {
    await FileSystem.deleteAsync(previousUri, { idempotent: true });
  }

  return targetUri;
}

export function AccountScreen({ onBackPress }) {
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPhotoChoiceVisible, setIsPhotoChoiceVisible] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadProfile = async () => {
      try {
        const profile = await getUserProfile();
        if (isCancelled) {
          return;
        }
        setName(profile?.name || "");
        setOrganisation(profile?.organisation || "");
        setPhotoUri(profile?.photoUri || "");
      } catch (error) {
        if (!isCancelled) {
          setStatusMessage(error?.message || "Could not load profile.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handlePickedImage = async (result) => {
    const pickedUri = result?.assets?.[0]?.uri;
    if (!pickedUri) {
      return;
    }

    try {
      const localUri = await copyPhotoToDocuments(pickedUri, photoUri);
      if (localUri) {
        setPhotoUri(localUri);
        setStatusMessage("");
      }
    } catch (error) {
      setStatusMessage(error?.message || "Could not save the selected photo.");
    }
  };

  const handleChooseFromLibrary = async () => {
    setIsPhotoChoiceVisible(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        setStatusMessage("Photo library access was not granted.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });

      if (!result.canceled) {
        await handlePickedImage(result);
      }
    } catch (error) {
      setStatusMessage(error?.message || "Could not choose a profile photo.");
    }
  };

  const handleTakePhoto = async () => {
    setIsPhotoChoiceVisible(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission?.granted) {
        setStatusMessage("Camera access was not granted.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });

      if (!result.canceled) {
        await handlePickedImage(result);
      }
    } catch (error) {
      setStatusMessage(error?.message || "Could not take a profile photo.");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveUserProfile({
        name,
        organisation,
        photoUri,
      });
      setStatusMessage("Profile saved.");
    } catch (error) {
      setStatusMessage(error?.message || "Could not save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Profile"
        variant="back"
        onBackPress={onBackPress}
        backAccessibilityLabel="Back"
        debugTag="AccountScreen"
      />
      <ScreenContainer>
        <View style={styles.profileBlock}>
          <Pressable
            style={({ pressed }) => [styles.photoButton, pressed && styles.photoButtonPressed]}
            onPress={() => setIsPhotoChoiceVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Choose profile picture"
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.profilePhoto} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder} />
            )}
          </Pressable>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Name"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Organisation</Text>
            <TextInput
              value={organisation}
              onChangeText={setOrganisation}
              placeholder="Organisation"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Organisation"
            />
          </View>

          {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
        </View>
      </ScreenContainer>
      <ScreenFooter
        label="SAVE"
        onPress={handleSave}
        loading={isSaving}
        disabled={isLoading || isSaving}
        accessibilityLabel="Save profile"
      />
      <WarningDialog
        visible={isPhotoChoiceVisible}
        title="Profile Photo"
        message="Choose how you would like to add your profile picture."
        variant="cupping-choice"
        secondaryLabel="Choose from Library"
        onSecondary={handleChooseFromLibrary}
        secondaryButtonStyle={styles.photoChoiceSecondaryButton}
        secondaryButtonTextStyle={styles.photoChoiceSecondaryButtonText}
        okLabel="Take Photo"
        onOk={handleTakePhoto}
        okButtonStyle={styles.photoChoiceOkButton}
        onDismiss={() => setIsPhotoChoiceVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileBlock: {
    gap: spacing.lg,
    alignItems: "stretch",
  },
  photoButton: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.quietBorder,
  },
  photoButtonPressed: {
    opacity: 0.72,
  },
  profilePhoto: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    flex: 1,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
  },
  input: {
    ...typography.text_body,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: colors.input,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  photoChoiceSecondaryButton: {
    backgroundColor: colors.muted,
  },
  photoChoiceSecondaryButtonText: {
    color: colors.ink,
  },
  photoChoiceOkButton: {
    backgroundColor: colors.ink,
  },
  statusText: {
    ...typography.text_secondary_body,
    color: colors.inkSoft,
    textAlign: "center",
  },
});
