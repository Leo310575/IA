import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { COLORS } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const { ready, token } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (token) router.replace("/(app)/dashboard");
    else router.replace("/login");
  }, [ready, token]);

  return (
    <View style={styles.c} testID="splash-screen">
      <ActivityIndicator color={COLORS.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
});
