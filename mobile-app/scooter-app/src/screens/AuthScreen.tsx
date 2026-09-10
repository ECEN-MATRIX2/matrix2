import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { signIn, signInWithGoogle, signUp } from "../lib/auth";
import { theme } from "../styles/theme";

export default function AuthScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function validateCredentials() {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier || !password) {
      Alert.alert("Missing info", "Enter both username/email and password.");
      return null;
    }
    if (normalizedIdentifier.length < 3) {
      Alert.alert("Invalid username/email", "Enter at least 3 characters.");
      return null;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return null;
    }
    return { identifier: normalizedIdentifier, password };
  }

  async function handleSignIn() {
    const creds = validateCredentials();
    if (!creds) return;

    setLoading(true);
    const { error } = await signIn(creds.identifier, creds.password);
    setLoading(false);

    if (error) {
      Alert.alert("Sign in failed", error.message);
    }
  }

  async function handleSignUp() {
    const creds = validateCredentials();
    if (!creds) return;

    setLoading(true);
    const { error } = await signUp(creds.identifier, creds.password);
    setLoading(false);

    if (error) {
      Alert.alert("Sign up failed", error.message);
      return;
    }

    Alert.alert(
      "Check your email",
      "If email confirmation is enabled, confirm your account then sign in."
    );
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);

    if (error) {
      Alert.alert("Google sign in failed", error.message);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.backdrop}>
        <View style={[styles.glowOrb, styles.glowOrbPrimary]} />
        <View style={[styles.glowOrb, styles.glowOrbAccent]} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <MaterialCommunityIcons
                  name="scooter-electric"
                  size={24}
                  color="#7A0019"
                />
              </View>
              <Text style={styles.brandEyebrow}>MATRIX2</Text>
            </View>
            <Text style={styles.title}>Urban rides. Smart control.</Text>
            <Text style={styles.subtitle}>
              Connect to your scooter, check live performance, and start every ride with confidence.
            </Text>
            <View style={styles.featureRow}>
              <Text style={styles.featureChip}>Real-time telemetry</Text>
              <Text style={styles.featureChip}>BLE diagnostics</Text>
              <Text style={styles.featureChip}>Ride intelligence</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.formTitle}>Sign in to continue</Text>
            <Text style={styles.formHint}>
              Email or username works. Username is mapped to test email format.
            </Text>

            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              placeholder="Email or username"
              placeholderTextColor="#8B6B73"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#8B6B73"
              style={styles.input}
            />

            <Pressable
              disabled={loading}
              onPress={handleSignIn}
              style={[styles.primaryButton, loading ? styles.buttonDisabled : undefined]}
            >
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </Pressable>

            <Pressable
              disabled={loading}
              onPress={handleGoogleSignIn}
              style={[styles.googleButton, loading ? styles.buttonDisabled : undefined]}
            >
              <MaterialCommunityIcons
                name="google"
                size={18}
                color="#7A0019"
                style={styles.googleIcon}
              />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </Pressable>

            <Pressable
              disabled={loading}
              onPress={handleSignUp}
              style={[
                styles.secondaryButton,
                loading ? styles.buttonDisabled : undefined,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Create Account</Text>
            </Pressable>

            {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8F5F6",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  glowOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  glowOrbPrimary: {
    width: 280,
    height: 280,
    backgroundColor: "#7A0019",
    opacity: 0.14,
    top: -40,
    right: -60,
  },
  glowOrbAccent: {
    width: 220,
    height: 220,
    backgroundColor: "#C88996",
    opacity: 0.2,
    bottom: 40,
    left: -70,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing.l,
    gap: theme.spacing.l,
  },
  heroCard: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(122, 0, 25, 0.18)",
    padding: theme.spacing.l,
    gap: theme.spacing.m,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.s,
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(122, 0, 25, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandEyebrow: {
    color: "#7A0019",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(122, 0, 25, 0.15)",
    padding: theme.spacing.l,
    gap: theme.spacing.m,
  },
  title: {
    color: "#2B141A",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  subtitle: {
    color: "#6F4A54",
    fontSize: 14,
    lineHeight: 20,
  },
  featureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.s,
  },
  featureChip: {
    color: "#7A0019",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(122, 0, 25, 0.25)",
    backgroundColor: "rgba(122, 0, 25, 0.08)",
  },
  formTitle: {
    color: "#2B141A",
    fontSize: 18,
    fontWeight: "700",
  },
  formHint: {
    color: "#6F4A54",
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(122, 0, 25, 0.22)",
    backgroundColor: "#FFF9FB",
    color: "#2B141A",
    borderRadius: theme.radius.m,
    paddingHorizontal: theme.spacing.m,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: "#7A0019",
    borderRadius: theme.radius.m,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "rgba(122, 0, 25, 0.28)",
    borderRadius: theme.radius.m,
    backgroundColor: "#FFF3F6",
    paddingVertical: 13,
    alignItems: "center",
  },
  googleButton: {
    borderWidth: 1,
    borderColor: "rgba(122, 0, 25, 0.24)",
    borderRadius: theme.radius.m,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  googleIcon: {
    marginRight: 8,
  },
  googleButtonText: {
    color: "#7A0019",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryButtonText: {
    color: "#7A0019",
    fontWeight: "700",
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
