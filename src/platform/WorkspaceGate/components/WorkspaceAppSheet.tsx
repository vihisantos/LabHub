import { useCallback, useEffect, useRef, useState } from 'react'
import { BottomSheet, SheetHeader } from '../../ui/BottomSheet'
import type { Workspace } from '../../../core/workspaces/types'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { APPS_CONFIGURABLE, isAppDisabled } from '../../../core/workspaces/apps'
import { appSettingsService } from '../../../core/appSettings/service'
import type { AppModule } from '../../../appRegistry'
import { icons } from '../../../lib/icons'

interface WorkspaceAppSheetProps {
  app: AppModule | null
  workspace: Workspace | null
  open: boolean
  onClose: () => void
  /** Notifica o pai quando o toggle altera disabled_apps (mantém o rascunho
   * do WorkspaceAppsModal em sincronia — fonte única de verdade). */
  onDisabledAppsChange?: (disabledApps: string[]) => void
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

/**
 * Shell genérico de gerenciamento de um app dentro de um workspace.
 * Não conhece campos de configuração de nenhum app: apenas consulta as
 * capacidades declaradas no appRegistry (configurable/clearable) e renderiza
 * o SettingsPanel próprio do app, quando existir.
 *
 * Desativar reutiliza o mecanismo existente (workspaces.disabled_apps ->
 * Launcher/AppGuard). "Limpar dados" fica preparado e desabilitado até o
 * mecanismo real de purge existir — nenhum fake purge neste PR.
 */
export function WorkspaceAppSheet({
  app,
  workspace,
  open,
  onClose,
  onDisabledAppsChange,
}: WorkspaceAppSheetProps) {
  const { update } = useWorkspaces()
  const [view, setView] = useState<'overview' | 'settings'>('overview')
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      setView('overview')
      setError('')
      setUpdatedAt(null)
    }
  }, [open, app?.id])

  // Meta da última alteração (apenas para apps com definição de settings).
  useEffect(() => {
    if (!open || !app || view !== 'overview' || !app.settings) return
    let alive = true
    appSettingsService
      .getUpdatedAt(app.id)
      .then((value) => {
        if (alive) setUpdatedAt(value)
      })
      .catch(() => {
        if (alive) setUpdatedAt(null)
      })
    return () => {
      alive = false
    }
  }, [open, app, view])

  // Escape fecha; foco inicial entra no dialog; foco é devolvido ao fechar.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null

    const frame = requestAnimationFrame(() => {
      const target = dialogRef.current && getFocusableElements(dialogRef.current)[0]
      target?.focus()
    })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  function handleTab(event: React.KeyboardEvent) {
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusables = getFocusableElements(dialogRef.current)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const configurableByWorkspace = !!app && APPS_CONFIGURABLE.includes(app.id)
  const disabled = !!app && isAppDisabled(app.id, workspace)
  const hasPanel = !!app?.SettingsPanel

  const handleToggleActive = useCallback(async () => {
    if (!app || !workspace || !configurableByWorkspace || toggling) return
    const next = new Set(workspace.disabled_apps ?? [])
    if (next.has(app.id)) next.delete(app.id)
    else next.add(app.id)
    const list = [...next]
    setToggling(true)
    setError('')
    try {
      await update(workspace.id, { disabled_apps: list })
      onDisabledAppsChange?.(list)
    } catch {
      setError('Não foi possível atualizar o status do app.')
    } finally {
      setToggling(false)
    }
  }, [app, workspace, configurableByWorkspace, toggling, update, onDisabledAppsChange])

  const formattedUpdatedAt = updatedAt
    ? new Date(updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-app-sheet-title"
        aria-describedby="workspace-app-sheet-description"
        onKeyDown={handleTab}
        className="flex max-h-[80dvh] flex-col overflow-y-auto pb-6"
      >
        {app && (
          <>
            <SheetHeader title={undefined} onClose={onClose}>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: app.color + '18', color: app.color }}
                aria-hidden="true"
              >
                <app.icon size={16} />
              </span>
            </SheetHeader>

            <div className="px-5">
              <h2 id="workspace-app-sheet-title" className="text-lg font-bold text-fg">
                {app.name}
              </h2>
              <p id="workspace-app-sheet-description" className="mt-0.5 text-xs text-fg-muted">
                {app.description}
              </p>
              {workspace && (
                <p className="mt-1 text-[11px] text-fg-dim">
                  Workspace: <span className="font-medium text-fg-muted">{workspace.name}</span>
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${
                    !configurableByWorkspace ? 'bg-sky-500' : disabled ? 'bg-line' : 'bg-emerald-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-xs font-medium text-fg-muted">
                  {!configurableByWorkspace
                    ? 'Sempre ativo neste workspace'
                    : disabled
                      ? 'Desativado neste workspace'
                      : 'Ativo neste workspace'}
                </span>
              </div>
            </div>

            {view === 'settings' && app.SettingsPanel ? (
              <div className="mt-4 flex min-h-0 flex-1 flex-col px-5">
                <button
                  type="button"
                  onClick={() => setView('overview')}
                  className="mb-3 flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-input hover:text-fg"
                >
                  <icons.ui.chevronRight size={12} className="rotate-180" aria-hidden="true" />
                  Voltar
                </button>
                <div className="flex min-h-0 flex-1 flex-col">
                  <app.SettingsPanel appId={app.id} />
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2 px-5">
                {app.configurable && (
                  <button
                    type="button"
                    disabled={!hasPanel}
                    onClick={() => setView('settings')}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      hasPanel
                        ? 'border-line bg-card hover:bg-input'
                        : 'cursor-not-allowed border-line bg-surface opacity-60'
                    }`}
                    aria-disabled={!hasPanel}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                      <icons.nav.settings size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">Configurar</span>
                      {!hasPanel && (
                        <span className="block text-[10px] text-fg-dim">
                          Configuração disponível em breve
                        </span>
                      )}
                    </span>
                    {hasPanel && <icons.ui.chevronRight size={16} className="text-fg-dim" />}
                  </button>
                )}

                {app.clearable && (
                  <button
                    type="button"
                    disabled
                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left opacity-60"
                    aria-disabled="true"
                    title="O mecanismo de limpeza com backup será habilitado em breve"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                      <icons.ui.trash size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">
                        Limpar dados deste workspace
                      </span>
                      <span className="block text-[10px] text-fg-dim">
                        Disponível em breve, com backup automático
                      </span>
                    </span>
                    <icons.ui.chevronRight size={16} className="text-fg-dim" />
                  </button>
                )}

                {configurableByWorkspace && (
                  <button
                    type="button"
                    disabled={toggling}
                    onClick={handleToggleActive}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5 text-left transition-colors hover:bg-input disabled:opacity-50"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        disabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                      }`}
                    >
                      <icons.ui.shield size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">
                        {disabled ? 'Ativar neste workspace' : 'Desativar neste workspace'}
                      </span>
                      <span className="block text-[10px] text-fg-dim">
                        {disabled
                          ? 'O app volta a aparecer no launcher deste workspace'
                          : 'O app some do launcher e bloqueia o acesso neste workspace'}
                      </span>
                    </span>
                  </button>
                )}

                {error && <p className="text-xs text-red-500">{error}</p>}

                {formattedUpdatedAt && (
                  <p className="pt-1 text-[10px] text-fg-dim">
                    Última alteração: {formattedUpdatedAt}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
