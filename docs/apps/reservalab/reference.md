# ReservaLab — Referência

> Tipos, contratos de resposta, variáveis de ambiente e testes.

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
  /** Timestamp (epoch em segundos) do último cache da planilha no servidor */
  cache_info?: { timestamp?: number }
}

interface TransformedReservation {
  /** Chave estável derivada do conteúdo (laboratório + horário + responsável), usada como key do React */
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

## Contrato de `GET /api/reservas`

```json
{
  "lab1_reservas": [],
  "lab2_reservas": [],
  "reservas_semana": [],
  "data": "01 de Julho de 2026",
  "cache_info": { "timestamp": 1688169600 }
}
```

- **Fonte:** planilha Excel no SharePoint, aba "RESERVA LAB. INFORMÁTICA"
- **Cache:** 60 segundos, por workspace
- **`cache_info.timestamp`** alimenta o selo "Atualizado às HH:mm" na interface

A interface usa **polling de 15 segundos** e exibe um banner de erro quando a planilha falha.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SHAREPOINT_URL` | Opcional (legado) | Fallback global quando um campus não tem planilha própria. A via principal é `workspaces.spreadsheet_url` |
| `SPREADSHEET_URL_<SLUG>` | Opcional | Preenche `spreadsheet_url` em lote via `scripts/set_workspace_spreadsheets.py` (por exemplo, `SPREADSHEET_URL_ANHEMBI_MOOCA`); alternativa ao campo da interface |
| `UPSTASH_REDIS_REST_URL` | Não | URL do Redis (push e cache) |
| `UPSTASH_REDIS_REST_TOKEN` | Não | Token do Redis |
| `SUPABASE_URL` | Sim (push de ação) | URL do Supabase (tablets e aprovação) |
| `SUPABASE_SERVICE_KEY` | Sim (push de ação) | Chave de serviço do Supabase |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Obrigatórias (push) | Chaves de Web Push; sem elas o push é desabilitado com aviso, sem derrubar a aplicação |
| `CRON_SECRET` | Sim (crons) | Protege os endpoints `/api/push/check*` |
| `PUSH_ADVANCE_MINUTES` | Não | Janela de aviso antes da reserva (padrão 30) |
| `PUSH_DEDUP_SECONDS` | Não | Janela de deduplicação de push (padrão 7200) |
| `PUSH_TABLET_RETENTION_DAYS` | Não | Retenção de reservas de tablet canceladas (padrão 30) |

Detalhamento completo em [Referência: configuração](../../reference/configuration.md).

## Testes

- **Backend:** `api/tests/test_spreadsheet.py` (parser da planilha e cache por workspace), `api/tests/test_push_cron.py` (proteção dos crons)
- **Frontend:** `src/apps/reservalab/pages/__tests__/` e `src/apps/reservalab/components/__tests__/`

```bash
cd api && python -m pytest tests/ -q
npm run test:run            # vitest
npx tsc -b --noEmit         # typecheck
```

## Relacionados

- [Visão geral](README.md)
- [Arquitetura](architecture.md)
- [Referência do banco](../../reference/database.md)
- [Guia de testes](../../guides/testing.md)
