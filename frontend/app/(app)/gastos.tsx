import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth, apiFetch } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { checkOnline, queueOp } from "../../src/sync";

export default function Gastos() {
  const { user, token } = useAuth();
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [list, setList] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/expenses?store_id=${user.store_id}`, {}, token);
      setList(data || []);
    } catch (_e) {}
  }, [user, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!concept.trim() || !parseFloat(amount)) {
      Alert.alert("Error", "Captura concepto y monto");
      return;
    }
    const payload = {
      company_id: user.company_id,
      store_id: user.store_id,
      concept: concept.trim(),
      amount: parseFloat(amount),
      notes: notes.trim(),
      client_id: `${user.id}-exp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      created_at_local: new Date().toISOString(),
    };
    const isOnline = await checkOnline();
    if (isOnline && token) {
      try {
        await apiFetch("/api/expenses", { method: "POST", body: JSON.stringify(payload) }, token);
      } catch (_e) {
        await queueOp("expense", payload);
      }
    } else {
      await queueOp("expense", payload);
    }
    setConcept(""); setAmount(""); setNotes("");
    Alert.alert("Guardado", "Gasto registrado");
    load();
  };

  const remove = (item) => {
    Alert.alert("Eliminar gasto", `¿Eliminar "${item.concept}" por $${item.amount.toFixed(2)}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await apiFetch(`/api/expenses/${item.id}`, { method: "DELETE" }, token);
            load();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.c} testID="gastos-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.head}>
          <Text style={styles.title}>Gastos</Text>
          <Text style={styles.sub}>Captura los gastos del día</Text>
        </View>
        <View style={styles.formBox}>
          <Text style={styles.lbl}>CONCEPTO</Text>
          <TextInput
            testID="expense-concept"
            accessibilityLabel="gastos-concept"
            style={styles.input}
            value={concept}
            onChangeText={setConcept}
            placeholder="Ej. Compra de bolsas"
            placeholderTextColor={COLORS.textMuted}
          />
          <Text style={[styles.lbl, { marginTop: 12 }]}>MONTO</Text>
          <TextInput
            testID="expense-amount"
            accessibilityLabel="gastos-amount"
            style={[styles.input, { fontSize: 22, fontWeight: "700" }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.lbl, { marginTop: 12 }]}>NOTAS (OPCIONAL)</Text>
          <TextInput
            testID="expense-notes"
            style={[styles.input, { height: 80 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Detalles..."
            placeholderTextColor={COLORS.textMuted}
            multiline
          />
          <TouchableOpacity testID="expense-save" style={styles.btn} onPress={save}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.btnText}>Registrar gasto</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.lbl, { marginHorizontal: 20, marginTop: 6 }]}>RECIENTES</Text>
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <View style={styles.exp}>
              <View style={{ flex: 1 }}>
                <Text style={styles.expName}>{item.concept}</Text>
                <Text style={styles.expDate}>{new Date(item.created_at).toLocaleString()}</Text>
                {!!item.notes && <Text style={styles.expNotes}>{item.notes}</Text>}
              </View>
              <Text style={styles.expAmt}>-${item.amount.toFixed(2)}</Text>
              <TouchableOpacity
                testID={`expense-delete-${item.id}`}
                onPress={() => remove(item)}
                style={styles.expDel}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>Aún no hay gastos</Text>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg2 },
  head: { paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  formBox: {
    margin: 20, padding: 16, backgroundColor: COLORS.bg, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lbl: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary, marginBottom: 6 },
  input: {
    height: 52, backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, color: COLORS.text, fontSize: 15,
  },
  btn: {
    marginTop: 18, height: 52, backgroundColor: COLORS.primary,
    borderRadius: 12, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  exp: {
    flexDirection: "row", padding: 14, backgroundColor: COLORS.bg,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: "center",
  },
  expName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  expDate: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  expNotes: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  expAmt: { fontSize: 16, fontWeight: "800", color: COLORS.error, marginLeft: 12 },
  expDel: { marginLeft: 8, padding: 6, minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 30 },
});
