# Setup Guide

> How to set up the LabHub development environment.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Python** 3.10+ (for Flask API)
- **Git**
- **npm** (package manager)

## 1. Clone and Install

```bash
git clone https://github.com/vihisantos/LabHub.git
cd LabHub
npm install
```

## 2. Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

### Required (for full functionality)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

### Optional

| Variable | Description |
|----------|-------------|
| `VITE_RESERVALAB_API_URL` | Flask API URL (default: relative `/api`) |
| `VITE_VAPID_PUBLIC_KEY` | Web Push public key |
| `VITE_APP_VERSION` | Version string shown in settings |

> **Without Supabase variables**, the app runs in local-only mode (localStorage only, no sync).

## 3. Start Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## 4. Backend (Optional)

For Chamados and push notifications:

```bash
pip install -r requirements.txt
cd api && python -m pytest tests/ -q
```

The Flask API runs as Vercel Serverless in production. For local development, you can run it separately.

## 5. Verify

- Open `http://localhost:5173`
- You should see the Launcher with available modules
- Navigate to any module to verify it loads

## IDE Setup

### VS Code Extensions (recommended)
- Tailwind CSS IntelliSense
- ESLint
- Prettier
- GitLens

### TypeScript
The project uses `tsconfig.app.json` for app code and `tsconfig.node.json` for build config.

## Related

- [Development Guide](development.md)
- [Testing Guide](testing.md)
