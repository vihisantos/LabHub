# TV — Module Overview

> Digital signage and corporate channel.

**Route:** `/tv`
**Color:** `#ef4444` (red)

## Purpose

The TV module powers digital signage displays in IT labs — showing events, videos, music, and announcements. It has two modes: admin (content management) and display (full-screen playback).

## Key Features

- **Events management** — create, edit, activate campus events
- **Video playlists** — YouTube integration with metadata fetch
- **Music queues** — background audio for displays
- **Announcements** — scrolling text announcements
- **Urgent alerts** — severity-based emergency messages
- **Photo galleries** — image carousels
- **Device management** — activation codes for TV devices

## Display Mode

Full-screen presentation with:
- Event carousel with transitions
- YouTube video player
- Music player with volume control
- Background audio
- Optimized for TV resolutions

## Data Source

- **Direct Supabase access** (no local sync)
- Tables: tv_events, tv_playlists, tv_music_*, tv_announcements, tv_galleries, etc.
- YouTube API for video metadata

## Per-Workspace Settings (workspace_app_settings)

The TV app registers `settings` + `SettingsPanel` in the app registry. Admins
configure it per workspace via **Workspace → Apps → TV → Gerenciar → Configurar**
(`TvSettingsPanel`). Settings are read/written directly by the frontend through
Supabase RLS (`workspace_app_settings`, migration 031) — there is **no Flask CRUD
for settings**.

Structure (`app_id = 'tv'`): `eventSource` (enabled/type/url/sheetName),
`period` (semester/endDate), `display` (refreshIntervalSeconds, weatherCities,
tickerLabel), `syncedAt`. Validation is strict and lives in
`src/apps/tv/settings/definition.ts`; defaults are safe (source disabled,
refresh 300s). No campus-specific values are hardcoded as global defaults.

## External Event Source — Excel/SharePoint (Phase 1)

**Phase 1 strategy: anonymous SharePoint/OneDrive share link** (`?download=1`
when applicable). Microsoft credentials never live in the frontend; a future
Graph/app-only flow for private files would be a separate, additive phase.

Flow ("Testar fonte agora"):

```
Admin UI (TvSettingsPanel)
  → POST /api/tv/source/fetch   (Bearer JWT; workspace_id only selects WHICH
                                 membership is validated — never an authority)
  → @require_auth @require_workspace @require_module('tv')
  → server reads workspace_app_settings for g.workspace_id (service key)
  → SSRF validation (see below) → server-side download → openpyxl parse
  → normalization + deterministic externalId (sha256 of title|date|end|location)
  → preview response { ok, freshness, events[], validCount, ignoredCount, syncedAt }
```

Nothing is persisted to `tv_events` in this phase — no automatic import.
Future distinction: manual events vs external events with idempotent import
(uses `externalId`).

### SSRF protection (server-side, defense in depth)

Implemented in `api/app.py` (`_tv_validate_source_url` / `_tv_fetch_source_bytes`),
reusing ReservaLab's audited `_is_safe_url` plus extra layers required by TV:

1. HTTPS only; URL length cap (2048); scheme allow-list.
2. `_is_safe_url`: blocks localhost/127.0.0.1/::1/.local, literal private,
   loopback, link-local (incl. 169.254.169.254), reserved and multicast IPs.
3. DNS resolution: **every** resolved address must be public (blocks hostname→private-IP rebinding).
4. Manual redirect handling (max 3 hops): each hop re-validated end-to-end.
5. Timeouts: connect 10s / read 30s; streamed download capped at 8 MB.

### Cache

Pattern reused from ReservaLab (Redis first, file fallback). Key is
`tv_source_{workspace_id}_{hash(eventSource)}` — always workspace-scoped, and
changing any source setting naturally rotates the key (invalidation). TTL =
clamped `refreshIntervalSeconds` (60–3600s; user cannot configure unbounded
TTL). Within TTL responses come from cache without touching the network;
on fetch failure the last valid result is served with `freshness: "stale"`
so the UI can say "Não foi possível atualizar. Exibindo última sincronização válida."

## Related

- [Architecture: Backend](../../architecture/backend.md)
