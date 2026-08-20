# ReservaLab — Module Overview

> Lab and tablet reservation management.

**Route:** `/reservalab`
**Color:** `#6366f1` (indigo)

## Purpose

ReservaLab manages reservations for computer labs and tablets. Lab reservations come from a SharePoint Excel spreadsheet (read-only), while tablet reservations are managed in Supabase.

## Key Features

- **Lab reservations** — calendar view from SharePoint Excel
- **Tablet reservations** — full CRUD in Supabase
- **Dashboard** — occupancy charts and statistics
- **Push notifications** — 15-minute advance reminders
- **Multi-lab support** — configurable per campus (`lab_count`)

## Data Sources

| Data | Source | Access |
|------|--------|--------|
| Lab reservations | SharePoint Excel | Flask API (read-only) |
| Tablet reservations | Supabase `tablet_reservations` | Direct client access |
| Cache | Upstash Redis + file | Flask API |

## Backend

ReservaLab owns the main Flask backend (`src/apps/reservalab/api/app.py`), which also serves:
- All `/api/*` routes for the project
- Push notification infrastructure
- Cron jobs for various checks

## Related

- [Architecture: Backend](../../architecture/backend.md)
