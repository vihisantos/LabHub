# System Overview

> What is LabHub and why does it exist?

LabHub is a modular Progressive Web App (PWA) for managing IT laboratories in university campuses. It centralizes computer inventory, stock control, room reservations, support tickets, and digital signage into a single platform.

## The Problem

University IT labs face fragmented tooling — spreadsheets for reservations, paper checklists for cleaning, separate systems for stock and ticketing. This leads to data silos, manual coordination, and poor visibility.

## What LabHub Does

- **Tracks physical assets** — computers, peripherals, stock items across multiple campuses
- **Manages reservations** — lab scheduling, tablet loans, calendar views
- **Handles support requests** — public ticket creation, SLA tracking, technician assignment
- **Displays information** — digital signage with events, videos, announcements
- **Works offline** — full functionality without internet, syncs when connected

## Architecture Principles

1. **Modular** — Each sub-app is independent with its own routes, services, and theme
2. **Offline-first** — localStorage is the source of truth; Supabase syncs in background
3. **Workspace-scoped** — Data is isolated by campus/workspace
4. **Progressive** — Installable as PWA, works on mobile/tablet/desktop
5. **Multi-tenant** — Users can belong to multiple workspaces

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Data (local) | localStorage with `createLocalService()` |
| Data (remote) | Supabase PostgreSQL with RLS |
| Backend API | Flask (Python) on Vercel Serverless |
| Realtime | Supabase Realtime (WebSocket) |
| Notifications | Web Push (VAPID) via Upstash Redis |
| Quality | Vitest, Testing Library, oxlint |
| Deploy | Vercel (automatic on push to main) |

## Related

- [Architecture](../architecture/system.md) — How the system works internally
- [Workspaces](workspaces.md) — Multi-tenancy model
- [Offline-first](offline-first.md) — Local-first data strategy
