import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth, apiFetch } from "../../src/auth";
import { COLORS } from "../../src/theme";

const RANGES = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "7 días" },
  { id: "month", label: "30 días" },
  { id: "all", label: "Todo" },
  { id: "custom", label: "Personalizado" },
];

const fmtDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getRange = (id, customStart, customEnd) => {
  const now = new Date();
  const start = new Date(now);
  if (id === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (id === "week") {
    start.setDate(now.getDate() - 7);
  } else if (id === "month") {
    start.setDate(now.getDate() - 30);
  } else if (id === "custom") {
    if (!customStart) return { start: null, end: null };
    const s = new Date(customStart + "T00:00:00");
    const e = customEnd ? new Date(customEnd + "T23:59:59") : null;
    return {
      start: isNaN(s.getTime()) ? null : s.toISOString(),
      end: e && !isNaN(e.getTime()) ? e.toISOString() : null,
    };
  } else {
    return { start: null, end: null };
  }
  return { start: start.toISOString(), end: null };
};

export default function Reportes() {
  const { user, token } = useAuth();
  const [range, setRange] = useState("today");
  const today = new Date();
  const monthAgo = new Date(); monthAgo.setDate(today.getDate() - 30);
  const [customStart, setCustomStart] = useState(fmtDate(monthAgo));
  const [customEnd, setCustomEnd] = useState(fmtDate(today));
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.store_id || !token) return;
    const { start, end } = getRange(range, customStart, customEnd);
    let q = `?store_id=${user.store_id}`;
    if (start) q += `&start=${start}`;
    if (end) q += `&end=${end}`;
    try {
      const d = await apiFetch(`/api/reports/summary${q}`, {}, token);
      setData(d);
    } catch (_e) {}
  }, [range, user, token, customStart, customEnd]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    if (range !== "custom") load();
  }, [range]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const applyCustom = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
      Alert.alert("Formato inválido", "Usa el formato YYYY-MM-DD (ej. 2026-01-15)");
      return;
    }
    if (new Date(customStart) > new Date(customEnd)) {
      Alert.alert("Rango inválido", "La fecha inicial debe ser menor o igual a la final");
      return;
    }
    load();
  };

  return (
    <SafeAreaView style={styles.c} testID="reportes-screen">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>Reportes</Text>
        <Text style={styles.sub}>Ventas, inventario y gastos</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18 }}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r.id}
              testID={`range-${r.id}`}
              accessibilityLabel={`rep-filter-${r.id === "today" ? "hoy" : r.id === "week" ? "7d" : r.id === "month" ? "30d" : "todo"}`}
              onPress={() => setRange(r.id)}
              style={[styles.chip, range === r.id && styles.chipActive]}
            >
              <Text style={[styles.chipTxt, range === r.id && { color: "#fff" }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {range === "custom" && (
          <View style={styles.customBox} testID="custom-range-box">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>DESDE</Text>
                <TextInput
                  testID="custom-start-input"
                  style={styles.dateInput}
                  value={customStart}
                  onChangeText={setCustomStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                  // @ts-ignore web only - renders native HTML date picker on web
                  type={Platform.OS === "web" ? "date" : undefined}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>HASTA</Text>
                <TextInput
                  testID="custom-end-input"
                  style={styles.dateInput}
                  value={customEnd}
                  onChangeText={setCustomEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                  // @ts-ignore
                  type={Platform.OS === "web" ? "date" : undefined}
                />
              </View>
            </View>
            <TouchableOpacity testID="custom-apply" style={styles.applyBtn} onPress={applyCustom}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.applyTxt}>Aplicar rango</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bigCard}>
          <Text style={styles.bigLabel}>VENTAS</Text>
          <Text style={styles.bigVal} testID="report-sales-total">
            ${(data?.sales_total || 0).toFixed(2)}
          </Text>
          <View style={styles.row2}>
            <View>
              <Text style={styles.tiny}>Efectivo</Text>
              <Text style={styles.med}>${(data?.cash_total || 0).toFixed(2)}</Text>
            </View>
            <View>
              <Text style={styles.tiny}>Tarjeta</Text>
              <Text style={styles.med}>${(data?.card_total || 0).toFixed(2)}</Text>
            </View>
            <View>
              <Text style={styles.tiny}>Trans.</Text>
              <Text style={styles.med}>{data?.sales_count || 0}</Text>
            </View>
          </View>
        </View>

        <View style={styles.row3}>
          <View style={[styles.smCard, { borderLeftColor: COLORS.error }]}>
            <Text style={styles.smLabel}>GASTOS</Text>
            <Text style={[styles.smVal, { color: COLORS.error }]}>
              ${(data?.expenses_total || 0).toFixed(2)}
            </Text>
            <Text style={styles.tiny}>{data?.expenses_count || 0} registros</Text>
          </View>
          <View style={[styles.smCard, { borderLeftColor: COLORS.success }]}>
            <Text style={styles.smLabel}>UTILIDAD</Text>
            <Text style={[styles.smVal, { color: COLORS.success }]}>
              ${(data?.net || 0).toFixed(2)}
            </Text>
            <Text style={styles.tiny}>Ventas - Gastos</Text>
          </View>
        </View>

        <Text style={styles.sectTitle}>TOP PRODUCTOS</Text>
        <View style={styles.listCard}>
          {(data?.top_products || []).map((p, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={styles.lineRank}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{p.name}</Text>
                <Text style={styles.lineSub}>Vendidos: {p.qty}</Text>
              </View>
              <Text style={styles.lineAmt}>${p.total.toFixed(2)}</Text>
            </View>
          ))}
          {(!data?.top_products || data.top_products.length === 0) && (
            <Text style={styles.empty}>Sin ventas</Text>
          )}
        </View>

        <Text style={styles.sectTitle}>INVENTARIO</Text>
        <View style={styles.bigCard}>
          <Text style={styles.bigLabel}>VALOR DE INVENTARIO</Text>
          <Text style={styles.bigVal}>${(data?.inventory_value || 0).toFixed(2)}</Text>
          <View style={[styles.row2, { marginTop: 4 }]}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
              <Text style={[styles.tiny, { marginLeft: 6 }]}>
                {data?.low_stock_count || 0} con stock bajo
              </Text>
            </View>
          </View>
          {(data?.low_stock || []).map((p) => (
            <View key={p.id} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{p.name}</Text>
              </View>
              <Text style={[styles.lineAmt, { color: COLORS.error }]}>
                {p.stock} {p.unit_type}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectTitle}>INVENTARIO COMPLETO ({data?.inventory_count || 0})</Text>
        <View style={styles.listCard}>
          {(data?.inventory || []).map((p) => {
            const stock = Number(p.stock || 0);
            const lowFlag = stock <= 5;
            const outFlag = stock <= 0;
            return (
              <View key={p.id} style={styles.lineRow} testID={`inv-row-${p.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{p.name}</Text>
                  <Text style={styles.lineSub}>
                    {p.category || "General"} • ${Number(p.price || 0).toFixed(2)} / {p.unit_type}
                    {p.barcode ? `  •  ${p.barcode}` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.lineAmt, outFlag ? { color: COLORS.error } : lowFlag ? { color: COLORS.warning } : null]}>
                    {stock} {p.unit_type}
                  </Text>
                  <Text style={styles.tiny}>
                    Valor: ${(stock * Number(p.cost || 0)).toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          })}
          {(!data?.inventory || data.inventory.length === 0) && (
            <Text style={styles.empty}>Sin productos</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg2 },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTxt: { color: COLORS.text, fontWeight: "600", fontSize: 13 },
  bigCard: {
    marginTop: 18, padding: 18, backgroundColor: COLORS.bg, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bigLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary },
  bigVal: { fontSize: 32, fontWeight: "800", color: COLORS.text, marginTop: 4 },
  row2: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  tiny: { fontSize: 11, color: COLORS.textMuted },
  med: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginTop: 2 },
  row3: { flexDirection: "row", gap: 12, marginTop: 12 },
  smCard: {
    flex: 1, padding: 14, backgroundColor: COLORS.bg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4,
  },
  smLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary },
  smVal: { fontSize: 22, fontWeight: "800", marginTop: 4 },
  sectTitle: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 1, marginTop: 22, marginBottom: 8 },
  listCard: {
    backgroundColor: COLORS.bg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  lineRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: COLORS.border },
  lineRank: { width: 24, fontSize: 14, fontWeight: "800", color: COLORS.primary },
  lineName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  lineSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  lineAmt: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  empty: { textAlign: "center", color: COLORS.textMuted, padding: 16 },
  customBox: {
    marginTop: 12, padding: 14, backgroundColor: COLORS.bg, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lbl: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary, marginBottom: 6 },
  dateInput: {
    height: 48, backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, color: COLORS.text, fontSize: 15,
  },
  applyBtn: {
    marginTop: 12, height: 48, borderRadius: 10, backgroundColor: COLORS.primary,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  applyTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
