import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import type { AppModule } from '../../../appRegistry'
import type { Workspace } from '../../../core/workspaces/types'
import { BACKUP_TTL_DAYS } from '../../../core/workspaces/backupService'
import { icons } from '../../../lib/icons'
import { defaultDb } from '../../../lib/supabase'
import { tvApi } from '../../../apps/tv/utils/apiBase'

/**
 * Purge de dados de conteúdo de um app (hoje: TV Corporativa).
 *
 * Fluxo (PR 5): contagens reais server-side (describe) → confirmação forte
 * ("LIMPAR") → purge com backup obrigatório → resumo do resultado.
 * Nenhum número é inventado no cliente; nenhuma ordem destrutiva sai antes
 * do servidor validar identidade, workspace e permissão.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; tables: Record<string, number>; total: number }
  | { kind: 'empty' }
  | { kind: 'confirming'; tables: Record<string, number>; total: number }
  | { kind: 'deleting' }
  | {
      kind: 'success'
      result: {
        backupId: string | null
        backupExpiresAt: string | null
        deleted: Record<string, number>
        totalDeleted: number
      }
    }
  | { kind: 'error'; message: string }

interface DescribeResponse {
  ok?: boolean
  tables?: Record<string, number>
  total?: number
  error?: string
}

interface PurgeResponse {
  ok?: boolean
  empty?: boolean
  backupId?: string | null
  backupExpiresAt?: string | null
  deleted?: Record<string, number>
  totalDeleted?: number
  error?: string
}

/** Ordem fixa de exibição (mesmas tabelas do escopo do purge server-side). */
const TABLE_ORDER = [
  'tv_events',
  'tv_playlists',
  'tv_announcements',
  'tv_galleries',
  'tv_gallery_photos',
  'tv_music_queues',
  'tv_music_tracks',
  'tv_urgent_announcements',
  'tv_calendar_cache',
] as const

const TABLE_LABELS: Record<string, string> = {
  tv_events: 'Eventos',
  tv_playlists: 'Playlists',
  tv_announcements: 'Avisos',
  tv_galleries: 'Galerias',
  tv_gallery_photos: 'Fotos',
  tv_music_queues: 'Filas de música',
  tv_music_tracks: 'Faixas de música',
  tv_urgent_announcements: 'Avisos urgentes',
  tv_calendar_cache: 'Cache do calendário',
}

const CONFIRM_PHRASE = 'LIMPAR'

export const APP_DATA_ENDPOINTS = {
  describe: '/api/admin/app-data/describe',
  purge: '/api/admin/app-data/purge',
}

async function authedPost(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!defaultDb) throw new Error('Supabase não configurado')
  const { data } = await defaultDb.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão ausente — faça login novamente')
  const res = await fetch(tvApi(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, body: json }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function shortBackupId(id: string | null): string {
  if (!id) return '—'
  return id.length > 8 ? id.slice(0, 8) : id
}

interface AppDataResetModalProps {
  app: AppModule | null
  workspace: Workspace | null
  open: boolean
  onClose: () => void
}

export function AppDataResetModal({ app, workspace, open, onClose }: AppDataResetModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [confirmText, setConfirmText] = useState('')
  const [purgeError, setPurgeError] = useState('')
  // Guard síncrono (ref): bloqueia duplo submit e fechamento durante o purge
  // mesmo entre cliques no mesmo tick, sem depender do timing de re-render.
  const busyRef = useRef(false)

  // Contagens reais sempre que o modal abre.
  useEffect(() => {
    if (!open || !workspace) return
    let alive = true
    setPhase({ kind: 'loading' })
    setPurgeError('')
    setConfirmText('')
    authedPost(APP_DATA_ENDPOINTS.describe, {
      appId: app?.id,
      workspace_id: workspace.id,
    })
      .then(({ body }) => {
        if (!alive) return
        const data = body as DescribeResponse
        const tables = data.tables ?? {}
        const total = Number(data.total ?? 0)
        if (data.ok && total > 0) setPhase({ kind: 'ready', tables, total })
        else if (data.ok) setPhase({ kind: 'empty' })
        else throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao carregar contagens')
      })
      .catch((err: unknown) => {
        if (!alive) return
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Não foi possível carregar os dados',
        })
      })
    return () => {
      alive = false
    }
  }, [open, workspace, app?.id])

  // Enquanto o modal estiver aberto ele captura o Escape antes do BottomSheet:
  // durante o purge NADA fecha; nos demais estados fecha apenas este modal.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      if (!busyRef.current) onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  const handleBackdropClick = useCallback(() => {
    if (!busyRef.current) onClose()
  }, [onClose])

  const startConfirmation = useCallback(() => {
    setPhase((prev) =>
      prev.kind === 'ready' ? { kind: 'confirming', tables: prev.tables, total: prev.total } : prev,
    )
  }, [])

  const runPurge = useCallback(async () => {
    if (!workspace || !app || busyRef.current) return
    busyRef.current = true
    setPhase({ kind: 'deleting' })
    setPurgeError('')
    try {
      const { body } = await authedPost(APP_DATA_ENDPOINTS.purge, {
        appId: app.id,
        workspace_id: workspace.id,
      })
      const data = body as PurgeResponse
      if (!data.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Não foi possível concluir a limpeza',
        )
      }
      setPhase({
        kind: 'success',
        result: {
          backupId: typeof data.backupId === 'string' ? data.backupId : null,
          backupExpiresAt: typeof data.backupExpiresAt === 'string' ? data.backupExpiresAt : null,
          deleted: (data.deleted ?? {}) as Record<string, number>,
          totalDeleted: Number(data.totalDeleted ?? 0),
        },
      })
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Erro inesperado na limpeza',
      })
    } finally {
      busyRef.current = false
    }
  }, [workspace, app])

  const rows = useMemo(() => {
    const tables = phase.kind === 'ready' || phase.kind === 'confirming' ? phase.tables : {}
    return TABLE_ORDER.filter((t) => t in tables).map((t) => ({
      table: t,
      label: TABLE_LABELS[t] ?? t,
      count: tables[t] ?? 0,
    }))
  }, [phase])

  const successRows = useMemo(() => {
    if (phase.kind !== 'success') return []
    return TABLE_ORDER.filter((t) => t in phase.result.deleted).map((t) => ({
      label: TABLE_LABELS[t] ?? t,
      count: phase.result.deleted[t] ?? 0,
    }))
  }, [phase])

  const canConfirm =
    phase.kind === 'confirming' && confirmText.trim().toUpperCase() === CONFIRM_PHRASE

  const appName = app?.name ?? 'TV Corporativa'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          data-testid="app-data-reset-overlay"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-data-reset-title"
            className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="app-data-reset-dialog"
          >
            {phase.kind !== 'deleting' && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.close size={14} />
              </button>
            )}

            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                <icons.ui.trash size={18} />
              </div>
              <div className="min-w-0">
                <h2 id="app-data-reset-title" className="text-lg font-bold text-fg">
                  Limpar dados de {appName}?
                </h2>
                <p className="text-xs text-fg-muted">
                  Esta ação remove os dados de conteúdo da TV deste workspace.
                </p>
                {workspace && (
                  <p className="mt-0.5 truncate text-[11px] text-fg-dim">
                    Workspace: <span className="font-medium">{workspace.name}</span>
                  </p>
                )}
              </div>
            </div>

            {phase.kind === 'loading' && (
              <div className="space-y-2 py-2" aria-busy="true" data-testid="reset-loading">
                <div className="h-9 animate-pulse rounded-xl bg-input" />
                <div className="h-9 animate-pulse rounded-xl bg-input" />
                <div className="h-9 w-2/3 animate-pulse rounded-xl bg-input" />
              </div>
            )}

            {(phase.kind === 'ready' || phase.kind === 'confirming') && (
              <>
                <ul
                  className="mb-4 divide-y divide-line rounded-xl border border-line bg-surface px-4 py-1 text-xs text-fg-muted"
                  data-testid="reset-tables-list"
                >
                  {rows.map((row) => (
                    <li key={row.table} className="flex items-center justify-between py-1.5">
                      <span>{row.label}</span>
                      <span className="font-semibold text-fg" data-testid={`count-${row.table}`}>
                        {row.count}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between py-1.5 text-fg">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold" data-testid="reset-total">
                      {phase.total}
                    </span>
                  </li>
                </ul>

                <div className="mb-4 space-y-1.5 rounded-xl border border-line bg-surface p-3 text-[11px] text-fg-muted">
                  <p>Configurações da TV não serão apagadas.</p>
                  <p>Dispositivos/kiosks não serão removidos.</p>
                  <p>Solicitações de música não serão removidas.</p>
                  <p className="flex items-start gap-1.5">
                    <icons.ui.shield size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                    Um backup será criado antes da exclusão e mantido por{' '}
                    <span className="font-semibold text-fg">{BACKUP_TTL_DAYS} dias</span>.
                  </p>
                  <p>Não será possível recuperar os dados após a expiração do backup.</p>
                </div>

                {phase.kind === 'ready' ? (
                  <button
                    type="button"
                    onClick={startConfirmation}
                    data-testid="reset-start-button"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/20"
                  >
                    <icons.ui.alertTriangle size={14} />
                    Quero limpar os dados
                  </button>
                ) : (
                  <div data-testid="reset-confirm-section">
                    <label htmlFor="reset-confirm-input" className="mb-1.5 block text-xs font-semibold text-fg-muted">
                      Digite <span className="font-bold text-red-500">{CONFIRM_PHRASE}</span> para confirmar
                    </label>
                    <input
                      id="reset-confirm-input"
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={CONFIRM_PHRASE}
                      data-testid="reset-confirm-input"
                      className="mb-4 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                    />
                  </div>
                )}
              </>
            )}

            {phase.kind === 'empty' && (
              <div
                className="rounded-xl border border-line bg-surface p-4 text-xs text-fg-muted"
                data-testid="reset-empty-state"
              >
                Não há dados de conteúdo para limpar.
              </div>
            )}

            {phase.kind === 'success' && (
              <div data-testid="reset-success">
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300">
                  <icons.ui.shield size={14} className="shrink-0" />
                  <span className="font-medium">Dados da TV limpos com sucesso.</span>
                </div>
                <ul className="mb-4 space-y-1 rounded-xl border border-line bg-surface p-4 text-xs text-fg-muted">
                  <li className="flex justify-between">
                    <span>Total removido</span>
                    <span className="font-bold text-fg" data-testid="reset-success-total">
                      {phase.result.totalDeleted}
                    </span>
                  </li>
                  {successRows.map((row) => (
                    <li key={row.label} className="flex justify-between">
                      <span>{row.label}</span>
                      <span className="font-semibold text-fg">{row.count}</span>
                    </li>
                  ))}
                  <li className="flex justify-between border-t border-line pt-1">
                    <span>Backup criado</span>
                    <span className="font-mono text-fg" data-testid="reset-backup-id">
                      {shortBackupId(phase.result.backupId)}
                    </span>
                  </li>
                  {phase.result.backupExpiresAt && (
                    <li className="flex justify-between">
                      <span>Backup expira em</span>
                      <span className="text-fg">{formatDate(phase.result.backupExpiresAt)}</span>
                    </li>
                  )}
                </ul>
                <p className="mb-4 text-[11px] text-fg-dim">
                  O backup é retenção de segurança por {BACKUP_TTL_DAYS} dias; a restauração ainda
                  não está disponível pela interface.
                </p>
              </div>
            )}

            {phase.kind === 'error' && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-400"
                data-testid="reset-error"
              >
                {phase.message}
              </div>
            )}

            {purgeError && (
              <p role="alert" className="mb-3 text-xs text-red-500">
                {purgeError}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              {phase.kind === 'error' ? (
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="reset-error-close"
                  className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input"
                >
                  Fechar
                </button>
              ) : phase.kind === 'success' ? (
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="reset-success-close"
                  className="flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
                >
                  Fechar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={phase.kind === 'deleting'}
                    data-testid="reset-cancel-button"
                    className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={runPurge}
                    disabled={!canConfirm}
                    data-testid="reset-confirm-button"
                    className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {phase.kind === 'deleting' ? 'Limpando…' : 'Limpar dados'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
