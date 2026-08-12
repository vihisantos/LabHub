import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRoles } from '../../../core/permissions/usePermissions'
import {
  APP_ACCESS_LEVELS,
  APP_ACCESS_LABELS,
  roleBadgeClass,
  type AppAccessLevel,
  type Role,
} from '../../../core/permissions/types'
import { adminService } from '../../../core/auth/adminService'
import type { User } from '../../../core/auth/types'
import { appRegistry } from '../../../appRegistry'
import { icons } from '../../../lib/icons'

const LEVEL_BADGES: Record<AppAccessLevel, { active: string; dot: string }> = {
  dash: { active: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  read: { active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  full: { active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
}

function MemberAvatar({ user }: { user: User }) {
  if (user.avatar) {
    return <img src={user.avatar} alt={user.name} className="h-9 w-9 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg-muted/15 text-fg-muted">
      <icons.ui.user size={16} />
    </div>
  )
}

export function RolesPage() {
  const { roles, loading, update, create, remove } = useRoles()
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<User[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)

  // Novo cargo
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newLeaderId, setNewLeaderId] = useState('')

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true)
    const list = await adminService.listAllProfiles()
    setProfiles(list.filter((u) => u.status === 'active'))
    setProfilesLoading(false)
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  const activeUsers = useMemo(
    () => profiles.filter((u) => u.status === 'active'),
    [profiles],
  )

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

  async function handleSetLeader(role: Role, leaderId: string | null) {
    setSaving(role.id)
    update(role.id, { leaderId: leaderId ?? undefined })
    setSaving(null)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving('new')
    create({
      name: newName.trim(),
      description: newDesc.trim() || 'Cargo personalizado',
      appAccess: {},
      isDefault: false,
      ...(newLeaderId ? { leaderId: newLeaderId } : {}),
    })
    setSaving(null)
    setCreating(false)
    setNewName('')
    setNewDesc('')
    setNewLeaderId('')
  }

  async function handleDelete(role: Role) {
    const members = activeUsers.filter((u) => u.roleId === role.id)
    if (role.isDefault) {
      window.alert('O cargo padrão não pode ser excluído.')
      return
    }
    if (members.length > 0) {
      window.alert(`Este cargo tem ${members.length} usuário(s). Reatribua os cargos antes de excluir.`)
      return
    }
    if (!window.confirm(`Excluir o cargo "${role.name}"?`)) return
    remove(role.id)
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-fg">Cargos</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Cada cargo define o nível de acesso aos aplicativos, o líder do setor e seus subordinados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <icons.ui.plus size={14} />
            Novo cargo
          </button>
        </div>
      </div>

      {roles.map((role) => {
        const access = role.appAccess || {}
        const grantedCount = appRegistry.filter((app) => access[app.id]).length
        const isExpanded = expandedRole === role.id
        const leader = activeUsers.find((u) => u.id === role.leaderId)
        const members = activeUsers.filter((u) => u.roleId === role.id)

        return (
          <div key={role.id} className="rounded-xl bg-card shadow-[var(--shadow-card)] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedRole(isExpanded ? null : role.id)}
              className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-input/50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-fg">{role.name}</p>
                  {role.isDefault && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-500">
                      Padrão
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${roleBadgeClass(role)}`}>
                    {members.length} membro{members.length !== 1 ? 's' : ''}
                  </span>
                </div>
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
              <div className="border-t border-line px-4 py-4 space-y-4">
                {/* Líder do setor */}
                <div>
                  <p className="text-[10px] font-semibold text-fg-muted mb-1.5">Líder do setor</p>
                  <div className="flex items-center gap-2.5">
                    {leader ? (
                      <>
                        <MemberAvatar user={leader} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg truncate">{leader.name}</p>
                          <p className="text-[10px] text-fg-muted truncate">{leader.email}</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fg-muted/15 text-fg-muted">
                        <icons.ui.user size={16} />
                      </div>
                    )}
                    <select
                      value={role.leaderId ?? ''}
                      onChange={(e) => handleSetLeader(role, e.target.value || null)}
                      disabled={saving === role.id || profilesLoading}
                      className="ml-auto rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Sem líder</option>
                      {activeUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Subordinados */}
                <div>
                  <p className="text-[10px] font-semibold text-fg-muted mb-1.5">
                    Subordinados ({members.length})
                  </p>
                  {members.length === 0 ? (
                    <p className="rounded-lg bg-input/40 px-3 py-2 text-[11px] text-fg-dim">
                      Nenhum usuário com este cargo ainda. Atribua o cargo em Usuários.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {members.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-1.5 rounded-lg bg-input/50 px-2 py-1.5"
                          title={`${u.name} · ${u.email}`}
                        >
                          <MemberAvatar user={u} />
                          <span className="max-w-[10rem] truncate text-[11px] font-medium text-fg">{u.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Acesso por aplicativo */}
                <div>
                  <p className="text-[10px] font-semibold text-fg-muted mb-1.5">Acesso por aplicativo</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {appRegistry.filter((app) => app.id !== 'admin').map((app) => {
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

                {!role.isDefault && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDelete(role)}
                      disabled={saving === role.id}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <icons.ui.trash size={13} />
                      Excluir cargo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setCreating(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-fg">Novo cargo</h3>
              <button
                type="button"
                onClick={() => setCreating(false)}
                disabled={saving === 'new'}
                className="rounded-lg p-1.5 text-fg-dim transition-colors hover:bg-input hover:text-fg disabled:opacity-50"
                title="Fechar"
              >
                <icons.ui.close size={16} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Nome do cargo</p>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Coordenador de T.I."
                  className="w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Descrição</p>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Ex.: Responsável pelo setor de tecnologia"
                  className="w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">Líder do setor</p>
                <select
                  value={newLeaderId}
                  onChange={(e) => setNewLeaderId(e.target.value)}
                  disabled={profilesLoading}
                  className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-fg focus:outline-none"
                >
                  <option value="">Selecione o líder...</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <p className="rounded-lg bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                Depois de criar, defina o acesso por aplicativo expandindo o cargo. Os subordinados são os usuários
                atribuídos a este cargo.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  disabled={saving === 'new'}
                  className="flex-1 rounded-xl bg-input py-2.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving === 'new' || !newName.trim()}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving === 'new' ? 'Criando...' : 'Criar cargo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
