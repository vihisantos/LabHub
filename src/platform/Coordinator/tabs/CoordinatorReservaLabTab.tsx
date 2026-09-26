import { useEffect, useMemo, useState } from 'react'
import { icons } from '../../../lib/icons'
import { fetchReservas } from '../../../apps/reservalab/services/api'
import { fetchTabletReservas } from '../../../apps/reservalab/services/supabase'
import { getLabDisplayName } from '../../../apps/reservalab/utils/labUtils'
import { isoToBrDate } from '../../../apps/reservalab/utils/tvEvent'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import type { Workspace } from '../../../core/workspaces/types'
import type {
  LaboratorioReserva,
  ReservasAPIResponse,
  TabletReserva,
} from '../../../apps/reservalab/types'

const SP_TZ = 'America/Sao_Paulo'

const LABS_ERROR = 'Não foi possível carregar as reservas de laboratório desta unidade.'
const TABLETS_ERROR = 'Não foi possível carregar as reservas de tablets desta unidade.'

/**
 * Chave YYYY-MM-DD de um instante calculada no fuso do negócio
 * (America/Sao_Paulo) — nunca via toISOString(), que desloca o dia na
 * virada (ex.: 20/09 22:30 BRT vira 21/09 em UTC).
 */
function spDateKey(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** Meia-noite LOCAL correspondente a uma chave YYYY-MM-DD (janela bruta de busca). */
function spKeyToLocalMidnight(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

export interface CoordinatorReservaLabTabProps {
  units: CoordinatedUnit[]
  workspaces: Workspace[]
}

interface LabReservaView {
  id: string
  lab: string
  horario: string
  responsavel: string
  observacao: string
  reservaFeitaPor: string
}

interface TabletReservaView {
  id: string
  sala: string
  quantidade: number
  professor: string
  horario: string
  finalidade: string
  reservadoPor: string
}

interface UnitReservasState {
  /** Workspace da unidade (null = fora do contexto — nada é buscado). */
  workspace: Workspace | null
  labs: LabReservaView[] | null
  labsError: string | null
  labsMissingSpreadsheet: boolean
  tablets: TabletReservaView[] | null
  tabletsError: string | null
}

function labViewOf(r: LaboratorioReserva): LabReservaView {
  return {
    // Chave estável derivada do conteúdo (mesmo padrão do app: o id da
    // planilha muda a cada linha; reservation_id quando o backend manda).
    id: r.reservation_id || `${r.lab || 'lab'}|${r.horario}|${r.responsavel}|${r.data || ''}`,
    lab: getLabDisplayName(r.lab || r.labs?.join(' e ') || ''),
    horario: r.horario,
    responsavel: r.responsavel,
    observacao: r.observacao || '',
    reservaFeitaPor: r.reserva_feita_por || '',
  }
}

/**
 * Reservas de laboratório da data selecionada (chave DD/MM/YYYY). Lê o dia
 * (`lab_reservas`, fallback Lab 01/02) E a semana (`reservas_semana`) —
 * datas fora de hoje só existem na semana — com dedupe por
 * reservation_id/chave de conteúdo (o mesmo registro pode vir nas duas).
 */
function collectLabs(res: ReservasAPIResponse | undefined, brKey: string): LabReservaView[] {
  if (!res) return []
  const seen = new Set<string>()
  const out: LabReservaView[] = []
  const push = (r: LaboratorioReserva) => {
    if (r.data !== brKey) return
    const key = r.reservation_id || `${r.lab || 'lab'}|${r.horario}|${r.responsavel}|${r.data || ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(labViewOf(r))
  }
  const map = res.lab_reservas
  if (map && Object.keys(map).length > 0) {
    for (const [, reservas] of Object.entries(map).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true }),
    )) {
      reservas.forEach(push)
    }
  } else {
    ;[...(res.lab1_reservas ?? []), ...(res.lab2_reservas ?? [])].forEach(push)
  }
  ;(res.reservas_semana ?? []).forEach(push)
  return out.sort(
    (a, b) =>
      (a.lab || '').localeCompare(b.lab, undefined, { numeric: true }) ||
      a.horario.localeCompare(b.horario),
  )
}

/**
 * Reservas de tablets do dia selecionado. O serviço devolve uma janela bruta
 * (pré-filtro); o dia exato é resolvido AQUI no fuso do negócio, cobrindo a
 * virada UTC (23:00 BRT de 20/09 continua sendo 20/09).
 */
function collectTablets(rows: TabletReserva[] | undefined, selectedKey: string): TabletReservaView[] {
  const fmt = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { timeZone: SP_TZ, hour: '2-digit', minute: '2-digit' })
  return (rows ?? [])
    .filter((r) => {
      const d = new Date(r.horario_inicio)
      return !Number.isNaN(d.getTime()) && spDateKey(d) === selectedKey
    })
    .map((r) => ({
      id: r.id,
      sala: r.sala,
      quantidade: Number(r.quantidade_tablets) || 0,
      professor: r.professor,
      horario: `${fmt(new Date(r.horario_inicio))} - ${fmt(new Date(r.horario_fim))}`,
      finalidade: r.finalidade || '',
      reservadoPor: r.reservado_por || '',
    }))
}

/**
 * Aba "ReservaLab" da Central (PR E) — visão consolidada em LEITURA.
 *
 * Por unidade do escopo visível (`units` já filtrado por `?unit=` na Central):
 *   - labs: `fetchReservas(workspace.slug)` (planilha do campus, via API
 *     existente — sem parser novo no frontend, sem endpoint novo);
 *   - tablets: `fetchTabletReservas(desde, ate, workspace.id)` (Supabase,
 *     RLS/membership, `status: 'ativa'` — sem RPC/escrita nova).
 * As duas fontes rodam em paralelo por unidade, com falha isolada por fonte.
 *
 * Read-only absoluto: nenhum modal de reserva/TV, nenhum botão de
 * criar/editar/cancelar, nenhum "Gerenciar no ReservaLab". A Central não
 * altera permissões — a checagem de acesso espelha o `AppGuard`
 * (`canAccessApp('reservalab')`): sem acesso → "acesso restrito", sem busca.
 * Data em America/Sao_Paulo (nunca UTC/toISOString).
 */
export function CoordinatorReservaLabTab({ units, workspaces }: CoordinatorReservaLabTabProps) {
  const { canAccessApp } = useAppAccess()
  const [selectedKey, setSelectedKey] = useState(() => spDateKey(new Date()))
  const [loading, setLoading] = useState(true)
  const [byUnit, setByUnit] = useState<Record<string, UnitReservasState>>({})

  const allowed = canAccessApp('reservalab')

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    setLoading(true)

    async function loadUnit(unit: CoordinatedUnit): Promise<UnitReservasState> {
      const workspace = workspaces.find((w) => w.id === unit.unitId) ?? null
      if (!workspace) {
        return {
          workspace: null,
          labs: null,
          labsError: null,
          labsMissingSpreadsheet: false,
          tablets: null,
          tabletsError: null,
        }
      }
      // Janela bruta (pré-filtro do serviço): cobre a virada de fuso; o dia
      // exato é resolvido no fuso do negócio em collectLabs/collectTablets.
      const base = spKeyToLocalMidnight(selectedKey)
      const desde = new Date(base)
      desde.setDate(desde.getDate() - 1)
      const ate = new Date(base)
      ate.setDate(ate.getDate() + 2)

      const [labsSettled, tabletsSettled] = await Promise.allSettled([
        fetchReservas(workspace.slug),
        fetchTabletReservas(desde, ate, workspace.id),
      ])

      return {
        workspace,
        labs:
          labsSettled.status === 'fulfilled'
            ? collectLabs(labsSettled.value, isoToBrDate(selectedKey))
            : null,
        labsError: labsSettled.status === 'rejected' ? LABS_ERROR : null,
        labsMissingSpreadsheet:
          labsSettled.status === 'fulfilled' && labsSettled.value.spreadsheet === 'missing',
        tablets:
          tabletsSettled.status === 'fulfilled'
            ? collectTablets(tabletsSettled.value, selectedKey)
            : null,
        tabletsError: tabletsSettled.status === 'rejected' ? TABLETS_ERROR : null,
      }
    }

    Promise.all(units.map(loadUnit)).then((results) => {
      if (cancelled) return
      const next: Record<string, UnitReservasState> = {}
      units.forEach((u, i) => {
        next[u.unitId] = results[i]
      })
      setByUnit(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [allowed, units, selectedKey, workspaces])

  if (!allowed) {
    return (
      <section data-testid="tab-reservalab" className="rounded-2xl border border-line bg-card p-4">
        <TabHeader />
        <div
          data-testid="reservalab-restricted"
          className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3"
        >
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            acesso restrito
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
            Seu papel não dá acesso de leitura ao ReservaLab. Nada é buscado nem exibido aqui —
            o acesso real continua definido por permissão e pelo app.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section data-testid="tab-reservalab" className="rounded-2xl border border-line bg-card p-4">
      <TabHeader />
      <p className="mt-3 max-w-xl text-[11px] leading-relaxed text-fg-muted">
        A Central não altera permissões e não gerencia reservas: esta aba consolida, em leitura,
        as reservas de laboratórios (planilha) e de tablets (Supabase) das unidades do seu escopo.
        Criar, editar ou cancelar segue acontecendo apenas no ReservaLab de cada unidade.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="reservalab-date" className="text-[11px] font-semibold text-fg-muted">
          Data
        </label>
        <input
          id="reservalab-date"
          type="date"
          data-testid="reservalab-date-input"
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value || spDateKey(new Date()))}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-fg"
        />
      </div>

      {loading ? (
        <div data-testid="reservalab-loading" className="mt-4 flex flex-col gap-2">
          <div className="h-12 animate-pulse rounded-xl bg-input" />
          <div className="h-12 animate-pulse rounded-xl bg-input" />
        </div>
      ) : units.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-surface p-3">
          <p className="text-[11px] text-fg-muted">Nenhuma unidade no seu escopo de coordenação.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {units.map((unit) => (
            <UnitBlock key={unit.unitId} unit={unit} state={byUnit[unit.unitId]} />
          ))}
        </div>
      )}
    </section>
  )
}

function TabHeader() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
        <icons.ui.flaskConical size={16} />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">ReservaLab</h2>
        <p className="text-[10px] text-fg-muted">Visão consolidada — leitura</p>
      </div>
    </div>
  )
}

function UnitBlock({
  unit,
  state,
}: {
  unit: CoordinatedUnit
  state: UnitReservasState | undefined
}) {
  if (!state) return null

  if (!state.workspace) {
    return (
      <div
        data-testid={`reservalab-unit-${unit.unitId}`}
        className="rounded-xl border border-line bg-surface p-3"
      >
        <p className="text-[11px] font-semibold text-fg">{unit.unitName}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
          fora do contexto — nenhuma workspace visível para esta unidade; nada é buscado.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid={`reservalab-unit-${unit.unitId}`}
      className="rounded-xl border border-line bg-surface p-3"
    >
      <p className="text-[11px] font-semibold text-fg">{unit.unitName}</p>
      <div className="mt-2.5 grid gap-3 md:grid-cols-2">
        <LabsBlock state={state} />
        <TabletsBlock state={state} />
      </div>
    </div>
  )
}

function LabsBlock({ state }: { state: UnitReservasState }) {
  const labs = useMemo(() => state.labs ?? [], [state.labs])
  return (
    <div className="rounded-lg border border-line bg-card p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        Laboratórios
      </p>
      {state.labsError ? (
        <p data-testid="reservalab-labs-error" className="mt-2 text-[11px] font-medium text-red-500">
          {state.labsError}
        </p>
      ) : state.labsMissingSpreadsheet ? (
        <p
          data-testid="reservalab-labs-missing"
          className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400"
        >
          Este campus ainda não tem planilha configurada.
        </p>
      ) : labs.length === 0 ? (
        <p data-testid="reservalab-labs-empty" className="mt-2 text-[11px] text-fg-muted">
          Nenhuma reserva de laboratório nesta data.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {labs.map((r) => (
            <div
              key={r.id}
              data-testid="reservalab-lab-card"
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-fg">{r.lab}</span>
                <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-500">
                  {r.horario}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-fg-muted">
                {r.responsavel}
                {r.observacao ? ` · ${r.observacao}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabletsBlock({ state }: { state: UnitReservasState }) {
  const tablets = useMemo(() => state.tablets ?? [], [state.tablets])
  return (
    <div className="rounded-lg border border-line bg-card p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Tablets</p>
      {state.tabletsError ? (
        <p
          data-testid="reservalab-tablets-error"
          className="mt-2 text-[11px] font-medium text-red-500"
        >
          {state.tabletsError}
        </p>
      ) : tablets.length === 0 ? (
        <p data-testid="reservalab-tablets-empty" className="mt-2 text-[11px] text-fg-muted">
          Nenhuma reserva de tablets nesta data.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {tablets.map((r) => (
            <div
              key={r.id}
              data-testid="reservalab-tablet-card"
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-fg">
                  {r.quantidade} tablet{r.quantidade !== 1 ? 's' : ''}
                </span>
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {r.horario}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-fg-muted">
                {r.sala} · {r.professor}
                {r.finalidade ? ` · ${r.finalidade}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
