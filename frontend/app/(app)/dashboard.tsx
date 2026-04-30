import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "../../src/auth";
import { COLORS } from "../../src/theme";
import { checkOnline, getQueue, syncQueue } from "../../src/sync";

export default function Dashboard() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [summary, setSummary] = useState({ sales_total: 0, sales_count: 0, expenses_total: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    const isOnline = await checkOnline();
    setOnline(isOnline);
    const q = await getQueue();
    setPending(q.length);
    if (isOnline && token && user?.store_id) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const data = await apiFetch(
          `/api/reports/summary?store_id=${user.store_id}&start=${today}`,
          {},
          token
        );
        setSummary(data);
      } catch (_e) {}
    }
  }, [token, user]);

  useEffect(() => {
    loadAll();
    const i = setInterval(loadAll, 15000);
    return () => clearInterval(i);
  }, [loadAll]);

  const onSync = async () => {
    if (!online) {
      Alert.alert("Sin conexión", "Conéctate a internet para sincronizar.");
      return;
    }
    const r = await syncQueue(token);
    if (r.error) Alert.alert("Error", r.error);
    else Alert.alert("Sincronizado", `${r.synced} operación(es) enviadas.`);
    loadAll();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const isAdmin = user?.role === "admin";

  const tiles = [
    { id: "venta", label: "Nueva venta", icon: "cart", color: COLORS.primary, route: "/(app)/venta" },
    { id: "gastos", label: "Capturar gasto", icon: "cash", color: COLORS.warning, route: "/(app)/gastos" },
    { id: "reportes", label: "Reportes", icon: "stats-chart", color: COLORS.success, route: "/(app)/reportes" },
    ...(isAdmin
      ? [{ id: "catalogos", label: "Catálogos", icon: "albums", color: "#0EA5E9", route: "/(app)/catalogos" }]
      : []),
  ];

  return (
    <SafeAreaView style={styles.c} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hi}>Hola,</Text>
            <Text style={styles.name} testID="dashboard-name">{user?.name || "Usuario"}</Text>
            <Text style={styles.role} testID="dashboard-role">
              {user?.role === "admin" ? "Cuenta administrador" : "Cuenta cajero"}
            </Text>
          </View>
          <TouchableOpacity testID="logout-button" accessibilityLabel="logout-btn" onPress={logout} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View
          style={[styles.statusBar, { borderColor: online ? COLORS.success : COLORS.warning }]}
          testID="sync-status-bar"
        >
          <View style={[styles.dot, { backgroundColor: online ? COLORS.success : COLORS.warning }]} />
          <Text style={styles.statusText}>
            {online ? "En línea" : "Sin conexión"}
            {pending > 0 ? `  •  ${pending} pendiente(s)` : ""}
          </Text>
          {pending > 0 && (
            <TouchableOpacity onPress={onSync} testID="sync-button" style={{ marginLeft: "auto" }}>
              <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Sincronizar</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>VENTAS HOY</Text>
            <Text style={styles.statVal} testID="dashboard-sales-today">${(summary.sales_total || 0).toFixed(2)}</Text>
            <Text style={styles.statSub}>{summary.sales_count || 0} transacciones</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>GASTOS HOY</Text>
            <Text style={[styles.statVal, { color: COLORS.error }]}>
              ${(summary.expenses_total || 0).toFixed(2)}
            </Text>
            <Text style={styles.statSub}>Neto: ${((summary.sales_total||0) - (summary.expenses_total||0)).toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>ACCIONES RÁPIDAS</Text>
        <View style={styles.grid}>
          {tiles.map((t) => (
            <TouchableOpacity
              key={t.id}
              testID={`tile-${t.id}`}
              onPress={() => router.push(t.route)}
              style={styles.tile}
              activeOpacity={0.8}
            >
              <View style={[styles.tileIcon, { backgroundColor: t.color }]}>
                <Ionicons name={t.icon} size={26} color="#fff" />
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg2 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hi: { fontSize: 14, color: COLORS.textSecondary },
  name: { fontSize: 26, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  role: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.bg,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border,
  },
  statusBar: {
    flexDirection: "row", alignItems: "center", marginTop: 18,
    backgroundColor: COLORS.bg, padding: 12, borderRadius: 12, borderWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  statusText: { color: COLORS.text, fontWeight: "600", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  statCard: {
    flex: 1, backgroundColor: COLORS.bg, padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary },
  statVal: { fontSize: 22, fontWeight: "800", color: COLORS.text, marginTop: 6 },
  statSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: COLORS.textSecondary,
    letterSpacing: 1, marginTop: 26, marginBottom: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "48%", aspectRatio: 1.4, backgroundColor: COLORS.bg, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: COLORS.border, justifyContent: "space-between",
  },
  tileIcon: {
    width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
  },
  tileLabel: { fontSize: 16, fontWeight: "700", color: COLORS.text },
});
