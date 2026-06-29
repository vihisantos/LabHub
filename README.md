# Lab Hub

> PWA para gerenciamento de inventário de PCs e limpeza/restauração em laboratórios universitários.

[![CI](https://github.com/vihisantos/LabHub/actions/workflows/ci.yml/badge.svg)](https://github.com/vihisantos/LabHub/actions/workflows/ci.yml)
[![Deploy](https://img.shields.io/github/deployments/vihisantos/LabHub/production?label=vercel&logo=vercel&logoColor=white)](https://lab-hub-pi.vercel.app)

**Site:** https://lab-hub-pi.vercel.app · **Repo:** https://github.com/vihisantos/LabHub

## Sub-apps

- **PCare** — Inventário de PCs, vínculo de peças, checklists de limpeza, manutenção agendada, scan QR/barcode, timeline de atividades, relatórios (CSV/XLSX/PDF).
- **Estoque Geral** — Controle de materiais e suprimentos não-PC.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · PWA (vite-plugin-pwa) · Supabase (PostgreSQL) · localStorage (fonte de verdade, sync em background)

## Começando

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
npm run preview
```

## Deploy (Vercel)

O deploy é **automático** a cada push na branch `main` via integração GitHub + Vercel.

### Configurar variáveis de ambiente

No dashboard do Vercel (ou via Vercel CLI), configure as seguintes variáveis:

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon pública do Supabase |

> **Sem essas variáveis**, o app funciona em modo local (localStorage apenas, sem sync remoto).

### Configurar via Vercel CLI

```bash
npx vercel env add VITE_SUPABASE_URL
npx vercel env add VITE_SUPABASE_ANON_KEY
```

### Configurar no GitHub (CI)

Adicione os mesmos valores como **Secrets** no repositório:  
`Settings → Secrets and variables → Actions → New repository secret`

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## CI/CD

| Job | Trigger | O que faz |
|---|---|---|
| `lint` | push/PR na main | Executa `oxlint` |
| `test` | push/PR na main | Executa testes Vitest |
| `build` | após lint + test ok | Build de produção + upload artifact |
| Deploy Vercel | push na main | Deploy automático via integração nativa |

## Status

Pré-release — camada de dados no localStorage, sync Supabase disponível quando configurado.
