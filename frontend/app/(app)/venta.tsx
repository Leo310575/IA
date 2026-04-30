import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth, apiFetch } from "../../src/auth";
import { COLORS } from "../../src/theme";
import { checkOnline, queueOp, setCache, getCache } from "../../src/sync";

export default function Venta() {
  const { user, token } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // {product, quantity, is_wholesale}
  const [showCart, setShowCart] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [cashReceived, setCashReceived] = useState("");
  const [cardRef, setCardRef] = useState("");
  const [lastSale, setLastSale] = useState(null);
  const [qtyEdit, setQtyEdit] = useState(null); // {idx, value}

  const load = useCallback(async () => {
    const cacheKey = `products_${user?.store_id}`;
    if (!user?.store_id) return;
    const isOnline = await checkOnline();
    if (isOnline && token) {
      try {
        const data = await apiFetch(`/api/products?store_id=${user.store_id}`, {}, token);
        setProducts(data);
        await setCache(cacheKey, data);
        return;
      } catch (_e) {}
    }
    const cached = await getCache(cacheKey);
    if (cached) setProducts(cached);
  }, [user, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.barcode || "").includes(s) ||
        (p.category || "").toLowerCase().includes(s)
    );
  }, [products, search]);

  const total = useMemo(
    () => cart.reduce((s, it) => s + it.subtotal, 0),
    [cart]
  );

  const computeLine = (product, quantity, is_wholesale) => {
    let unit_price = product.price;
    if (is_wholesale && product.wholesale_enabled && product.wholesale_qty > 0) {
      const packs = Math.floor(quantity / product.wholesale_qty);
      const remainder = quantity - packs * product.wholesale_qty;
      const subtotal = packs * product.wholesale_price + remainder * product.price;
      return { unit_price, subtotal };
    }
    return { unit_price, subtotal: unit_price * quantity };
  };

  const addProduct = (product) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id && !c.is_wholesale);
      if (idx >= 0 && product.unit_type === "pieza") {
        const next = [...prev];
        const q = next[idx].quantity + 1;
        const { subtotal, unit_price } = computeLine(product, q, false);
        next[idx] = { ...next[idx], quantity: q, subtotal, unit_price };
        return next;
      }
      const initialQty = product.unit_type === "pieza" ? 1 : 1;
      const { subtotal, unit_price } = computeLine(product, initialQty, false);
      return [...prev, { product, quantity: initialQty, is_wholesale: false, subtotal, unit_price }];
    });
  };

  const updateQty = (idx, qty) => {
    setCart((prev) => {
      const next = [...prev];
      const it = next[idx];
      if (qty <= 0) { next.splice(idx, 1); return next; }
      const { subtotal, unit_price } = computeLine(it.product, qty, it.is_wholesale);
      next[idx] = { ...it, quantity: qty, subtotal, unit_price };
      return next;
    });
  };

  const toggleWholesale = (idx) => {
    setCart((prev) => {
      const next = [...prev];
      const it = next[idx];
      if (!it.product.wholesale_enabled) return prev;
      const newWS = !it.is_wholesale;
      const minQty = newWS ? Math.max(it.quantity, it.product.wholesale_qty) : it.quantity;
      const { subtotal, unit_price } = computeLine(it.product, minQty, newWS);
      next[idx] = { ...it, is_wholesale: newWS, quantity: minQty, subtotal, unit_price };
      return next;
    });
  };

  const handleScan = () => {
    const code = scanInput.trim();
    if (!code) return;
    const found = products.find((p) => p.barcode === code);
    if (found) {
      addProduct(found);
      setShowScanner(false);
      setScanInput("");
    } else {
      Alert.alert(
        "No encontrado",
        `No hay producto con código "${code}". ¿Deseas crearlo?`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Crear producto",
            onPress: () => {
              setShowScanner(false);
              Alert.alert("Crear producto", `Ve a Catálogos > Productos > + Nuevo y captura el código: ${code}`);
            },
          },
        ]
      );
    }
  };

  const finalizeSale = async () => {
    if (cart.length === 0) return;
    const items = cart.map((c) => ({
      product_id: c.product.id,
      name: c.product.name,
      unit_type: c.product.unit_type,
      quantity: c.quantity,
      unit_price: c.unit_price,
      is_wholesale: c.is_wholesale,
      subtotal: c.subtotal,
    }));
    const cash = paymentMethod === "efectivo" ? parseFloat(cashReceived || "0") : null;
    if (paymentMethod === "efectivo" && (cash == null || cash < total)) {
      Alert.alert("Error", "Efectivo recibido es menor al total");
      return;
    }
    if (paymentMethod === "tarjeta" && !cardRef.trim()) {
      Alert.alert("Terminal bancaria", "Ingresa la referencia/folio de la terminal");
      return;
    }
    const payload = {
      company_id: user.company_id,
      store_id: user.store_id,
      items,
      total,
      payment_method: paymentMethod,
      cash_received: cash,
      change: cash != null ? Math.max(0, cash - total) : null,
      card_terminal_ref: paymentMethod === "tarjeta" ? cardRef : null,
      client_id: `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at_local: new Date().toISOString(),
    };

    const isOnline = await checkOnline();
    if (isOnline && token) {
      try {
        await apiFetch("/api/sales", { method: "POST", body: JSON.stringify(payload) }, token);
      } catch (e) {
        await queueOp("sale", payload);
      }
    } else {
      await queueOp("sale", payload);
    }
    setLastSale({ ...payload, change: payload.change });
    setShowPay(false);
    setShowCart(false);
    setShowTicket(true);
  };

  const newSale = () => {
    setCart([]);
    setCashReceived("");
    setCardRef("");
    setLastSale(null);
    setShowTicket(false);
    setPaymentMethod("efectivo");
  };

  const renderProduct = ({ item }) => (
    <TouchableOpacity
      testID={`product-card-${item.id}`}
      style={styles.pCard}
      onPress={() => addProduct(item)}
      activeOpacity={0.8}
    >
      {item.photo ? (
        <Image source={{ uri: item.photo }} style={styles.pImg} />
      ) : (
        <View style={[styles.pImg, { backgroundColor: COLORS.bg3, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="cube-outline" size={28} color={COLORS.textMuted} />
        </View>
      )}
      <Text style={styles.pName} numberOfLines={2}>{item.name}</Text>
      <View style={styles.pBottom}>
        <Text style={styles.pPrice}>${item.price?.toFixed(2)}</Text>
        <Text style={styles.pUnit}>/ {item.unit_type}</Text>
      </View>
      <Text style={[styles.pStock, item.stock <= 5 && { color: COLORS.error }]}>
        Stock: {item.stock} {item.unit_type}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.c} testID="venta-screen">
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            testID="product-search-input"
            accessibilityLabel="venta-search"
            style={styles.searchInput}
            placeholder="Buscar producto o código..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity
          testID="scan-button"
          accessibilityLabel="venta-scan-btn"
          style={styles.scanBtn}
          onPress={() => setShowScanner(true)}
        >
          <Ionicons name="barcode-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderProduct}
        numColumns={2}
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        columnWrapperStyle={{ gap: 12 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={<Text style={styles.empty}>Sin productos</Text>}
      />

      {cart.length > 0 && (
        <TouchableOpacity
          testID="cart-fab"
          accessibilityLabel="cart-checkout"
          style={styles.fab}
          onPress={() => setShowCart(true)}
        >
          <Ionicons name="cart" size={22} color="#fff" />
          <Text style={styles.fabText}>
            {cart.reduce((s, c) => s + (c.product.unit_type === "pieza" ? c.quantity : 1), 0)} •
            ${total.toFixed(2)}
          </Text>
          <Text style={styles.fabCta}>Cobrar</Text>
        </TouchableOpacity>
      )}

      {/* CART MODAL */}
      <Modal visible={showCart} animationType="slide" onRequestClose={() => setShowCart(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} testID="cart-modal">
          <View style={styles.modalHead}>
            <TouchableOpacity onPress={() => setShowCart(false)}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Carrito</Text>
            <TouchableOpacity onPress={() => setCart([])}>
              <Text style={{ color: COLORS.error, fontWeight: "600" }}>Vaciar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {cart.map((it, idx) => (
              <View key={idx} style={styles.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartName}>{it.product.name}</Text>
                  <Text style={styles.cartSub}>
                    ${it.unit_price.toFixed(2)} / {it.product.unit_type}
                    {it.is_wholesale && it.product.wholesale_enabled
                      ? `  •  Mayoreo (${it.product.wholesale_qty}x$${it.product.wholesale_price})`
                      : ""}
                  </Text>
                  {it.product.wholesale_enabled && (
                    <TouchableOpacity onPress={() => toggleWholesale(idx)} style={styles.wsToggle}>
                      <Ionicons
                        name={it.is_wholesale ? "checkbox" : "square-outline"}
                        size={18}
                        color={COLORS.primary}
                      />
                      <Text style={{ color: COLORS.primary, marginLeft: 6, fontWeight: "600" }}>
                        Mayoreo
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.qtyBox}>
                  <TouchableOpacity
                    testID={`qty-minus-${idx}`}
                    onPress={() => updateQty(idx, +(it.quantity - (it.product.unit_type === "pieza" ? 1 : 0.5)).toFixed(3))}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="remove" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setQtyEdit({ idx, value: String(it.quantity) })}>
                    <Text style={styles.qtyVal}>{it.quantity}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`qty-plus-${idx}`}
                    onPress={() => updateQty(idx, +(it.quantity + (it.product.unit_type === "pieza" ? 1 : 0.5)).toFixed(3))}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="add" size={18} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cartSub2}>${it.subtotal.toFixed(2)}</Text>
              </View>
            ))}
            {cart.length === 0 && <Text style={styles.empty}>Carrito vacío</Text>}
          </ScrollView>
          <View style={styles.payBar}>
            <View>
              <Text style={styles.payLabel}>TOTAL</Text>
              <Text style={styles.payTotal}>${total.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              testID="checkout-button"
              style={styles.payBtn}
              disabled={cart.length === 0}
              onPress={() => { setShowCart(false); setShowPay(true); }}
            >
              <Text style={styles.payBtnText}>Cobrar</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* QUANTITY EDIT */}
      <Modal visible={!!qtyEdit} transparent animationType="fade" onRequestClose={() => setQtyEdit(null)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Cantidad</Text>
            <TextInput
              style={styles.dialogInput}
              value={qtyEdit?.value || ""}
              onChangeText={(v) => setQtyEdit({ ...qtyEdit, value: v })}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.dialogBtn} onPress={() => setQtyEdit(null)}>
                <Text style={{ color: COLORS.text, fontWeight: "600" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => {
                  const v = parseFloat(qtyEdit.value);
                  if (!isNaN(v)) updateQty(qtyEdit.idx, v);
                  setQtyEdit(null);
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal visible={showPay} animationType="slide" onRequestClose={() => setShowPay(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} testID="payment-modal">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => setShowPay(false)}>
                <Ionicons name="arrow-back" size={26} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Pago</Text>
              <View style={{ width: 26 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={styles.payLabel}>TOTAL A COBRAR</Text>
              <Text style={[styles.payTotal, { fontSize: 42 }]}>${total.toFixed(2)}</Text>

              <Text style={[styles.payLabel, { marginTop: 24 }]}>MÉTODO</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                {["efectivo", "tarjeta"].map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`pay-method-${m}`}
                    onPress={() => setPaymentMethod(m)}
                    style={[
                      styles.methodBtn,
                      paymentMethod === m && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                    ]}
                  >
                    <Ionicons
                      name={m === "efectivo" ? "cash-outline" : "card-outline"}
                      size={22}
                      color={paymentMethod === m ? "#fff" : COLORS.text}
                    />
                    <Text style={[
                      styles.methodTxt,
                      paymentMethod === m && { color: "#fff" },
                    ]}>
                      {m === "efectivo" ? "Efectivo" : "Tarjeta"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {paymentMethod === "efectivo" && (
                <View style={{ marginTop: 22 }}>
                  <Text style={styles.payLabel}>EFECTIVO RECIBIDO</Text>
                  <TextInput
                    testID="cash-received-input"
                    style={styles.bigInput}
                    value={cashReceived}
                    onChangeText={setCashReceived}
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                  {parseFloat(cashReceived || "0") >= total && (
                    <Text style={{ color: COLORS.success, fontWeight: "700", marginTop: 8 }}>
                      Cambio: ${(parseFloat(cashReceived) - total).toFixed(2)}
                    </Text>
                  )}
                </View>
              )}
              {paymentMethod === "tarjeta" && (
                <View style={{ marginTop: 22 }}>
                  <View style={styles.terminalBox}>
                    <Ionicons name="card" size={22} color={COLORS.primary} />
                    <Text style={styles.terminalText}>
                      Cobra con la terminal bancaria y captura la referencia/folio.
                    </Text>
                  </View>
                  <Text style={styles.payLabel}>FOLIO TERMINAL</Text>
                  <TextInput
                    testID="card-ref-input"
                    style={styles.bigInput}
                    value={cardRef}
                    onChangeText={setCardRef}
                    placeholder="Ej. 0012345"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              )}
            </ScrollView>
            <View style={{ padding: 20 }}>
              <TouchableOpacity
                testID="confirm-payment-button"
                style={styles.payBigBtn}
                onPress={finalizeSale}
              >
                <Text style={styles.payBigText}>Confirmar pago</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* TICKET / PRINTER MODAL */}
      <Modal visible={showTicket} animationType="fade" transparent onRequestClose={() => setShowTicket(false)}>
        <View style={styles.overlay}>
          <View style={[styles.dialog, { width: "85%" }]} testID="ticket-modal">
            <View style={{ alignItems: "center" }}>
              <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
              <Text style={styles.dialogTitle}>Venta exitosa</Text>
            </View>
            <View style={styles.ticketBox}>
              <Text style={styles.ticketHead}>* * TICKET DE VENTA * *</Text>
              <Text style={styles.ticketLine}>{new Date().toLocaleString()}</Text>
              <View style={styles.ticketSep} />
              {(lastSale?.items || []).map((it, i) => (
                <View key={i} style={{ marginBottom: 4 }}>
                  <Text style={styles.ticketLine}>{it.name}</Text>
                  <Text style={styles.ticketLine}>
                    {it.quantity} {it.unit_type} x ${it.unit_price.toFixed(2)} = ${it.subtotal.toFixed(2)}
                  </Text>
                </View>
              ))}
              <View style={styles.ticketSep} />
              <Text style={styles.ticketTotal}>TOTAL: ${(lastSale?.total || 0).toFixed(2)}</Text>
              <Text style={styles.ticketLine}>Pago: {lastSale?.payment_method}</Text>
              {lastSale?.payment_method === "efectivo" && (
                <Text style={styles.ticketLine}>
                  Efectivo: ${(lastSale.cash_received || 0).toFixed(2)} • Cambio: ${(lastSale.change || 0).toFixed(2)}
                </Text>
              )}
              {lastSale?.payment_method === "tarjeta" && (
                <Text style={styles.ticketLine}>Folio: {lastSale.card_terminal_ref}</Text>
              )}
            </View>
            <TouchableOpacity
              testID="print-button"
              style={[styles.dialogBtn, { backgroundColor: COLORS.primary, marginTop: 12 }]}
              onPress={() => Alert.alert("Imprimiendo", "Enviando a impresora Bluetooth... (simulado en preview)")}
            >
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>Imprimir Bluetooth</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="new-sale-button"
              style={[styles.dialogBtn, { marginTop: 8 }]}
              onPress={newSale}
            >
              <Text style={{ color: COLORS.text, fontWeight: "700" }}>Nueva venta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SCANNER (manual entry mock) */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} testID="scanner-modal">
          <View style={styles.modalHead}>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Escanear código</Text>
            <View style={{ width: 26 }} />
          </View>
          <View style={{ padding: 24 }}>
            <View style={styles.scanFrame}>
              <Ionicons name="barcode" size={80} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 12 }}>
                (Cámara disponible en build nativo)
              </Text>
            </View>
            <Text style={styles.payLabel}>O INGRESA EL CÓDIGO MANUALMENTE</Text>
            <TextInput
              testID="scan-manual-input"
              style={styles.bigInput}
              value={scanInput}
              onChangeText={setScanInput}
              placeholder="Ej. 7501055309627"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
              onSubmitEditing={handleScan}
            />
            <TouchableOpacity
              testID="scan-submit"
              style={styles.payBigBtn}
              onPress={handleScan}
            >
              <Text style={styles.payBigText}>Buscar</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg2 },
  header: { flexDirection: "row", padding: 12, gap: 8, backgroundColor: COLORS.bg },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 12, height: 48,
  },
  searchInput: { flex: 1, marginLeft: 8, color: COLORS.text, fontSize: 15 },
  scanBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  pCard: {
    flex: 1, backgroundColor: COLORS.bg, borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pImg: { width: "100%", aspectRatio: 1.1, borderRadius: 10, backgroundColor: COLORS.bg3 },
  pName: { fontSize: 14, fontWeight: "600", color: COLORS.text, marginTop: 8, minHeight: 36 },
  pBottom: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
  pPrice: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  pUnit: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 4 },
  pStock: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  empty: { textAlign: "center", color: COLORS.textMuted, marginTop: 40 },
  fab: {
    position: "absolute", bottom: 16, left: 16, right: 16,
    backgroundColor: COLORS.primary, borderRadius: 14, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 16, flex: 1 },
  fabCta: { color: "#fff", fontWeight: "800", fontSize: 16 },
  modalHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  cartRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: 1, borderColor: COLORS.border,
  },
  cartName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cartSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cartSub2: { fontSize: 14, fontWeight: "700", color: COLORS.text, marginLeft: 12, minWidth: 70, textAlign: "right" },
  wsToggle: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  qtyBox: { flexDirection: "row", alignItems: "center" },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.bg2,
    borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center",
  },
  qtyVal: { minWidth: 40, textAlign: "center", fontSize: 16, fontWeight: "700", color: COLORS.text },
  payBar: {
    flexDirection: "row", padding: 16, borderTopWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "space-between",
  },
  payLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary },
  payTotal: { fontSize: 28, fontWeight: "800", color: COLORS.text },
  payBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 24, height: 56,
    borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8,
  },
  payBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  methodBtn: {
    flex: 1, height: 64, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.bg,
  },
  methodTxt: { color: COLORS.text, fontWeight: "700", fontSize: 15 },
  bigInput: {
    height: 60, fontSize: 22, fontWeight: "700",
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, color: COLORS.text, marginTop: 8,
  },
  terminalBox: {
    flexDirection: "row", padding: 12, backgroundColor: "#EEF2FF",
    borderRadius: 10, gap: 8, alignItems: "center", marginBottom: 12,
  },
  terminalText: { flex: 1, color: COLORS.text, fontSize: 13 },
  payBigBtn: {
    height: 60, backgroundColor: COLORS.primary, borderRadius: 14,
    alignItems: "center", justifyContent: "center", marginTop: 14,
  },
  payBigText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  dialog: { width: "80%", backgroundColor: COLORS.bg, borderRadius: 16, padding: 20 },
  dialogTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginVertical: 8, textAlign: "center" },
  dialogInput: {
    height: 60, fontSize: 24, fontWeight: "700", textAlign: "center",
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, color: COLORS.text, marginVertical: 12,
  },
  dialogBtn: {
    flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", flexDirection: "row",
  },
  ticketBox: {
    backgroundColor: "#FAFAFA", borderRadius: 8, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: "dashed",
  },
  ticketHead: { textAlign: "center", fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  ticketLine: { fontSize: 12, color: COLORS.text, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  ticketSep: { borderBottomWidth: 1, borderColor: COLORS.border, marginVertical: 6, borderStyle: "dashed" },
  ticketTotal: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginTop: 4 },
  scanFrame: {
    height: 200, borderRadius: 14, borderWidth: 2, borderStyle: "dashed",
    borderColor: COLORS.border, alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
});
