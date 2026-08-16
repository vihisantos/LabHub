# ReservaLab — Reserva de Laboratorios

> Sub-app para gestao de reservas de laboratorios de informatica e tablets, com dashboard, calendario semanal e notificacoes push.

**Rota:** `/reservalab`
**Cor:** `#6366f1` (indigo)

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React + Vite + TypeScript (`src/apps/reservalab/`) |
| Backend | Flask (Python) — `src/apps/reservalab/api/app.py`, o **app Flask principal do projeto** (importado pelo entry point `api/app.py` da raiz) |
| Deploy | Vercel (Python Serverless) + GitHub Actions (crons) |

### Fontes de Dados

- **Reservas de laboratorios:** planilha Excel no SharePoint (aba "RESERVA LAB. INFORMATICA") — **por campus**, configurada na UI do workspace (Configurar workspace → Apps do workspace, campo "Link da Planilha"), salva em `workspaces.spreadsheet_url` no Supabase. A **quantidade de labs** do campus e configurada no mesmo lugar (`workspaces.lab_count`, default 2) e determina quantas secoes (LAB01..LAB0N) o app exibe. `SHAREPOINT_URL` e apenas fallback global opcional — **sem banco de dados**
- **Tablets:** Supabase (tabela `tablet_reservations`) — o UNICO uso de banco no modulo
- **Push subscribers:** Upstash Redis

---

## Funcionalidades

### Reservas de Laboratorio
- Visualizacao de reservas do dia e da semana
- Dados integrados via API Flask (planilha SharePoint)
- Labs suportados: LAB01, LAB02
- Status visual: ao vivo, em breve, encerrado
- Calendario semanal com navegacao por dia
- **Polling de 15s** + badge "Atualizado as HH:mm" (via `cache_info.timestamp` da API)
- Banner de erro quando a planilha falha

### Dashboard
- Graficos de ocupacao por laboratorio
- Estatisticas de reservas (total, media diaria, taxa de ocupacao)
- Cards de metricas com trend indicators
- Visao consolidada de todas as reservas

### Reserva de Tablets
- Gestao de tablets emprestados por sala
- Professores, horarios e finalidade
- Status: ativa, cancelada, concluida
- Cadastro com modal e erros inline (sem `alert()`)

### Notificacoes Push
- Notificacoes automaticas 15 minutos antes do inicio da reserva
- Alerta de tablets filtrado por campus: so recebe quem tem acesso ao workspace da reserva (super admin ve todos)
- Suporte a Web Push (VAPID)
- Backend: Upstash Redis para armazenar subscribers
- Endpoint de teste: `/api/push/test`

---

## Rotas (Frontend)

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/reservalab/` | ReservasView | Calendario de reservas |
| `/reservalab/dashboard` | DashboardView | Dashboard com graficos |
| `/reservalab/tablets` | TabletsView | Gestao de tablets |

## Rotas (API Backend)

O ReservaLab e o unico sub-app com backend proprio (Flask/Python). Todas as rotas `/api/*` do projeto moram em `src/apps/reservalab/api/app.py`.

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/api/reservas` | Reservas de hoje e da semana (planilha) + `cache_info` |
| `GET` | `/api/health` | Status do servidor e do cache |
| `POST` | `/api/push/subscribe` | Inscrever para push (com `user`) |
| `GET` | `/api/push/test` | Enviar notificacao de teste |
| `POST` | `/api/push/send` | Enviar push (filtro por modulo, workspace, cargo e usuario) |
| `POST` | `/api/push/action` | Aprovar/rejeitar usuario pela notificacao |
| `GET` | `/api/push/check` | Verificar e enviar push de reservas pendentes |
| `POST` | `/api/push/notify-loan` | Notificar novo emprestimo |
| `POST` | `/api/push/notify-return` | Notificar devolucao |
| `GET` | `/api/push/check-overdue` | Verificar emprestimos com prazo proximo |
| `GET` | `/api/push/check-pcare` | Verificar estoque baixo e manutencoes |
| `GET` | `/api/push/check-all` | Cron agregado: roda todos os checks |

> Endpoints de cron (`/api/push/check*`) sao protegidos por `CRON_SECRET` (header `Authorization: Bearer ${CRON_SECRET}`).

---

## Arquitetura do Backend

```
api/app.py (raiz — entry point Vercel)
└── importa src/apps/reservalab/api/app.py

app.py (Flask)
├── /api/reservas        → get_reservas(workspace_slug) → SharePoint Excel
├── /api/health          → Status do servidor + cache
└── /api/push/*          → Upstash Redis + Web Push (VAPID)
```

O entry point da Vercel (`api/app.py` na raiz) importa o app deste modulo:

```python
# api/app.py (raiz)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'apps', 'reservalab', 'api'))
from app import app, _SUPABASE_URL, _SUPABASE_SERVICE_KEY, _supabase_headers, _target_subs, push_notify, redis
```

### Cache

- **Reservas:** TTL de 60 segundos, **por workspace** — chave `reservas_{slug}` no Redis (Upstash) com fallback em arquivo por chave. Nunca deixe um campus receber o cache de outro (bug historico de cache global).
- **Push:** deduplicacao por MD5 com TTL de 2 horas.

---

## Estrutura de Arquivos (Monorepo)

```
src/apps/reservalab/
├── api/app.py            ← Servidor Flask PRINCIPAL do projeto (todas as rotas /api/*; env vars do .env da raiz)
├── index.tsx             ← Rotas do modulo (Reservas, Dashboard, Tablets)
├── layouts/              ← ReservaLabLayout (forca tema claro + Navbar)
├── pages/                ← Reservas.tsx, Dashboard.tsx, Tablets.tsx
├── components/           ← Cards, modais, calendario semanal, navbar, etc.
├── hooks/                ← useIsMobile
├── services/
│   ├── api.ts            ← fetch /api/reservas (planilha)
│   └── supabase.ts       ← CRUD tablet_reservations (UNICO acesso a banco)
├── types/                ← Tipos compartilhados
└── utils/                ← timeUtils (periodos/horarios), labUtils (nomes de labs)
```

---

## Regras de Arquitetura

1. **Toda rota `/api/` mora em `src/apps/reservalab/api/app.py`** (e o Flask principal do projeto).
2. **Planilha e leitura-only.** Reservas de labs vem da planilha; NUNCA escreva nela. Escrita no banco e exclusiva dos tablets (`tablet_reservations`).
3. **Cache por workspace e OBRIGATORIO.** `get_reservas(workspace_slug)` usa a chave `reservas_{slug}` no Redis (Upstash) com fallback em arquivo — nunca deixe um campus receber o cache de outro.
4. **`load_workbook` com `read_only=True, data_only=True`** — nunca carregue o workbook inteiro em memoria.
5. **Env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`. NUNCA coloque valores fixos no codigo.
6. **Endpoints de cron** sao protegidos por `CRON_SECRET`.
7. **Modulos novos sao funcoes puras** (sem Flask); nunca levante excecao — retorne dict com `error`; use `DateEncoder` para serializar datas.
8. **Frontend:** cada tela busca seus proprios dados; nao centralize fetches. Novos componentes vao em `src/apps/reservalab/components/`.

---

## Componentes

| Componente | Descricao |
|------------|-----------|
| `ReservationCard` | Card de reserva com status visual |
| `ReservationModal` | Modal de detalhes da reserva |
| `WeeklyCalendar` | Calendario semanal com navegacao |
| `StatsCard` | Card de metrica com trend |
| `ChartContainer` | Container para graficos |
| `Navbar` | Navegacao superior |
| `Loader` | Indicador de carregamento |
| `ErrorBoundary` | Boundary de erros |
| `PushNotificationButton` | Botao de inscricao para push |
| `TabletModal` | Modal de cadastro de tablet |
| `TabletReservationCard` | Card de reserva de tablet |
| `TimeInput` | Input de horario |
| `BackgroundAI` | Background decorativo |

---

## Tipos

```typescript
interface LaboratorioReserva {
  horario: string
  responsavel: string
  observacao: string
  reserva_feita_por: string
  alunos: number
  labs: string[]       // ['LAB01', 'LAB02']
  lab: string
  data: string
  horario_inicio?: string
  horario_fim?: string
}

interface TabletReserva {
  id: string   // uuid (Supabase)
  sala: string
  quantidade_tablets: number
  professor: string
  horario_inicio: string
  horario_fim: string
  finalidade: string
  reservado_por: string
  status: string
  workspace_id?: string
}

interface ReservasAPIResponse {
  lab1_reservas: LaboratorioReserva[]
  lab2_reservas: LaboratorioReserva[]
  reservas_semana: LaboratorioReserva[]
  /** Timestamp (epoch segundos) do ultimo cache da planilha no servidor */
  cache_info?: { timestamp?: number }
}

interface TransformedReservation {
  /** Chave estavel derivada do conteudo (lab + horario + responsavel) — usada como key do React */
  id: string
  time: string
  period: string
  subject: string
  professor: string
  reservaFeitaPor: string
  isLive: boolean
  isEmBreve: boolean
  isEnded: boolean
  combined: boolean
  alunos: number
  data?: string
  horario_inicio?: number | null
  horario_fim?: number | null
}
```

---

## Variaveis de Ambiente (Backend)

| Variavel | Obrigatorio | Descricao |
|----------|-------------|-----------|
| `SHAREPOINT_URL` | Opcional (legado) | Fallback global quando um campus nao tem planilha propria; a via principal e `workspaces.spreadsheet_url` configurada na UI do workspace |
| `SPREADSHEET_URL_<SLUG>` | Opcional | Preenche `workspaces.spreadsheet_url` em lote via `scripts/set_workspace_spreadsheets.py` (ex.: `SPREADSHEET_URL_ANHEMBI_MOOCA`); alternativa ao campo da UI |
| `UPSTASH_REDIS_REST_URL` | Nao | URL do Redis (push + cache) |
| `UPSTASH_REDIS_REST_TOKEN` | Nao | Token do Redis |
| `SUPABASE_URL` | Sim (push de acao) | URL do Supabase (tablets + aprovacao) |
| `SUPABASE_SERVICE_KEY` | Sim (push de acao) | Service key do Supabase |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Obrigatorio (push) | Chaves Web Push; sem elas o push e desabilitado (warning, nao derruba o app) |
| `CRON_SECRET` | Sim (crons) | Protege os endpoints `/api/push/check*` |

---

## Testes

- Backend: `api/tests/test_spreadsheet.py` (parser da planilha + cache por workspace), `api/tests/test_push_cron.py` (protecao dos crons)
- Frontend: `src/apps/reservalab/pages/__tests__/` e `src/apps/reservalab/components/__tests__/`

```bash
cd api && python -m pytest tests/ -q
npm run test:run            # vitest
npx tsc -b --noEmit         # typecheck
```

---

## Fluxo de Aprovacao de Cadastro

Quando um novo usuario se cadastra (`signUp`), o backend recebe uma notificacao de aprovacao via push com acoes Aprovar/Recusar. O fluxo completo:

1. **Cadastro** → `authService.signUp` grava o perfil como `pending` e dispara um push para a role `admin` (`POST /api/push/send` com `role: 'admin'`, `actions` e `url: /admin/users?pending=<id>`).
2. **Notificacao push** → no service worker, os botoes `Aprovar`/`Recusar` chamam `POST /api/push/action` diretamente (approve = `PATCH profiles` com `status: active`, reject = `DELETE`).
3. **Clique no corpo da notificacao** → abre `/admin/users?pending=<id>` no frontend.
4. **Deep link** → o `UsersPage` detecta o parametro `?pending=<id>`, localiza o usuario pendente e abre o `ApproveUserModal` pre-preenchido.
5. **Modal de aprovacao** → permite escolher o cargo (`viewer` | `technician` | `admin`) e, opcionalmente, sobrescrever o acesso por aplicativo. Confirma via `adminService.approveUser(userId, { role, app_access })` (`PATCH profiles`).
6. **Notificacoes locais** → ao clicar em uma notificacao do centro de notificacoes, o app navega para `notification.actionUrl` (quando presente) e marca como lida.

**Limitacao Web Push:** os botoes de acao so aparecem em Android Chrome e desktop. No iOS/Safari a notificacao apenas abre a URL definida — o admin chega direto no modal de aprovacao via deep link.

**Observacao:** `/api/push/action` nao possui autenticacao propria (uso escolar); requer `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` configurados no backend, caso contrario responde 503.

---

## Bugs Conhecidos (historico)

- Cache da planilha global cruzava campi → corrigido com chave por workspace (Redis + arquivo).
- `useEffect` com deps vazias usava `workspace` stale → corrigido com deps em `Reservas.tsx`, `Dashboard.tsx` e `Tablets.tsx`.
- `alert()` nas validacoes de tablets → substituido por erro inline.
- Cards usavam o indice do array como key → substituido por chave estavel derivada do conteudo.
- `getByDisplayValue` nao normaliza o matcher (testing-library) → usar regex ou funcao.
