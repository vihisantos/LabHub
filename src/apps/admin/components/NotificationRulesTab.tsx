import { useEffect, useMemo, useState } from 'react'
import { useRoles } from '../../../core/permissions/usePermissions'
import { permissionService } from '../../../core/permissions/service'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { adminService } from '../../../core/auth/adminService'
import type { User, UserNotifySettings, NotifyChannelSettings } from '../../../core/auth/types'
import type { Role } from '../../../core/permissions/types'
import { appRegistry } from '../../../appRegistry'
import { Switch } from '../../../lib/components/ui/switch'
import { icons } from '../../../lib/icons'

const MODULES = appRegistry.filter((app) => app.id !== 'admin')

const EMPTY_SETTINGS: UserNotifySettings = { muted: false, apps: {} }

function userHasAppAccess(user: User, roles: Role[], appId: string): boolean {
  if (user.is_super_admin) return true
  const role = roles.find((r) => r.id === user.roleId)
  return permissionService.resolveAppAccess(role, user, appId) !== null
}

function inWorkspaceScope(user: User, workspaceFilter: string): boolean {
  if (workspaceFilter === 'all') return true
  if (user.is_super_admin) return true
  return (user.workspace_ids || []).includes(workspaceFilter)
}

export function NotificationRulesTab() {
  const { roles } = useRoles()
  const { workspaces } = useWorkspace()
  const [profiles, setProfiles] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [workspaceFilter, setWorkspaceFilter] = useState('all')
  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    adminService.listAllProfiles().then((users) => {
      if (active) {
        setProfiles(users.filter((u) => u.status === 'active'))
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const usersWithAccess = useMemo(() => {
    if (!selectedApp) return []
    return profiles.filter(
      (u) => userHasAppAccess(u, roles, selectedApp) && inWorkspaceScope(u, workspaceFilter),
    )
  }, [profiles, roles, selectedApp, workspaceFilter])

  async function saveSettings(user: User, next: UserNotifySettings) {
    setSaving(user.id)
    const ok = await adminService.updateUserProfile(user.id, { notify_settings: next })
    if (ok) {
      setProfiles((prev) => prev.map((p) => (p.id === user.id ? { ...p, notify_settings: next } : p)))
    }
    setSaving(null)
  }

  function setChannel(user: User, appId: string, channel: keyof NotifyChannelSettings, value: boolean) {
    const prev = user.notify_settings || EMPTY_SETTINGS
    const next: UserNotifySettings = {
      ...prev,
      apps: {
        ...prev.apps,
        [appId]: { inapp: true, push: true, ...prev.apps[appId], [channel]: value },
      },
    }
    saveSettings(user, next)
  }

  function setMuted(user: User, value: boolean) {
    const prev = user.notify_settings || EMPTY_SETTINGS
    saveSettings(user, { ...prev, muted: value })
  }

  function channelEnabled(user: User, appId: string, channel: keyof NotifyChannelSettings): boolean {
    const settings = user.notify_settings
    return settings?.apps?.[appId]?.[channel] ?? true
  }

  const selectedModule = selectedApp ? MODULES.find((m) => m.id === selectedApp) : null

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-fg">Regras de entrega</h3>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              Por padrão, quem tem acesso ao app recebe. Ajuste canais por usuário aqui.
            </p>
          </div>
          <select
            value={workspaceFilter}
            onChange={(e) => setWorkspaceFilter(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none"
          >
            <option value="all">Todos os workspaces</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedModule ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSelectedApp(null)}
            className="flex items-center gap-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <icons.ui.back size={14} />
            Voltar às regras
          </button>

          <div className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: selectedModule.color + '15', color: selectedModule.color }}
            >
              <selectedModule.icon size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-fg">{selectedModule.name}</p>
              <p className="text-[11px] text-fg-muted">
                {usersWithAccess.length} usuário{usersWithAccess.length !== 1 ? 's' : ''} com acesso
                recebem por padrão
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl bg-card p-8 text-center text-xs text-fg-dim">Carregando usuários...</div>
          ) : usersWithAccess.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl bg-card p-8">
              <icons.ui.inbox size={32} className="text-fg-muted" />
              <p className="mt-2 text-xs text-fg-muted">Nenhum usuário com acesso neste workspace</p>
            </div>
          ) : (
            <div className="space-y-2">
              {usersWithAccess.map((user) => {
                const muted = user.notify_settings?.muted ?? false
                const inapp = channelEnabled(user, selectedModule.id, 'inapp')
                const push = channelEnabled(user, selectedModule.id, 'push')
                const busy = saving === user.id
                return (
                  <div key={user.id} className="space-y-2.5 rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                        <icons.ui.user size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg">{user.name}</p>
                        <p className="truncate text-[10px] text-fg-muted">
                          {roles.find((r) => r.id === user.roleId)?.name ?? 'Sem cargo'}{' '}
                          {user.is_super_admin ? '· Admin absoluto' : ''}
                        </p>
                      </div>
                      {muted && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-500">
                          Mudo
                        </span>
                      )}
                    </div>

                    {muted ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-fg-muted">Silenciado globalmente</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-fg-muted">Desmutar</span>
                          <Switch checked={muted} onCheckedChange={(v) => setMuted(user, v)} disabled={busy} />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        <label className="flex items-center justify-between gap-1 rounded-lg bg-input/60 px-2 py-1.5">
                          <span className="text-[10px] text-fg-muted">In-app</span>
                          <Switch
                            checked={inapp}
                            onCheckedChange={(v) => setChannel(user, selectedModule.id, 'inapp', v)}
                            disabled={busy}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-1 rounded-lg bg-input/60 px-2 py-1.5">
                          <span className="text-[10px] text-fg-muted">Push</span>
                          <Switch
                            checked={push}
                            onCheckedChange={(v) => setChannel(user, selectedModule.id, 'push', v)}
                            disabled={busy}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-1 rounded-lg bg-input/60 px-2 py-1.5">
                          <span className="text-[10px] text-fg-muted">Mudo</span>
                          <Switch checked={muted} onCheckedChange={(v) => setMuted(user, v)} disabled={busy} />
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {MODULES.map((app) => {
            const withAccess = profiles.filter((u) => userHasAppAccess(u, roles, app.id) && inWorkspaceScope(u, workspaceFilter))
            const rolesWithAccess = roles
              .filter((r) => r.appAccess?.[app.id])
              .map((r) => r.name)
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedApp(app.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-[var(--shadow-card)] transition-all hover:bg-card-hover active:scale-[0.99]"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: app.color + '15', color: app.color }}
                >
                  <app.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-fg">{app.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-fg-muted">
                    {rolesWithAccess.length > 0
                      ? `Cargos com acesso: ${rolesWithAccess.join(', ')}`
                      : 'Só admin absoluto'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-500">
                    {withAccess.length}
                  </span>
                  <icons.ui.chevronRight size={14} className="text-fg-muted" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
