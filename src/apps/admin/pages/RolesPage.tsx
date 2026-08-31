import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRoles } from '../../../core/permissions/usePermissions'
import {
  APP_ACCESS_DESCRIPTIONS,
  APP_ACCESS_LABELS,
  APP_ACCESS_LEVELS,
  type AppAccessLevel,
  type Role,
} from '../../../core/permissions/types'
import { adminService } from '../../../core/auth/adminService'
import type { User } from '../../../core/auth/types'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { appRegistry } from '../../../appRegistry'
import { icons } from '../../../lib/icons'
import { PersonAvatar } from '../components/personShared'

const LEVEL_BADGES: Record<'none' | AppAccessLevel, { chip: string; dot: string }> = {
  none: { chip: 'bg-input text-fg-muted', dot: 'bg-fg-muted/40' },
  dash: { chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  read: { chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  full: { chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
}

interface LevelOption {
  value: AppAccessLevel | null
  label: string
  desc: string
}

const LEVEL_OPTIONS: LevelOption[] = [
  { value: null, label: 'Sem acesso', desc: 'Não enxerga nem utiliza o aplicativo' },
  ...APP_ACCESS_LEVELS.map((lvl) => ({
    value: lvl as AppAccessLevel | null,
    label: APP_ACCESS_LABELS[lvl],
    desc: APP_ACCESS_DESCRIPTIONS[lvl],
  })),
]

interface LevelPickerState {
  roleId: string
  appId: string
  appName: string
  level: AppAccessLevel | null
}

const ACCESSIBLE_APPS = appRegistry.filter((app) => app.id !== 'admin')

export function RolesPage() {
  const { roles, loading, update, create, remove } = useRoles()
  const { workspace } = useWorkspace()
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<User[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)

  // Nível de acesso por aplicativo (bottom sheet)
  const [picking, setPicking] = useState<LevelPickerState | null>(null)
  const [draftLevel, setDraftLevel] = useState<AppAccessLevel | null>(null)

  // Novo cargo
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newLeaderId, setNewLeaderId] = useState('')

  // Confirmação de exclusão
  const [deleting, setDeleting] = useState<Role | null>(null)

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

  // Escopo por workspace (mesmo critério da página de Usuários): membros, líder
  // e seletor de líder refletem o workspace atual. Admin absoluto e usuários sem
  // workspace atribuído aparecem sempre (estes precisam ser atribuídos).
  const workspaceId = workspace?.id ?? null
  const scopedActiveUsers = useMemo(
    () => activeUsers.filter((u) => {
      if (!workspaceId) return true
      if (u.is_super_admin) return true
      const ids = u.workspace_ids || []
      return ids.length === 0 || ids.includes(workspaceId)
    }),
    [activeUsers, workspaceId],
  )

  function openLevelPicker(role: Role, appId: string) {
    const app = appRegistry.find((a) => a.id === appId)
    const level = (role.appAccess || {})[appId] ?? null
    setPicking({ roleId: role.id, appId, appName: app?.name ?? appId, level })
    setDraftLevel(level)
  }

  async function applyLevel() {
    if (!picking) return
    const { roleId, appId } = picking
    setSaving(roleId)
    const next = { ...(roles.find((r) => r.id === roleId)?.appAccess || {}) }
    if (draftLevel === null) {
      delete next[appId]
    } else {
      next[appId] = draftLevel
    }
    update(roleId, { appAccess: next })
    setSaving(null)
    setPicking(null)
  }

  async function handleSetLeader(role: Role, leaderId: string | null) {
    setSaving(role.id)
    update(role.id, { leaderId: leaderId ?? undefined })
    setSaving(null)
  }

  async function setManageQr(role: Role, value: boolean) {
    setSaving(role.id)
    update(role.id, { manageQr: value })
    setSaving(null)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving('new')
    create({
      name: newName.trim(),
      description: newDesc.trim() || 'Cargo personalizado',
      appAccess: {},
      manageQr: false,
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
    const members = scopedActiveUsers.filter((u) => u.roleId === role.id)
    if (role.isDefault) {
      setDeleting(null)
      window.alert('O cargo padrão não pode ser excluído.')
      return
    }
    if (members.length > 0) {
      setDeleting(null)
      window.alert(`Este cargo tem ${members.length} usuário(s). Reatribua os cargos antes de excluir.`)
      return
    }
    remove(role.id)
    setDeleting(null)
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
            <h2 className="text-lg font-bold text-fg">Cargos &amp; Acesso</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Defina como os diferentes tipos de usuários utilizam os recursos deste Workspace.
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

      <div className="space-y-3">
        {roles.map((role) => {
          const access = role.appAccess || {}
          const isExpanded = expandedRole === role.id
          const leader = scopedActiveUsers.find((u) => u.id === role.leaderId)
          const members = scopedActiveUsers.filter((u) => u.roleId === role.id)

          return (
            <div key={role.id} className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
              <button
                type="button"
                onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-input/40"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fg-muted/10 text-fg-muted">
                  <icons.ui.shield size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-fg">{role.name}</p>
                    {role.isDefault && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-500">
                        Padrão
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-fg-muted">{role.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] text-fg-muted">
                    {members.length} membro{members.length !== 1 ? 's' : ''}
                  </span>
                  <icons.ui.chevronDown
                    size={16}
                    className={`text-fg-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-line px-4 py-4 lg:grid lg:grid-cols-2 lg:gap-6">
                  {/* Coluna: informações do cargo */}
                  <div className="space-y-5">
                    {/* Pessoas */}
                    <section>
                      <p className="mb-2 text-[10px] font-semibold text-fg-muted">
                        Pessoas com este cargo ({members.length})
                      </p>
                      {members.length === 0 ? (
                        <p className="rounded-lg bg-input/40 px-3 py-2.5 text-[11px] text-fg-dim">
                          Nenhum usuário com este cargo ainda. Atribua o cargo em Pessoas.
                        </p>
                      ) : (
                        <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-input/20">
                          {members.map((u) => (
                            <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                              <PersonAvatar user={u} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-fg">{u.name}</p>
                                <p className="truncate text-[10px] text-fg-muted">{u.email}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Recursos adicionais */}
                    <section>
                      <p className="mb-2 text-[10px] font-semibold text-fg-muted">Recursos adicionais</p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-input/30 px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                              <icons.ui.qrCode size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-fg">Gerar QR de salas</p>
                              <p className="text-[10px] text-fg-muted">
                                Independente do nível no app Chamados.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setManageQr(role, !role.manageQr)}
                            disabled={saving === role.id}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${role.manageQr ? 'bg-emerald-500' : 'bg-input'}`}
                            title={role.manageQr ? 'Revogar QR' : 'Conceder QR'}
                          >
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${role.manageQr ? 'left-[1.375rem]' : 'left-0.5'}`}
                            />
                          </button>
                        </div>

                        <div className="rounded-xl border border-line bg-input/30 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                                <icons.ui.user size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-fg">Líder do setor</p>
                                <p className="text-[10px] text-fg-muted">
                                  {leader ? leader.name : 'Sem líder definido'}
                                </p>
                              </div>
                            </div>
                          </div>
                          <select
                            value={role.leaderId ?? ''}
                            onChange={(e) => handleSetLeader(role, e.target.value || null)}
                            disabled={saving === role.id || profilesLoading}
                            className="mt-3 w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-fg focus:outline-none disabled:opacity-50"
                          >
                            <option value="">Sem líder</option>
                            {scopedActiveUsers.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </section>

                    {!role.isDefault && (
                      <section className="lg:col-span-2">
                        <button
                          type="button"
                          onClick={() => setDeleting(role)}
                          disabled={saving === role.id}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <icons.ui.trash size={13} />
                          Excluir cargo
                        </button>
                      </section>
                    )}
                  </div>

                  {/* Coluna: acesso aos aplicativos */}
                  <section>
                    <p className="mb-1 text-[10px] font-semibold text-fg-muted">Acesso aos aplicativos</p>
                    <p className="mb-2.5 text-[10px] text-fg-dim">
                      O nível define como quem usa este cargo enxerga cada aplicativo. Overrides individuais são
                      ajustados em Pessoas.
                    </p>
                    <div className="space-y-2.5">
                      {ACCESSIBLE_APPS.map((app) => {
                        const level = access[app.id] ?? null
                        const badge = LEVEL_BADGES[level ?? 'none']
                        return (
                          <button
                            key={app.id}
                            type="button"
                            onClick={() => openLevelPicker(role, app.id)}
                            disabled={saving === role.id}
                            className="flex w-full items-center gap-3 rounded-xl border border-line bg-input/20 px-3 py-3 text-left transition-colors hover:bg-input/40 disabled:opacity-50"
                          >
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                              style={{ backgroundColor: app.color + '15', color: app.color }}
                            >
                              <app.icon size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-fg">{app.name}</p>
                              <p className="text-[10px] text-fg-muted">Acesso do cargo</p>
                            </div>
                            <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-semibold ${badge.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                              {LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? 'Sem acesso'}
                            </span>
                            <icons.ui.chevronRight size={14} className="shrink-0 text-fg-dim" />
                          </button>
                        )
                      })}
                    </div>

                    {/* Futuro: Ações permitidas (ausente até existirem dados reais) */}
                  </section>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom sheet: nível de acesso por aplicativo */}
      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setPicking(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-fg">{picking.appName}</h3>
              <p className="text-[11px] text-fg-muted">Nível de acesso</p>
            </div>
            <div className="space-y-1 p-3">
              {LEVEL_OPTIONS.map((opt) => {
                const isActive = draftLevel === opt.value
                const badge = LEVEL_BADGES[opt.value ?? 'none']
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setDraftLevel(opt.value)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isActive ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line bg-input/20 hover:bg-input/40'
                    }`}
                  >
                    <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${isActive ? `border-emerald-500 ${badge.dot}` : 'border-fg-muted/40'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-fg">{opt.label}</p>
                      <p className="text-[10px] text-fg-muted">{opt.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 border-t border-line p-3">
              <button
                type="button"
                onClick={() => setPicking(null)}
                disabled={saving === picking.roleId}
                className="flex-1 rounded-xl bg-input py-2.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={applyLevel}
                disabled={saving === picking.roleId}
                className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

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
                  {scopedActiveUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <p className="rounded-lg bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                Depois de criar, defina o acesso por aplicativo tocando no cargo. As pessoas com este cargo são
                definidas em Pessoas.
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

      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleting(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-3 pt-1 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <icons.ui.trash size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-fg">Excluir cargo?</h3>
                <p className="mt-1 text-[11px] text-fg-muted">
                  Excluir o cargo "{deleting.name}" remove esta definição de acesso. Os usuários que usam este
                  cargo passarão ao cargo padrão.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={saving === deleting.id}
                className="flex-1 rounded-xl bg-input py-2.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleting)}
                disabled={saving === deleting.id}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
