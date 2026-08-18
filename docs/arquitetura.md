# Arquitetura do LabHub

> Visao tecnica da estrutura do projeto, padroes de design e fluxo de dados.

---

## Estrutura de Diretorios

```
LabHub/
├── api/
│   └── app.py                    # Entry point do backend Flask (Vercel)
├── src/
│   ├── main.tsx                  # Entry point do React
│   ├── App.tsx                   # Router principal (lazy-loaded)
│   ├── appRegistry.ts            # Registro de sub-apps
│   ├── index.css                 # Estilos globais + Tailwind
│   ├── pages/
│   │   ├── Launcher.tsx          # Tela inicial com grid de apps
│   │   └── Roadmap.tsx           # Roadmap publico do projeto
│   ├── apps/
│   │   ├── pcare/                # Sub-app PCare
│   │   ├── stock/                # Sub-app Estoque
│   │   ├── reservalab/           # Sub-app ReservaLab
│   │   └── tv/                   # Sub-app TV (com backend proprio)
│   ├── lib/
│   │   ├── storage.ts            # Camada de persistencia localStorage
│   │   ├── sync.ts               # Engine de sincronizacao (localStorage <-> Supabase)
│   │   ├── supabase.ts           # Cliente Supabase (multi-schema)
│   │   ├── charts.tsx            # Componentes de grafico reutilizaveis
│   │   ├── ThemeContext.tsx       # Context de tema (dark/light) por app
│   │   ├── ToastContext.tsx       # Context de notificacoes toast
│   │   ├── ErrorBoundary.tsx     # Boundary de erros React
│   │   ├── icons.ts              # Icones Lucide customizados
│   │   ├── useLabContext.tsx      # Context de laboratorio ativo
│   │   ├── useKioskMode.tsx      # Hook de modo kiosk/foco
│   │   ├── useMediaQuery.ts      # Hook de media query
│   │   ├── usePushNotifications.ts # Hook de push notifications
│   │   ├── useNavigateWithTransition.ts # Navegacao com View Transitions API
│   │   ├── charts/               # Modulo de graficos
│   │   │   ├── index.ts          # Exportacao do modulo
│   │   │   ├── BarChart.tsx      # Grafico de barras
│   │   │   ├── DonutChart.tsx    # Grafico de rosca
│   │   │   └── ChartCard.tsx     # Container de grafico
│   │   └── components/
│   │       └── ui/               # Componentes Radix UI
│   │           ├── index.ts      # Exportacao dos componentes
│   │           ├── button.tsx
│   │           ├── dialog.tsx
│   │           ├── popover.tsx
│   │           ├── select.tsx
│   │           ├── tabs.tsx
│   │           └── ...           # Demais componentes UI
│   └── test/
│       ├── helpers.tsx           # Helpers para testes
│       ├── mocks.ts              # Mocks para testes
│       └── setup.ts              # Setup dos testes
├── public/                       # Assets estaticos (icons, manifest)
├── dist/                         # Build de producao
└── .github/workflows/ci.yml      # Pipeline de CI/CD
```

---

## Padroes de Arquitetura

### 1. Modulo de Sub-app

Cada sub-app segue a mesma estrutura interna:

```
apps/<nome>/
├── index.tsx           # Rotas da sub-app (React Router)
├── layouts/            # Layouts com navegacao (sidebar, bottom nav)
├── pages/              # Paginas/screens da sub-app
├── components/         # Componentes especificos da sub-app
├── hooks/              # Hooks customizados
├── services/           # Camada de servicos (CRUD, API, sync)
├── types/              # Definicoes TypeScript
├── utils/              # Funcoes utilitarias
└── api/                # (Apenas ReservaLab) Backend Python
```

**Isolamento:** Cada sub-app deve funcionar independentemente. Um workspace pode ter apenas um sub-app habilitado. Sub-apps nao devem importar codigo de outros sub-apps — dependencias devem passar por `core/` ou `lib/`. O modulo Chamados e o primeiro a implementar esse isolamento; demais modulos seguem o mesmo padrao em features futuras.

### Três Camadas de Acesso a Módulos

A disponibilidade de um módulo segue três camadas, nesta ordem:

```
Workspace (disabled_apps)
    ↓  módulo habilitado?
Permissão do usuário (app_access / roles)
    ↓  usuário tem acesso?
Acesso permitido
```

- **Workspace disabled SEMPRE vence.** Um usuário com acesso `full` a um módulo não pode usá-lo se esse módulo estiver desabilitado no workspace.
- **Backend enforcement:** `require_module()` no endpoint `POST /api/chamados` verifica `disabled_apps` antes de criar o ticket.
- **Frontend UX:** `isModuleAvailable()` combina `isAppDisabled()` + `canAccessApp()` para filtrar UI (QuickActions, ModuleStats, CommandPalette). `AppGuard` continua protegendo rotas.
- **Fail-open:** se o workspace não puder ser carregado, o módulo é permitido (não bloqueia fluxo existente).

### 2. Camada de Dados

O sistema de dados opera em 3 niveis:

```
┌─────────────────────────────────────────────┐
│  Supabase (PostgreSQL)                      │
│  Fonte de verdade remota                    │
│  Schema: pcare, stock, public               │
├─────────────────────────────────────────────┤
│  Engine de Sync (sync.ts)                   │
│  Dirty-tracking, merge por timestamp        │
│  Pull-only no primeiro sync                 │
├─────────────────────────────────────────────┤
│  localStorage (storage.ts)                  │
│  Fonte de verdade local                     │
│  Prefixo: labhub_                           │
│  CRUD via createLocalService<T>()           │
└─────────────────────────────────────────────┘
```

**Fluxo de dados:**
1. Operacoes CRUD acontecem no localStorage (instantaneo)
2. A collection e marcada como "dirty" no `sync.ts`
3. Em background, `syncAll()` faz pull dos dados remotos e upsert do que mudou
4. O primeiro sync e pull-only (dados mock nao sobem pro banco)

### Asset Registry (Global)

O Asset Registry (`core/assets/`) e a entidade global de ativos, independente de PCare/Estoque.

```
┌─────────────────────────────────────────────┐
│  public.assets (Supabase)                   │
│  Tabela global com RLS por workspace        │
│  RLS: workspace_id IN profiles.workspace_ids│
├─────────────────────────────────────────────┤
│  global_assets (IndexedDB)                  │
│  Coleção local, sync via defaultDb          │
│  Filtro: workspaceStore.filter()            │
├─────────────────────────────────────────────┤
│  core/assets/global-repository.ts           │
│  CRUD + stats, zero imports de apps/*       │
└─────────────────────────────────────────────┘
```

**Relação com legado:**
- `core/assets/service.ts` (legado) importa `pcService` + `stockService` — será removido na migração futura
- `apps/pcare/services/assetService.ts` continua usando a coleção `assets` (local-only)
- `global_assets` é a coleção nova, com sync remoto e RLS
- Os coexistem pacificamente: coleções diferentes, tipos diferentes, supabase schemas diferentes

**Segurança:**
- RLS no banco: `workspace_id IN (SELECT unnest(workspace_ids) FROM profiles WHERE id = auth.uid())`
- Sync usa client autenticado (JWT do usuário), não service_role
- Pull e push são protegidos automaticamente pelo RLS
- `workspaceStore.filter()` no frontend é segunda barreira (defense in depth)

### 3. Camada de Servicos

Cada servico segue o padrao `createSyncService<T>()`:

```typescript
// Exemplo: pcService.ts
const pcService = createSyncService<PC>('pcs')

// API disponivel:
pcService.getAll()     // PC[]
pcService.getById(id)  // PC | undefined
pcService.create(data) // PC
pcService.update(id, data) // PC | undefined
pcService.remove(id)   // boolean
pcService.query(fn)    // PC[]
```

### 4. Tema e Context

Cada sub-app tem seu proprio `ThemeProvider` isolado:

```tsx
// pcService mantem tema independentemente
<ThemeProvider storageKey="pcare_theme" defaultTheme="dark">
  {/* ... */}
</ThemeProvider>
```

- Tema persistido no localStorage com chave unica por app
- Deteccao automatica do tema do sistema via `prefers-color-scheme`
- Toggle manual que nao afeta outros apps

### 5. Lazy Loading

Todas as sub-apps sao lazy-loaded no `App.tsx`:

```tsx
const PCareApp = lazy(() => import('./apps/pcare').then(m => ({ default: m.PCareApp })))
const StockApp = lazy(() => import('./apps/stock').then(m => ({ default: m.StockApp })))
// ...
```

Isso garante que o bundle inicial seja minimo e cada sub-app so seja baixada quando acessada.

---

## Fluxo de Navegacao

```
Launcher (index)
  ├── /roadmap           → Roadmap publico
  ├── /pcare/*           → PCareApp
  │   ├── /              → Dashboard
  │   ├── /pcs           → Lista de PCs
  │   ├── /pcs/:id       → Detalhe do PC
  │   ├── /parts         → Estoque de pecas
  │   ├── /qr            → Gerador QR
  │   ├── /scanner       → Scanner QR (rota externa)
  │   ├── /checklists    → Templates de checklist
  │   ├── /reports       → Relatorios
  │   ├── /maintenance   → Manutencao
  │   └── /settings      → Configuracoes
  ├── /stock/*           → StockApp
  │   ├── /              → Dashboard
  │   ├── /items         → Itens por secao
  │   ├── /movements     → Historico de movimentacoes
  │   ├── /kits          → Kits
  │   ├── /inventory     → Inventario ciclico
  │   ├── /qr            → Gerador QR
  │   ├── /qr-scan       → Scanner QR
  │   ├── /entry-exit    → Entrada/Saida
  │   └── /maintenance   → Manutencao preventiva
  ├── /reservalab/*      → ReservaLabApp
  │   ├── /              → Reservas
  │   ├── /dashboard     → Dashboard com graficos
  │   └── /tablets       → Reserva de tablets
  └── /tv/*              → TvApp
      ├── /              → Admin (gestao de eventos/playlists)
      └── /display       → Modo display (TV)
```

---

## Conexao Backend (Flask)

O projeto possui dois backends Flask:

### ReservaLab API (`src/apps/reservalab/api/app.py`)
```
Frontend (React)  ─── /api/*  ───→  Flask (Vercel Serverless)
                                      ├── /api/reservas     → Planilha SharePoint
                                      └── /api/health       → Status do servidor
```

### TV API (`src/apps/tv/api/app.py`)
```
Frontend (React)  ─── /api/tv/*  ───→  Flask
                                        ├── /api/tv/youtube/fetch  → YouTube API
                                        └── /api/tv/health         → Status do servidor
```

---

## Infraestrutura de Notificacoes

Push notifications e infraestrutura **global do LabHub**, nao de um sub-app especifico.

```
                    EVENTO
                      │
                      ▼
             NotificationService
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        Toast       In-app       Push
          │           │           │
       imediato    sino       sistema
```

### Service Worker unificado (`src/sw.ts`)

Um unico SW (gerado via `vite-plugin-pwa` com `injectManifest`) gerencia:
- **Precache** de assets (Workbox)
- **Push** — recebe notificacoes do backend e exibe via `showNotification()`
- **Notificationclick** — abre a URL correta ou foca em janela existente

### Push notifications (`/api/push/*`)

Backend global no Flask (`api/app.py` + `src/apps/reservalab/api/app.py`):

```
Frontend (React)  ─── /api/push/*  ───→  Flask (Vercel Serverless)
                                           ├── /api/push/subscribe  → Inscreve dispositivo
                                           ├── /api/push/send       → Envia push segmentado
                                           ├── /api/push/action     → Aprova/rejeita via notificacao
                                           ├── /api/push/check      → Cron: reservas proximas
                                           ├── /api/push/check-overdue → Cron: emprestimos vencidos
                                           ├── /api/push/check-pcare   → Cron: PCare
                                           └── /api/push/check-all     → Cron: todos os checks
```

Segmentacao por: `module`, `workspace_id`, `role`, `userId`, `notify_settings`.

### Sub-apps que usam push

```
Chamados ─────┐
PCare ────────┤
Estoque ──────┼──→ /api/push/* (global)
ReservaLab ───┤
TV ───────────┘
```

---

## Seguranca

- Credenciais Supabase carregadas de variaveis de ambiente (nunca hardcoded)
- Backend Flask com CORS habilitado
- Service Worker unificado (Workbox + push) para cache offline e notificacoes
- Nenhuma autenticacao de usuario implementada (roadmap: Autenticacao Supabase Auth)
