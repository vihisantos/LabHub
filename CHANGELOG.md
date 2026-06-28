# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-06-28

### Changed

- Firebase removido; sync engine migrado para Supabase (PostgreSQL)
- Timestamps migrados de Firestore Timestamp para ISO 8601 strings
- Primeiro sync é pull-only (dados mock não sobem para o banco)
- `src/lib/firebase.ts` removido (substituído por `src/lib/supabase.ts`)

## [0.1.0] - 2026-06-28

### Added

- PCare app: PC management with cleaning/restoration tracking, parts inventory, maintenance scheduling, checklists, QR code scanner, asset scanner, reports, and settings
- Stock app: asset tracking by section, movements history, kit conferencing
- Bottom navigation with badges for PCare and Stock apps
- Dark/light theme toggle
- View transitions API for route animations
- CSV/XLSX/PDF export for PCs and parts
- CSV export for stock items and movements
- ConfirmDialog replacing native browser dialogs
- PWA support with offline service worker (Workbox)
- Pull-to-refresh on all list pages
- Skeleton loading states
- Empty states with action prompts
- Error boundaries

### Fixed

- Theme toggle properly alternating `.dark` class on `<html>`
- TypeScript errors in StockForm and GeneralStockLayout
- React Router view transitions support

### Changed

- Stock app restructured with StockBottomNav, simplified header with theme toggle
- Removed legacy `general-stock` app (superseded by new StockApp)
- Removed duplicate `src/apps/pcare/services/firebase.ts` (unused)
- CI pipeline now runs `npm run test:run` and `npm run lint`
- All `window.confirm()` calls replaced with `ConfirmDialog` component

### Security

- Firebase credentials now loaded from environment variables (`.env`)
