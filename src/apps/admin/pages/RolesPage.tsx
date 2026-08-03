import { useState } from 'react'
import { useRoles } from '../../../core/permissions/usePermissions'
import { PERMISSION_LABELS, PERMISSION_GROUPS } from '../../../core/permissions/types'
import type { Permission } from '../../../core/permissions/types'
import { icons } from '../../../lib/icons'
import { Switch } from '../../../lib/components/ui/switch'

export function RolesPage() {
  const { roles, loading, update } = useRoles()
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  async function togglePermission(roleId: string, permission: Permission) {
    const role = roles.find((r) => r.id === roleId)
    if (!role) return

    setSaving(roleId)
    const hasIt = role.permissions.includes(permission)
    const newPermissions = hasIt
      ? role.permissions.filter((p) => p !== permission)
      : [...role.permissions, permission]

    update(roleId, { permissions: newPermissions })
    setSaving(null)
  }

  async function toggleAllPermissions(roleId: string, groupPermissions: Permission[], enable: boolean) {
    const role = roles.find((r) => r.id === roleId)
    if (!role) return

    setSaving(roleId)
    const current = new Set(role.permissions)
    if (enable) {
      for (const p of groupPermissions) current.add(p)
    } else {
      for (const p of groupPermissions) current.delete(p)
    }
    update(roleId, { permissions: [...current] })
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Carregando permissões...</p>
        </div>
      </div>
    )
  }

  if (roles.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-bold text-fg">Permissões</h2>
          <p className="mt-1 text-sm text-fg-muted">Nenhuma role encontrada</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Permissões</h2>
        <p className="mt-1 text-sm text-fg-muted">Gerencie o que cada role pode acessar</p>
      </div>

      {roles.map((role) => (
        <div key={role.id} className="rounded-xl bg-card shadow-[var(--shadow-card)] overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
            className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-input/50"
          >
            <div>
              <p className="text-sm font-semibold text-fg">{role.name}</p>
              <p className="text-[11px] text-fg-muted">{role.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-fg-muted">{role.permissions.length} permissões</span>
              <icons.ui.chevronDown
                size={16}
                className={`text-fg-muted transition-transform ${expandedRole === role.id ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          {expandedRole === role.id && (
            <div className="border-t border-line px-4 py-3 space-y-3">
              {PERMISSION_GROUPS.map((group) => {
                const groupAll = group.permissions.every((p) => role.permissions.includes(p))
                return (
                  <div key={group.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-fg">{group.name}</span>
                      <button
                        type="button"
                        onClick={() => toggleAllPermissions(role.id, group.permissions, !groupAll)}
                        disabled={saving === role.id}
                        className="text-[10px] font-medium text-fg-muted hover:text-fg transition-colors disabled:opacity-50"
                      >
                        {groupAll ? 'Desmarcar todos' : 'Marcar todos'}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {group.permissions.map((permission) => (
                        <label
                          key={permission}
                          className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-input/50 transition-colors cursor-pointer"
                        >
                          <span className="text-xs text-fg">{PERMISSION_LABELS[permission]}</span>
                          <Switch
                            checked={role.permissions.includes(permission)}
                            onCheckedChange={() => togglePermission(role.id, permission)}
                            disabled={saving === role.id}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
