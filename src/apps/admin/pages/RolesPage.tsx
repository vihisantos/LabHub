import { useState } from 'react'
import { useRoles } from '../../../core/permissions/usePermissions'
import { APP_ACCESS_LEVELS, APP_ACCESS_LABELS, type AppAccessLevel } from '../../../core/permissions/types'
import { appRegistry } from '../../../appRegistry'
import { icons } from '../../../lib/icons'

const LEVEL_BADGES: Record<AppAccessLevel, { active: string; dot: string }> = {
  dash: { active: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  read: { active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  full: { active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
}

export function RolesPage() {
  const { roles, loading, update } = useRoles()
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  async function setAppAccess(roleId: string, appId: string, level: AppAccessLevel | null) {
    const role = roles.find((r) => r.id === roleId)
    if (!role) return

    setSaving(roleId)
    const next = { ...(role.appAccess || {}) }
    if (level === null) {
      delete next[appId]
    } else {
      next[appId] = level
    }
    update(roleId, { appAccess: next })
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Carregando cargos...</p>
        </div>
      </div>
    )
  }

  if (roles.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-bold text-fg">Cargos</h2>
          <p className="mt-1 text-sm text-fg-muted">Nenhum cargo encontrado</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Cargos e Aplicativos</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Defina o nível de acesso de cada cargo a cada aplicativo. O acesso individual do usuário pode sobrescrever isso.
        </p>
      </div>

      {roles.map((role) => {
        const access = role.appAccess || {}
        const grantedCount = appRegistry.filter((app) => access[app.id]).length
        const isExpanded = expandedRole === role.id

        return (
          <div key={role.id} className="rounded-xl bg-card shadow-[var(--shadow-card)] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedRole(isExpanded ? null : role.id)}
              className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-input/50"
            >
              <div>
                <p className="text-sm font-semibold text-fg">{role.name}</p>
                <p className="text-[11px] text-fg-muted">{role.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-fg-muted">{grantedCount} de {appRegistry.length} apps</span>
                <icons.ui.chevronDown
                  size={16}
                  className={`text-fg-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-line px-4 py-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {appRegistry.map((app) => {
                    const level = access[app.id] || null
                    const isOn = level !== null
                    return (
                      <div
                        key={app.id}
                        className={`rounded-xl border p-3 transition-colors ${isOn ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-line bg-input/30'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-opacity ${isOn ? '' : 'opacity-40 grayscale'}`}
                            style={{ backgroundColor: app.color + '15', color: app.color }}
                          >
                            <app.icon size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-fg">{app.name}</p>
                            <p className="text-[10px] text-fg-muted truncate">{app.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAppAccess(role.id, app.id, isOn ? null : 'full')}
                            disabled={saving === role.id}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${isOn ? 'bg-emerald-500' : 'bg-input'}`}
                            title={isOn ? 'Remover acesso' : 'Conceder acesso'}
                          >
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isOn ? 'left-[1.375rem]' : 'left-0.5'}`}
                            />
                          </button>
                        </div>

                        {isOn && (
                          <div className="mt-3 flex items-center gap-1.5">
                            {APP_ACCESS_LEVELS.map((lvl) => {
                              const isActive = level === lvl
                              return (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => setAppAccess(role.id, app.id, lvl)}
                                  disabled={saving === role.id}
                                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                                    isActive ? LEVEL_BADGES[lvl].active : 'text-fg-muted hover:bg-input hover:text-fg'
                                  }`}
                                  title={APP_ACCESS_LABELS[lvl]}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? LEVEL_BADGES[lvl].dot : 'bg-fg-muted/40'}`} />
                                  {APP_ACCESS_LABELS[lvl]}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
