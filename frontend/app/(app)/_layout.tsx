import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { COLORS } from "../../src/theme";

export default function AppLayout() {
  const router = useRouter();
  const { ready, token, user } = useAuth();

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token]);

  const isAdmin = user?.role === "admin";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: { borderTopColor: COLORS.border, height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="venta"
        options={{
          title: "Venta",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "cart" : "cart-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="catalogos"
        options={{
          title: "Catálogos",
          href: isAdmin ? "/(app)/catalogos" : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "albums" : "albums-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gastos"
        options={{
          title: "Gastos",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reportes"
        options={{
          title: "Reportes",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
