import { useState } from 'react'
import type { User, UserRole } from '../../../core/auth/types'
import { ROLE_LABELS, ROLE_COLORS } from '../../../core/auth/types'
import { useRoles } from '../../../core/permissions/usePermissions'
import { APP_ACCESS_LABELS } from '../../../core/permissions/types'
import type { AppAccessOverride } from '../../../core/permissions/types'
import { appRegistry } from '../../../appRegistry'
import { icons } from '../../../lib/icons'

const ROLES: UserRole[] = ['viewer', 'technician', 'admin']
const editableApps = appRegistry.filter((app) => app.id !== 'admin')

export function ApproveUserModal({
  user,
  onClose,
  onConfirm,
}: {
  user: User
  onClose: () => void
  onConfirm: (role: UserRole, appAccess: Record<string, AppAccessOverride>) => Promise<boolean>
}) {
  const { roles: roleList } = useRoles()
  const [role, setRole] = useState<UserRole>('viewer')
  const [appAccess, setAppAccess] = useState<Record<string, AppAccessOverride>>({})
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    const ok = await onConfirm(role, appAccess)
    if (!ok) setSaving(false)
  }

  function handleAppAccess(appId: string, value: AppAccessOverride | 'inherit') {
    setAppAccess((prev) => {
      const next = { ...prev }
      if (value === 'inherit') {
        delete next[appId]
      } else {
        next[appId] = value
      }
      return next
    })
  }

  const isAdminRole = role === 'admin'
  const accentColor = user.accent === 'emerald' ? '#10b981' : user.accent === 'cyan' ? '#06b6d4' : user.accent === 'blue' ? '#3b82f6' : '#a855f7'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-y-auto max-h-[85dvh] rounded-2xl border border-line bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">Aprovar cadastro</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-fg-dim transition-colors hover:bg-input hover:text-fg disabled:opacity-50"
            title="Fechar"
          >
            <icons.ui.close size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: accentColor + '15', color: accentColor }}
            >
              <icons.ui.user size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg truncate">{user.name}</p>
              <p className="text-[11px] text-fg-muted truncate">{user.email}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Cargo</p>
            <div className="flex gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  disabled={saving}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all disabled:opacity-50 ${
                    role === r
                      ? `${ROLE_COLORS[r]} ring-1 ring-slate-500/30`
                      : 'bg-input text-fg-muted hover:text-fg'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {isAdminRole ? (
            <div className="rounded-lg bg-purple-500/5 px-3 py-2">
              <p className="text-[10px] font-medium text-purple-500">
                <icons.ui.shield size={10} className="inline mr-1" />
                Administrador — acesso total a todos os workspaces e dados
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">
                Acesso por aplicativo (opcional — sobrescreve o cargo)
              </p>
              <div className="space-y-1.5">
                {editableApps.map((app) => {
                  const roleForUser = roleList.find((r) => r.key === role)
                  const roleLevel = roleForUser?.appAccess?.[app.id]
                  const current = appAccess[app.id] ?? 'inherit'
                  return (
                    <div key={app.id} className="flex items-center gap-3 rounded-lg border border-line px-2.5 py-2">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${current === 'none' ? 'opacity-40 grayscale' : ''}`}
                        style={{ backgroundColor: app.color + '15', color: app.color }}
                      >
                        <app.icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-fg">{app.name}</p>
                        <p className="text-[10px] text-fg-dim">
                          Cargo: {roleLevel ? APP_ACCESS_LABELS[roleLevel] : 'Sem acesso'}
                        </p>
                      </div>
                      <select
                        value={current}
                        onChange={(e) => handleAppAccess(app.id, e.target.value as AppAccessOverride | 'inherit')}
                        disabled={saving}
                        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
                      >
                        <option value="inherit">Padrão do cargo</option>
                        <option value="none">Sem acesso</option>
                        <option value="dash">Dashboard</option>
                        <option value="read">Só leitura</option>
                        <option value="full">Acesso total</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl bg-input py-2.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Aprovando...' : 'Aprovar e conceder acesso'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
