# ReservaLab — Reserva de Laboratorios

> Sub-app para gestao de reservas de laboratorios de informatica e tablets, com dashboard, calendario semanal e notificacoes push.

**Rota:** `/reservalab`  
**Cor:** `#6366f1` (indigo)

---

## Funcionalidades

### Reservas de Laboratorio
- Visualizacao de reservas do dia e da semana
- Dados integrados via API Flask (planilha SharePoint)
- Labs suportados: LAB01, LAB02
- Status visual: ao vivo, em breve, encerrado
- Calendario semanal com navegacao por dia

### Dashboard
- Graficos de ocupacao por laboratorio
- Estatisticas de reservas (total, media diaria, taxa de ocupacao)
- Cards de metricas com trend indicators
- Visao consolidada de todas as reservas

### Reserva de Tablets
- Gestao de tablets emprestados por sala
- Professores, horarios e finalidade
- Status: ativa, cancelada, concluida
- Cadastro com modal

### Notificacoes Push
- Notificacoes automaticas 15 minutos antes do inicio da reserva
- Suporte a Web Push (VAPID)
- Backend: Upstash Redis para armazenar subscribers
- Endpoint de teste: `/api/push/test`

### API Backend

O ReservaLab e o unico sub-app com backend proprio (Flask/Python).

**Endpoints:**

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/api/reservas` | Reservas de hoje e da semana |
| `GET` | `/api/health` | Status do servidor e cache |
| `POST` | `/api/push/subscribe` | Inscrever para push |
| `GET` | `/api/push/test` | Enviar notificacao de teste |
| `GET` | `/api/push/check` | Verificar e enviar push de reservas pendentes |
| `GET` | `/api/push/check-overdue` | Verificar emprestimos com prazo proximo |
| `GET` | `/api/push/check-pcare` | Verificar estoque baixo e manutencoes |
| `POST` | `/api/push/notify-loan` | Notificar novo emprestimo |
| `POST` | `/api/push/notify-return` | Notificar devolucao |

**Fontes de Dados:**
- **Reservas**: Planilha Excel no SharePoint (aba "RESERVA LAB. INFORMÁTICA")
- **Tablets**: Supabase (tabela `tablet_reservations`)
- **Push Subscribers**: Upstash Redis

**Cache:**
- Reservas: TTL de 60 segundos
- Push: Deduplicacao por MD5 com TTL de 2 horas

---

## Rotas

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/reservalab/` | ReservasView | Calendario de reservas |
| `/reservalab/dashboard` | DashboardView | Dashboard com graficos |
| `/reservalab/tablets` | TabletsView | Gestao de tablets |

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
  id: number
  sala: string
  quantidade_tablets: number
  professor: string
  horario_inicio: string
  horario_fim: string
  finalidade: string
  reservado_por: string
  status: string
}

interface WeekDayData {
  date: string
  dayName: string
  reservations: Array<{
    tipo?: string
    lab: string
    time: string
    subject: string
    professor: string
    reservaFeitaPor: string
    observacao: string
  }>
}
```

---

## Variaveis de Ambiente (Backend)

| Variavel | Obrigatorio | Descricao |
|----------|-------------|-----------|
| `SHAREPOINT_URL` | Sim | URL da planilha de reservas |
| `UPSTASH_REDIS_REST_URL` | Nao | URL do Redis (push) |
| `UPSTASH_REDIS_REST_TOKEN` | Nao | Token do Redis |
| `SUPABASE_URL` | Nao | URL do Supabase (tablets) |
| `SUPABASE_SERVICE_KEY` | Nao | Service key do Supabase |

---

## Arquitetura do Backend

```
app.py (Flask)
├── /api/reservas        → get_reservas() → SharePoint Excel
├── /api/health          → Status do servidor
└── /api/push/*          → Upstash Redis + Web Push (VAPID)
```

**Regras criticas:**
1. Todas as rotas `/api/` ficam no `app.py`
2. Modulos novos sao funcoes puras (sem Flask)
3. Nunca levante excecao — sempre retorne dict com `error`
4. Use `DateEncoder` para serializar datas
5. Cache em arquivo com TTL
