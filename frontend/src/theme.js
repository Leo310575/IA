import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorageOrig from "@react-native-async-storage/async-storage";

const AsyncStorage = AsyncStorageOrig || {
  getItem: async () => null,
  setItem: async () => {},
};

export const LIGHT = {
  bg: "#FFFFFF",
  bg2: "#F8FAFC",
  bg3: "#F1F5F9",
  primary: "#4F46E5",
  primaryActive: "#4338CA",
  primarySoft: "#EEF2FF",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  success: "#10B981",
  error: "#EF4444",
  warning: "#F59E0B",
  shadow: "rgba(0,0,0,0.08)",
};

export const DARK = {
  bg: "#0B1220",
  bg2: "#111827",
  bg3: "#1F2937",
  primary: "#6366F1",
  primaryActive: "#818CF8",
  primarySoft: "#1E1B4B",
  text: "#F8FAFC",
  textSecondary: "#CBD5E1",
  textMuted: "#64748B",
  border: "#1F2937",
  success: "#34D399",
  error: "#F87171",
  warning: "#FBBF24",
  shadow: "rgba(0,0,0,0.5)",
};

// Backward compat for any code still importing COLORS directly
export const COLORS = LIGHT;
export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

const ThemeContext = createContext({ mode: "light", colors: LIGHT, toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

const STORE_KEY = "theme_mode";

export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState("light");

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORE_KEY);
        if (v === "dark" || v === "light") setMode(v);
      } catch (_e) {}
    })();
  }, []);

  const toggle = async () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    try { await AsyncStorage.setItem(STORE_KEY, next); } catch (_e) {}
  };

  const colors = mode === "dark" ? DARK : LIGHT;
  return (
    <ThemeContext.Provider value={{ mode, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};
