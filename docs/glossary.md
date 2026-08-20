# Glossary

> Quick reference for LabHub-specific terms and domain concepts.

---

| Term | Definition |
|------|-----------|
| **Workspace** | A campus or organizational unit that groups users, modules, and data. Each workspace has its own set of enabled modules and spreadsheet URL for ReservaLab. |
| **Module** | An independent sub-application within LabHub (e.g., Chamados, PCare, Stock, TV, ReservaLab). Each module has its own routes, services, and theme. |
| **Sub-app** | Synonym for module. A self-contained application unit within the LabHub monorepo. |
| **Asset** | A physical IT asset (computer, monitor, etc.) tracked in the Global Asset Registry (`public.assets`). Independent of PCare/Stock legacy collections. |
| **Ticket** | A support request or service order created through the Chamados module. Has a sequential `ticketNumber` per workspace. |
| **Ticket Event** | A historical entry in a ticket's timeline (status change, comment, assignment). |
| **Global Asset Registry** | The centralized asset tracking system in `public.assets` with RLS by workspace. Replaces legacy per-module asset tracking. |
| **Offline-first** | Architecture pattern where the app reads/writes to localStorage first and syncs to Supabase in background. The app works fully offline. |
| **Local Cache** | localStorage data managed by `createLocalService()`. Prefix: `labhub_`. Source of truth for the frontend. |
| **Remote Source** | Supabase PostgreSQL tables that the sync engine pushes to and pulls from. |
| **Synchronization** | The process of merging local localStorage data with remote Supabase data. Uses dirty-tracking and merge-by-timestamp. |
| **Dirty-tracking** | Mechanism that marks collections with pending local changes (`labhub_dirty_collections` in localStorage). |
| **Sync Engine** | `src/lib/sync.ts` — orchestrates push/pull for all collections between localStorage and Supabase. |
| **Realtime** | Supabase Realtime (WebSocket) for instant updates without polling. Used in Chamados for status changes. |
| **RLS** | Row Level Security — PostgreSQL policy that restricts which rows a user can access based on their profile's `workspace_ids`. |
| **Service Role** | Supabase admin key (`SUPABASE_SERVICE_KEY`) that bypasses RLS. Used by the Flask API for operations that need full access. |
| **Tenant** | A workspace member. Users can belong to multiple workspaces via `profiles.workspace_ids`. |
| **App Guard** | Frontend component (`AppGuard.tsx`) that checks if a user has access to a module before rendering it. |
| **Module Availability** | Three-layer check: workspace enabled → user permission → access granted. Workspace `disabled_apps` always wins. |
| **SLA** | Service Level Agreement — response/resolution time targets per ticket priority (configured in `sla_configs`). |
| **PWA** | Progressive Web App — installable web application with offline capabilities and push notifications. |
| **IndexedDB** | Browser database used for storing binary data (photos, files) that are too large for localStorage. |
| **Quick Actions** | Command palette (`Ctrl+K`) for fast navigation and actions across modules. |
| **Launcher** | The home screen of LabHub showing all available modules as a grid. |
