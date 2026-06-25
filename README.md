# Lab Hub

> Personal PWA for PC cleaning/restoration inventory management across university labs.

[![CI](https://github.com/vihisantos/LabHub/actions/workflows/ci.yml/badge.svg)](https://github.com/vihisantos/LabHub/actions/workflows/ci.yml)
[![Vercel](https://img.shields.io/badge/deploy-vercel-000?logo=vercel)](https://lab-hub-pi.vercel.app)

**Site:** https://lab-hub-pi.vercel.app · **Repo:** https://github.com/vihisantos/LabHub

## Sub-apps

- **PCare** — PC inventory, parts vinculação, cleaning checklists, scheduled maintenance, QR/barcode scanning, activity timeline, reports (CSV/XLSX/PDF).
- **Estoque Geral** — General stock control for non-PC materials and supplies.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · PWA (vite-plugin-pwa) · Firebase (Firestore + Storage + Auth) · localStorage (until Firebase configured)

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Status

Pre-release — data layer on localStorage, Firebase integration pending.
