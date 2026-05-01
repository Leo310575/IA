import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert,
  ScrollView, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth, apiFetch } from "../../src/auth";
import { COLORS } from "../../src/theme";

const TABS = [
  { id: "products", label: "Productos", icon: "cube" },
  { id: "companies", label: "Empresas", icon: "business" },
  { id: "stores", label: "Tiendas", icon: "storefront" },
  { id: "users", label: "Usuarios", icon: "people" },
];

export default function Catalogos() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState("products");
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stores, setStores] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const endpoint = {
    products: "/api/products",
    companies: "/api/companies",
    stores: "/api/stores",
    users: "/api/users",
  }[tab];

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(endpoint, {}, token);
      setItems(data || []);
      if (tab === "products" || tab === "users" || tab === "stores") {
        const c = await apiFetch("/api/companies", {}, token);
        setCompanies(c || []);
      }
      if (tab === "products" || tab === "users") {
        const s = await apiFetch("/api/stores", {}, token);
        setStores(s || []);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [endpoint, tab, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [tab]);

  const openNew = () => {
    setEditing(null);
    if (tab === "products")
      setForm({
        company_id: user.company_id, store_id: user.store_id, name: "", barcode: "",
        price: "", cost: "", stock: "", unit_type: "pieza", category: "General",
        wholesale_enabled: false, wholesale_qty: "", wholesale_price: "", photo: "",
      });
    else if (tab === "companies") setForm({ name: "", rfc: "", address: "", phone: "" });
    else if (tab === "stores") setForm({ company_id: user.company_id, name: "", address: "", phone: "" });
    else if (tab === "users")
      setForm({
        email: "", password: "", name: "", role: "cajero",
        company_id: user.company_id, store_id: user.store_id,
      });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...item, password: "" });
    setShowForm(true);
  };

  const save = async () => {
    try {
      const payload = { ...form };
      if (tab === "products") {
        payload.price = parseFloat(payload.price) || 0;
        payload.cost = parseFloat(payload.cost) || 0;
        payload.stock = parseFloat(payload.stock) || 0;
        payload.wholesale_qty = parseFloat(payload.wholesale_qty) || 0;
        payload.wholesale_price = parseFloat(payload.wholesale_price) || 0;
      }
      if (editing) {
        await apiFetch(`${endpoint}/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
      } else {
        await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) }, token);
      }
      setShowForm(false);
      load();
    } catch (e) { Alert.alert("Error", e.message); }
  };

  const remove = (item) => {
    Alert.alert("Confirmar", "¿Eliminar este registro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive", onPress: async () => {
          try {
            await apiFetch(`${endpoint}/${item.id}`, { method: "DELETE" }, token);
            load();
          } catch (e) { Alert.alert("Error", e.message); }
        },
      },
    ]);
  };

  const renderRow = (item) => {
    let title = item.name || item.email;
    let sub = "";
    if (tab === "products") sub = `$${item.price?.toFixed?.(2)} • Stock: ${item.stock} ${item.unit_type}${item.barcode ? ` • ${item.barcode}` : ""}`;
    else if (tab === "companies") sub = item.rfc || item.address || "";
    else if (tab === "stores") sub = item.address || "";
    else if (tab === "users") sub = `${item.role} • ${item.email}`;

    return (
      <TouchableOpacity
        testID={`row-${tab}-${item.id}`}
        onPress={() => openEdit(item)}
        style={styles.row}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
        </View>
        <TouchableOpacity onPress={() => remove(item)} style={styles.delBtn}>
          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.c} testID="catalogos-screen">
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            testID={`tab-${t.id}`}
            accessibilityLabel={`cat-tab-${t.id === "products" ? "productos" : t.id === "companies" ? "empresas" : t.id === "stores" ? "tiendas" : "usuarios"}`}
            onPress={() => setTab(t.id)}
            style={[styles.tab, tab === t.id && styles.tabActive]}
          >
            <Ionicons name={t.icon} size={18} color={tab === t.id ? "#fff" : COLORS.text} />
            <Text style={[styles.tabLbl, tab === t.id && { color: "#fff" }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => renderRow(item)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Text style={styles.empty}>Sin registros</Text>}
      />

      <TouchableOpacity testID="add-button" style={styles.fab} onPress={openNew}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHead}>
              <TouchableOpacity
                testID="modal-close-button"
                onPress={() => setShowForm(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={26} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editing ? "Editar" : "Nuevo"} {TABS.find((t) => t.id === tab)?.label.slice(0, -1)}
              </Text>
              <TouchableOpacity testID="save-button" onPress={save} style={styles.modalCloseBtn}>
                <Text style={{ color: COLORS.primary, fontWeight: "700", fontSize: 16 }}>Guardar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {tab === "products" && (
                <>
                  <Field label="Nombre" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                  <Field label="Código de barras / QR" value={form.barcode} onChangeText={(v) => setForm({ ...form, barcode: v })} />
                  <Field label="Precio" value={String(form.price ?? "")} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="decimal-pad" />
                  <Field label="Costo" value={String(form.cost ?? "")} onChangeText={(v) => setForm({ ...form, cost: v })} keyboardType="decimal-pad" />
                  <Field label="Stock" value={String(form.stock ?? "")} onChangeText={(v) => setForm({ ...form, stock: v })} keyboardType="decimal-pad" />
                  <Field label="Categoría" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} />
                  <Text style={styles.lbl}>UNIDAD</Text>
                  <View style={styles.choiceRow}>
                    {["pieza", "kg", "litro"].map((u) => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => setForm({ ...form, unit_type: u })}
                        style={[styles.choice, form.unit_type === u && styles.choiceActive]}
                      >
                        <Text style={[styles.choiceTxt, form.unit_type === u && { color: "#fff" }]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[styles.row2, { marginTop: 16 }]}>
                    <Text style={[styles.lbl, { flex: 1, marginTop: 0 }]}>VENTA POR MAYOREO</Text>
                    <Switch
                      testID="wholesale-switch"
                      value={!!form.wholesale_enabled}
                      onValueChange={(v) => setForm({ ...form, wholesale_enabled: v })}
                    />
                  </View>
                  {form.wholesale_enabled && (
                    <>
                      <Field label="Cantidad mayoreo (p.ej. 10)" value={String(form.wholesale_qty ?? "")} onChangeText={(v) => setForm({ ...form, wholesale_qty: v })} keyboardType="decimal-pad" />
                      <Field label="Precio mayoreo total" value={String(form.wholesale_price ?? "")} onChangeText={(v) => setForm({ ...form, wholesale_price: v })} keyboardType="decimal-pad" />
                    </>
                  )}
                  <Field label="URL de foto (opcional)" value={form.photo} onChangeText={(v) => setForm({ ...form, photo: v })} />
                </>
              )}
              {tab === "companies" && (
                <>
                  <Field label="Nombre / Razón social" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                  <Field label="RFC" value={form.rfc} onChangeText={(v) => setForm({ ...form, rfc: v })} />
                  <Field label="Dirección" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} />
                  <Field label="Teléfono" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
                </>
              )}
              {tab === "stores" && (
                <>
                  <Picker label="Empresa" value={form.company_id} options={companies} onChange={(v) => setForm({ ...form, company_id: v })} />
                  <Field label="Nombre" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                  <Field label="Dirección" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} />
                  <Field label="Teléfono" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
                </>
              )}
              {tab === "users" && (
                <>
                  <Field label="Nombre" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                  <Field label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
                  <Field label={editing ? "Nueva contraseña (opcional)" : "Contraseña"} value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry />
                  <Text style={styles.lbl}>ROL</Text>
                  <View style={styles.choiceRow}>
                    {["admin", "cajero"].map((r) => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setForm({ ...form, role: r })}
                        style={[styles.choice, form.role === r && styles.choiceActive]}
                      >
                        <Text style={[styles.choiceTxt, form.role === r && { color: "#fff" }]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Picker label="Empresa" value={form.company_id} options={companies} onChange={(v) => setForm({ ...form, company_id: v })} />
                  <Picker label="Tienda" value={form.store_id} options={stores} onChange={(v) => setForm({ ...form, store_id: v })} />
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const Field = ({ label, ...props }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={styles.lbl}>{label.toUpperCase()}</Text>
    <TextInput
      style={styles.input}
      placeholderTextColor={COLORS.textMuted}
      {...props}
    />
  </View>
);

const Picker = ({ label, value, options, onChange }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={styles.lbl}>{label.toUpperCase()}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.id}
          onPress={() => onChange(o.id)}
          style={[styles.choice, value === o.id && styles.choiceActive, { marginRight: 8 }]}
        >
          <Text style={[styles.choiceTxt, value === o.id && { color: "#fff" }]}>{o.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg2 },
  tabs: { flexDirection: "row", padding: 12, gap: 8, backgroundColor: COLORS.bg, borderBottomWidth: 1, borderColor: COLORS.border },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabLbl: { color: COLORS.text, fontWeight: "600", fontSize: 13 },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.bg, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rowTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  delBtn: { padding: 8 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 60 },
  fab: {
    position: "absolute", right: 20, bottom: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
  },
  modalHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  modalCloseBtn: { padding: 8, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  lbl: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary, marginTop: 8, marginBottom: 6 },
  input: {
    height: 52, backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, color: COLORS.text, fontSize: 15,
  },
  choiceRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  choice: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  choiceActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  choiceTxt: { color: COLORS.text, fontWeight: "600", fontSize: 13 },
  row2: { flexDirection: "row", alignItems: "center" },
});
