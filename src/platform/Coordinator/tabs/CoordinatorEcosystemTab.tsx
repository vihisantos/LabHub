import { appRegistry, type AppModule } from '../../../appRegistry'
import { isAppDisabled } from '../../../core/workspaces/apps'
import type { Workspace } from '../../../core/workspaces/types'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'

const ECOSYSTEM_APP_IDS = ['tv', 'pc-care', 'stock', 'reservalab'] as const

export interface CoordinatorEcosystemTabProps {
  units: CoordinatedUnit[]
  workspaces: Workspace[]
  onOpenApp: (unitId: string, path: string) => (() => void) | null
}

/**
 * Aba "Ecossistema" da Central (PR C). Lista os módulos operacionais disponíveis
 * na plataforma (via `appRegistry`) e a disponibilidade por unidade do escopo
 * usando APENAS o `disabled_apps` do workspace (a disponibilidade por permissão
 * — `useAppAccess` — continua sendo validada no momento em que o app abre).
 * Nenhuma permissão é concedida aqui; a Central apenas navega para a rota
 * existente do módulo no contexto da unidade.
 */
export function CoordinatorEcosystemTab({
  units,
  workspaces,
  onOpenApp,
}: CoordinatorEcosystemTabProps) {
  const modules = ECOSYSTEM_APP_IDS.map((id) => appRegistry.find((app) => app.id === id)).filter(
    (app): app is NonNullable<typeof app> => Boolean(app),
  )

  return (
    <section data-testid="tab-ecosystem" className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-fg">Ecossistema de apps</h2>
      <p className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-fg-muted">
        Módulos operacionais da plataforma e como cada unidade do seu escopo os disponibiliza. A
        Central não altera permissões: "Abrir" apenas navega para o app existente no contexto da
        unidade (o acesso real continua sendo definido por permissão e pelo app).
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {modules.map((app) => (
          <div
            key={app.id}
            data-testid={`ecosystem-module-${app.id}`}
            className="rounded-xl border border-line bg-surface p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${app.color}1f`, color: app.color }}
              >
                <IconFor app={app} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-fg">{app.name}</p>
                <p className="truncate text-[10px] text-fg-muted">{app.description}</p>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col gap-2">
              {units.map((unit) => {
                const workspaceEntry = workspaces.find((w) => w.id === unit.unitId)
                const disabled = isAppDisabled(app.id, workspaceEntry)
                const open = workspaceEntry ? onOpenApp(unit.unitId, app.route) : null
                return (
                  <div
                    key={unit.unitId}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-fg">
                      {unit.unitName}
                    </span>
                    {!workspaceEntry ? (
                      <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-[10px] font-semibold text-fg-muted">
                        fora do contexto
                      </span>
                    ) : disabled ? (
                      <span
                        data-testid={`ecosystem-${app.id}-${unit.unitId}-disabled`}
                        className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500"
                      >
                        desabilitado nesta unidade
                      </span>
                    ) : (
                      <>
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          disponível
                        </span>
                        <button
                          type="button"
                          data-testid={`ecosystem-open-${app.id}-${unit.unitId}`}
                          onClick={() => open?.()}
                          className="shrink-0 rounded-lg bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-600 transition-colors hover:bg-violet-500/25 dark:text-violet-400"
                        >
                          Abrir
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function IconFor({ app }: { app: AppModule }) {
  const Icon = app.icon
  return <Icon size={15} />
}