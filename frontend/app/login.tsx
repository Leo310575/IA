import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const [email, setEmail] = useState("admin@pos.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Ingresa email y contraseña");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(app)/dashboard");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.c} testID="login-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.inner}>
          <View style={styles.logoWrap}>
            <View style={styles.logo}>
              <Ionicons name="storefront" size={36} color="#fff" />
            </View>
            <Text style={styles.brand}>Lite Pos</Text>
            <Text style={styles.sub}>Punto de Venta · Technovasolutions.mx</Text>
          </View>

          <View style={{ marginTop: 32 }}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="login-email-input"
              accessibilityLabel="login-email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="tucorreo@empresa.com"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.label, { marginTop: 16 }]}>CONTRASEÑA</Text>
            <TextInput
              testID="login-password-input"
              accessibilityLabel="login-password"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
            />

            <TouchableOpacity
              testID="login-submit-button"
              accessibilityLabel="login-submit"
              style={[styles.btn, loading && { opacity: 0.6 }]}
              onPress={onSubmit}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Ingresando..." : "Iniciar sesión"}
              </Text>
            </TouchableOpacity>

            <View style={styles.demoBox}>
              <Text style={styles.demoTitle}>Cuentas demo</Text>
              <Text style={styles.demoText}>Admin: admin@pos.com / admin123</Text>
              <Text style={styles.demoText}>Cajero: cajero@pos.com / cajero123</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flex: 1, padding: 24, justifyContent: "center" },
  logoWrap: { alignItems: "center" },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 28, fontWeight: "800", color: COLORS.text, marginTop: 14, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    height: 56,
    backgroundColor: COLORS.bg2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: COLORS.text,
    fontSize: 16,
  },
  btn: {
    marginTop: 24,
    height: 56,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  demoBox: {
    marginTop: 28,
    padding: 14,
    backgroundColor: COLORS.bg2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  demoTitle: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 4, letterSpacing: 1 },
  demoText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
});
