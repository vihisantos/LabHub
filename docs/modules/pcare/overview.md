# PCare — Module Overview

> Computer inventory and maintenance management.

**Route:** `/pcare`
**Color:** `#06b6d4` (cyan)

## Purpose

PCare manages the complete lifecycle of computers in IT labs — from inventory and specifications to cleaning checklists, parts tracking, and preventive maintenance.

## Key Features

- **PC inventory** — specs, configuration, photos per machine
- **Parts tracking** — link parts to PCs, replacement history
- **Cleaning checklists** — templates and execution tracking
- **Preventive maintenance** — scheduling and completion tracking
- **QR codes** — generate for print, scan for quick access
- **Reports** — CSV, XLSX, PDF export with charts
- **Batch operations** — bulk actions on multiple PCs

## PC Specifications Tracked

- Hardware: CPU, RAM, Storage
- Software: OS type/version/edition, installed software
- Status: cleaning, restoration
- Location: lab, room, asset tag
- History: interventions, parts replaced

## Data Source

- **Primary:** localStorage with Supabase sync (schema: `pcare`)
- **Synced collections:** pcs, parts, part_usage, maintenance, checklist_templates, pc_checklists, action_logs

## Related

- [Architecture: Data Layer](../../architecture/data-layer.md)
