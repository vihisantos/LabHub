# Stock — Module Overview

> Materials and supplies management for IT labs.

**Route:** `/stock` (alias `/general-stock`)
**Color:** `#10b981` (emerald)

## Purpose

The Stock module manages physical materials and supplies — cables, adapters, peripherals, office supplies, and equipment parts. It tracks inventory levels, movements, kits, and cyclic inventory counts.

## Key Features

- **7 material sections** with subcategories
- **Movement tracking** — entry, exit, loan, return, transfer
- **Kit management** — grouped items with checklists
- **Cyclic inventory** — periodic physical counts with divergence tracking
- **Entry/exit flow** — quick stock movements
- **Preventive maintenance** — scheduled maintenance for stock items
- **QR codes** — generate and scan for item lookup

## Material Sections

| Section | Subcategories |
|---------|--------------|
| Machines | Notebook, Desktop, Monitor, Printer |
| Peripherals | Mouse, Keyboard, Webcam, Speaker, Headset |
| Office Supplies | Paper, Pen, Tape, Envelope |
| Adapters | USB-C, HDMI, VGA, Network, Power |
| Equipment | SSD, HD, RAM, PSU |
| Cables | HDMI, VGA, USB, Network, Extension, Power |
| Other | (free-form) |

## Data Source

- **Primary:** localStorage with Supabase sync (schema: `stock`)
- **Synced collections:** stock_items, stock_movements, stock_kits, stock_maintenance, inventory_cycles, inventory_counts

## Related

- [Architecture: Data Layer](../../architecture/data-layer.md)
