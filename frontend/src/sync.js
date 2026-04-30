import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./auth";

// Offline queue: list of pending operations (sales, expenses)
const Q_KEY = "pending_queue_v1";
const CACHE_PREFIX = "cache_";

export const queueOp = async (type, payload) => {
  const raw = await AsyncStorage.getItem(Q_KEY);
  const list = raw ? JSON.parse(raw) : [];
  list.push({ type, payload, ts: Date.now() });
  await AsyncStorage.setItem(Q_KEY, JSON.stringify(list));
};

export const getQueue = async () => {
  const raw = await AsyncStorage.getItem(Q_KEY);
  return raw ? JSON.parse(raw) : [];
};

export const clearQueue = async () => {
  await AsyncStorage.removeItem(Q_KEY);
};

export const setCache = async (key, data) => {
  await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
};

export const getCache = async (key) => {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  return raw ? JSON.parse(raw) : null;
};

export const checkOnline = async () => {
  const API = process.env.EXPO_PUBLIC_BACKEND_URL;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${API}/api/`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch (_e) {
    return false;
  }
};

export const syncQueue = async (token) => {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0 };
  const sales = queue.filter((q) => q.type === "sale").map((q) => q.payload);
  const expenses = queue.filter((q) => q.type === "expense").map((q) => q.payload);
  try {
    await apiFetch(
      "/api/sync",
      { method: "POST", body: JSON.stringify({ sales, expenses }) },
      token
    );
    await clearQueue();
    return { synced: queue.length };
  } catch (e) {
    return { error: e.message, synced: 0 };
  }
};
