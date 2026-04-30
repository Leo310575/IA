import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorageOrig from "@react-native-async-storage/async-storage";

// Safe wrapper - some environments may not have AsyncStorage native module
const AsyncStorage = AsyncStorageOrig || {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem("token");
        const u = await AsyncStorage.getItem("user");
        if (t) setToken(t);
        if (u) setUser(JSON.parse(u));
      } catch (_e) {}
      setReady(true);
    })();
  }, []);

  const login = async (email, password) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Error de inicio de sesión");
    }
    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    try {
      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("user", JSON.stringify(data.user));
    } catch (_e) {}
    return data.user;
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    try {
      await AsyncStorage.removeItem("token");
      await AsyncStorage.removeItem("user");
    } catch (_e) {}
  };

  return (
    <AuthContext.Provider value={{ token, user, ready, login, logout, API }}>
      {children}
    </AuthContext.Provider>
  );
};

export const apiFetch = async (path, options = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Error ${res.status}`);
  }
  return res.json();
};
