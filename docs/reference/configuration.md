# Configuration Reference

> All configuration files and environment variables.

## Environment Variables

### Frontend (Vite)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_SUPABASE_URL` | No | — | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | No | — | Supabase anonymous key |
| `VITE_APP_VERSION` | No | — | Version string for settings |
| `VITE_RESERVALAB_API_URL` | No | `/api` | Flask API base URL |
| `VITE_VAPID_PUBLIC_KEY` | No | — | Web Push public key |

> Without Supabase variables, the app runs in local-only mode.

### Backend (Flask)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Service role key |
| `UPSTASH_REDIS_REST_URL` | No | Redis URL for push + cache |
| `UPSTASH_REDIS_REST_TOKEN` | No | Redis auth token |
| `VAPID_PUBLIC_KEY` | No | Web Push public key |
| `VAPID_PRIVATE_KEY` | No | Web Push private key |
| `CRON_SECRET` | Yes | Protects cron endpoints |
| `YOUTUBE_API_KEY` | Yes (TV) | YouTube Data API v3 |
| `SHAREPOINT_URL` | No | Legacy fallback spreadsheet URL |

## Configuration Files

### TypeScript

| File | Purpose |
|------|---------|
| `tsconfig.json` | Root config (references) |
| `tsconfig.app.json` | Application code |
| `tsconfig.node.json` | Build tooling |

### Build

| File | Purpose |
|------|---------|
| `vite.config.ts` | Main Vite config |
| `vite.desktop.config.ts` | Desktop (Tauri) config |
| `vercel.json` | Vercel deployment config |

### Quality

| File | Purpose |
|------|---------|
| `.oxlintrc.json` | Oxlint configuration |
| `.github/workflows/ci.yml` | CI pipeline |

### PWA

| File | Purpose |
|------|---------|
| `public/manifest.json` | PWA manifest |
| `src/sw.ts` | Service Worker |

## localStorage Keys

| Key | Content |
|-----|---------|
| `labhub_pcs` | PCare data |
| `labhub_parts` | PC parts |
| `labhub_stock_items` | Stock items |
| `labhub_stock_movements` | Stock movements |
| `labhub_chamados` | Ticket cache |
| `labhub_workspaces` | Workspace data |
| `labhub_dirty_collections` | Pending sync |
| `labhub_deleted_ids` | Tombstones |
| `labhub_sync_log` | Sync history |
| `pcare_theme` | PCare theme |
| `stock_theme` | Stock theme |
| `tv_theme` | TV theme |
| `*_workspace_id` | Active workspace per module |

## Related

- [Guides: Setup](../guides/setup.md)
- [Guides: Deployment](../guides/deployment.md)
