# LabHub — Documentacao do Projeto

> PWA modular para gestao de laboratorios de informatica em ambientes universitarios.

**Versao:** 1.0.0  
**Status:** Pre-release  
**Stack Principal:** React 19, TypeScript, Vite, Tailwind CSS v4, Supabase, Flask (Python)

---

## Sumario

- [Visao Geral](#visao-geral)
- [Arquitetura](arquitetura.md)
- [Sub-apps](#sub-apps)
  - [PCare](pcare.md) — Gestao de PCs, limpeza e manutencao
  - [Estoque](stock.md) — Controle de materiais e suprimentos
  - [ReservaLab](reservalab.md) — Reserva de laboratorios e tablets
  - [TV](tv.md) — Canal corporativo e murais digitais
- [API Backend](api.md)
- [Variaveis de Ambiente](#variaveis-de-ambiente)
- [Deploy](#deploy)
- [CI/CD](#cicd)
- [Roadmap](#roadmap)

---

## Visao Geral

O **LabHub** e uma plataforma web progressiva (PWA) desenvolvida para gerenciar todas as operacoes de laboratorios de informatica em um campus universitario. Ele centraliza o inventario de computadores, controle de estoque, reservas de salas e comunicacao visual em uma unica interface modular.

### Principios de Design

- **Modularidade**: Cada sub-app e um modulo independente com seu proprio layout, rotas, servicos e contexto de tema.
- **Offline-first**: Dados sao persistidos localmente (localStorage) e sincronizados com Supabase em background. O app funciona 100% offline.
- **Progressive Web App**: Pode ser instalado na tela inicial, funciona sem conexao e suporta notificacoes push.
- **Multi-lab**: Suporte a multiplos laboratorios com troca rapida entre eles.
- **Dark/Light**: Temas independentes por sub-app, com deteccao automatica do tema do sistema.

### Stack Tecnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, TypeScript 6, Vite 8 |
| Estilo | Tailwind CSS v4, Radix UI |
| Animacoes | Framer Motion |
| Graficos | Recharts |
| Dados Locais | localStorage (via `createLocalService`) |
| Sync Remoto | Supabase (PostgreSQL) |
| Backend API | Flask (Python) — Vercel Serverless (ReservaLab + TV) |
| Build | Vite, oxlint |
| Testes | Vitest, Testing Library |
| CI/CD | GitHub Actions + Vercel |
| PWA | vite-plugin-pwa, Workbox |
| Exportacao | jsPDF, xlsx, file-saver |

---

## Sub-apps

O LabHub e composto por 4 sub-apps, cada uma acessivel a partir do Launcher principal:

| App | Descricao | Cor |
|-----|-----------|-----|
| **[PCare](pcare.md)** | Gestao de PCs, limpeza, manutencao, checklists, QR codes, relatorios | `#06b6d4` |
| **[Estoque](stock.md)** | Controle de materiais, movimentacoes, kits, inventario ciclico | `#10b981` |
| **[ReservaLab](reservalab.md)** | Reserva de laboratorios, tablets, dashboard com graficos | `#6366f1` |
| **[TV](tv.md)** | Canal corporativo, murais digitais, playlists de video/musica | `#ef4444` |

---

## Variaveis de Ambiente

### Frontend

| Variavel | Obrigatorio | Descricao |
|----------|-------------|-----------|
| `VITE_SUPABASE_URL` | Nao | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Nao | Chave anon publica do Supabase |
| `VITE_APP_VERSION` | Nao | Versao do app (exibida nas Configuracoes) |
| `VITE_RESERVALAB_API_URL` | Nao | URL base da API Flask do ReservaLab |
| `VITE_VAPID_PUBLIC_KEY` | Nao | Chave publica VAPID para Web Push |

> **Sem as variaveis do Supabase**, o app funciona em modo local (localStorage apenas, sem sync remoto).

### Backend Flask (ReservaLab)

| Variavel | Obrigatorio | Descricao |
|----------|-------------|-----------|
| `SHAREPOINT_URL` | Sim | URL da planilha de reservas (com `?download=1`) |
| `UPSTASH_REDIS_REST_URL` | Nao | URL do Upstash Redis (push notifications) |
| `UPSTASH_REDIS_REST_TOKEN` | Nao | Token do Upstash Redis |
| `SUPABASE_URL` | Nao | URL do Supabase (para tablets) |
| `SUPABASE_SERVICE_KEY` | Nao | Service key do Supabase |

---

## Deploy

O deploy e **automatico** a cada push na branch `main` via integracao GitHub + Vercel.

- **Frontend**: Build estatico servido pela Vercel
- **Backend**: Flask rodando como Python Serverless na Vercel
- **Rotas**: `/api/*` vai para o Flask, todo o resto vai para o SPA React

---

## CI/CD

| Job | Trigger | O que faz |
|-----|---------|-----------|
| `lint` | push/PR na main | Executa `oxlint` |
| `test` | push/PR na main | Executa testes Vitest |
| `build` | apos lint + test ok | Build de producao + upload artifact |
| Deploy Vercel | push na main | Deploy automatico via integracao nativa |

---

## Roadmap

O roadmap publico esta disponivel em `/roadmap` dentro do app. Ha 75 features mapeadas, com progresso visivel por categoria de impacto.

---

## Licenca

MIT License — Capybara Holding
