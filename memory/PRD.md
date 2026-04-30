# POS Pro - Product Requirements Document

## Overview
Mobile POS application for Android/iOS built with React Native Expo + FastAPI + MongoDB.
Spanish-language UI for small/medium retail stores.

## Core Features
1. **Auth** — Email/password login, JWT-based, role-based access (admin / cajero).
2. **Catálogos (Admin only)** — CRUD for Empresas, Tiendas, Productos, Usuarios.
3. **Productos** — Stock, foto, código de barras/QR, unidades (pieza/kg/litro), venta por mayoreo (n piezas a precio especial).
4. **POS / Venta** — Grid de productos, búsqueda por nombre/categoría/código, scan de códigos (entry manual + cámara nativa), carrito con cantidades, mayoreo toggle, pago efectivo o tarjeta (terminal bancaria), cambio automático.
5. **Tickets** — Ticket preview tras cada venta, "Imprimir Bluetooth" (mock en preview, listo para hardware nativo).
6. **Gastos** — Captura de gastos por concepto + monto + notas.
7. **Reportes** — Ventas (efectivo/tarjeta), gastos, utilidad, top productos, valor de inventario, stock bajo. Filtros: hoy, 7d, 30d, todo.
8. **Offline-first / Sync** — Ventas y gastos creados sin conexión se encolan en AsyncStorage; al volver internet se sincronizan automáticamente al backend con dedup por client_id.

## Models (MongoDB)
- companies, stores, products, users, sales, expenses
- All use UUID `id` field (no ObjectId in responses)

## Tech Stack
- Backend: FastAPI + Motor (MongoDB) + bcrypt + PyJWT
- Frontend: Expo Router (file-based), React Native, AsyncStorage
- Auth: Bearer token in Authorization header

## Roles
- `admin`: full access including catálogos
- `cajero`: ventas, gastos, reportes only (catálogos tab hidden)
