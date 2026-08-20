<p align="center">
  <img src="public/logo-192.png" alt="LabHub Logo" width="100" />
</p>

<h1 align="center">LabHub</h1>

<p align="center">
  <strong>Modular PWA for managing IT laboratory operations</strong>
</p>

<p align="center">
  <a href="https://lab-hub-pi.vercel.app">
    <img src="https://img.shields.io/badge/Acessar-Aplicacao-10b981?style=for-the-badge&logo=vercel&logoColor=white" alt="Acessar Aplicacao" />
  </a>
  <img src="https://img.shields.io/github/actions/workflow/status/vihisantos/LabHub/ci.yml?branch=main&style=for-the-badge&label=CI&logo=githubactions&logoColor=white" alt="CI Status" />
  <img src="https://img.shields.io/badge/version-2.1.0-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/license-All%20rights%20reserved-purple?style=for-the-badge" alt="License" />
</p>

---

<p align="center">
  PWA modular para gestão de PCs, estoque, reservas de laboratórios, murais digitais e chamados de suporte em ambientes universitários.
</p>

<br />

## What is LabHub?

LabHub centralizes all IT laboratory operations into a single platform. Built for university campus IT teams, it combines computer inventory, stock control, support tickets, room reservations, and digital signage into a modular, offline-capable system.

## Key Features

- **Support Tickets** — Public form for professors, SLA tracking, real-time updates
- **Computer Inventory** — Specs, parts, checklists, maintenance scheduling
- **Stock Management** — Materials, movements, kits, cyclic inventory
- **Lab Reservations** — Calendar view, tablet loans, push notifications
- **Digital Signage** — Events, videos, music, announcements
- **Offline-first** — Works without internet, syncs when connected
- **Multi-campus** — Workspace isolation with per-campus module control

## Stack

<table>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>React 19 · TypeScript · Vite · Tailwind CSS v4 · Radix UI</td>
  </tr>
  <tr>
    <td><strong>Data</strong></td>
    <td>localStorage (offline-first) · Supabase PostgreSQL · IndexedDB</td>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>Flask (Python) · Vercel Serverless · Upstash Redis</td>
  </tr>
  <tr>
    <td><strong>Realtime</strong></td>
    <td>Supabase Realtime (WebSocket) · Web Push (VAPID)</td>
  </tr>
  <tr>
    <td><strong>Quality</strong></td>
    <td>Vitest · Testing Library · oxlint · GitHub Actions</td>
  </tr>
  <tr>
    <td><strong>Deploy</strong></td>
    <td>Vercel (automatic on push to main)</td>
  </tr>
</table>

## Documentation

Full documentation is in [`docs/`](docs/README.md):

| Section | Description |
|---------|-------------|
| [Concepts](docs/concepts/system-overview.md) | What LabHub is and key domain concepts |
| [Architecture](docs/architecture/system.md) | How the system works internally |
| [Modules](docs/modules/chamados/overview.md) | Per-module documentation |
| [Guides](docs/guides/setup.md) | Development setup and workflows |
| [Reference](docs/reference/api.md) | API, database, and type reference |
| [Decisions](docs/decisions/README.md) | Architecture Decision Records |
| [Operations](docs/operations/deployment.md) | Deployment, monitoring, recovery |

## Quick Start

```bash
# Clone and install
git clone https://github.com/vihisantos/LabHub.git
cd LabHub
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development
npm run dev
```

See the [Setup Guide](docs/guides/setup.md) for full instructions.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Launcher (PWA)                       │
├──────────┬──────────┬──────────┬───────────────────┤
│ Chamados │  PCare   │  Stock   │ ReservaLab │  TV  │
├──────────┴──────────┴──────────┴───────────────────┤
│              localStorage (source of truth)          │
├─────────────────────────────────────────────────────┤
│           Sync Engine (dirty-tracking)               │
├─────────────────────────────────────────────────────┤
│              Supabase (PostgreSQL + RLS)             │
└─────────────────────────────────────────────────────┘
```

## Contributing

See the [Development Guide](docs/guides/development.md) for conventions and the [Adding a Module Guide](docs/guides/adding-module.md) for creating new modules.

## License

Proprietary — All rights reserved. See [LICENSE](LICENSE).

---

<p align="center">
  <sub>Desenvolvido com dedicação para laboratórios de informática universitários.</sub>
</p>
