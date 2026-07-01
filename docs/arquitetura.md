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
│   │   └── tv/                   # Sub-app TV
│   └── lib/
│       ├── storage.ts            # Camada de persistencia localStorage
│       ├── sync.ts               # Engine de sincronizacao (localStorage <-> Supabase)
│       ├── supabase.ts           # Cliente Supabase (multi-schema)
│       ├── charts.tsx            # Componentes de grafico reutilizaveis
│       ├── ThemeContext.tsx       # Context de tema (dark/light) por app
│       ├── ToastContext.tsx       # Context de notificacoes toast
│       ├── ErrorBoundary.tsx     # Boundary de erros React
│       ├── icons.ts              # Icones Lucide customizados
│       ├── useLabContext.tsx      # Context de laboratorio ativo
│       ├── useKioskMode.tsx      # Hook de modo kiosk/foco
│       ├── useMediaQuery.ts      # Hook de media query
│       ├── usePushNotifications.ts # Hook de push notifications
│       └── useNavigateWithTransition.ts # Navegacao com View Transitions API
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

### 2. Camada de Dados

O sistema de dados opera em 3 niveis:

```
┌─────────────────────────────────────────────┐
│  Supabase (PostgreSQL)                      │
│  Fonte de verdade remota                    │
│  Schema: pcare, stock                       │
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

O backend Python serve apenas o sub-app ReservaLab:

```
Frontend (React)  ─── /api/*  ───→  Flask (Vercel Serverless)
                                      ├── /api/reservas     → Planilha SharePoint
                                      ├── /api/health       → Status do servidor
                                      └── /api/push/*       → Notificacoes push
```

---

## Seguranca

- Credenciais Supabase carregadas de variaveis de ambiente (nunca hardcoded)
- Backend Flask com CORS habilitado
- Service Worker (Workbox) para cache offline
- Nenhuma autenticacao de usuario implementada (roadmap: Autenticacao Supabase Auth)
