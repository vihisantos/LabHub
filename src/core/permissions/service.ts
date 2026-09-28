import type { Role } from './types'
import { DEFAULT_ROLES, LeadershipLevel, resolveRoleId } from './types'
import { createSyncService } from '../../lib/sync'

// Cargos são globais (não têm workspace_id) — nunca filtrar por workspace.
// Com o filtro ativo, usuários com workspace ativo "perdiam" o cargo na leitura.
// A coleção `roles` está em LOCAL_ONLY_COLLECTIONS (lib/sync.ts): é estado local
// do dispositivo, apenas NOME/IDENTIDADE de cargo. Nunca foi autoridade, e
// depois do F2-D-N2 também não guarda mais acesso por app.
const service = createSyncService<Role>('roles', false)

function serialize(data: Omit<Role, 'id'>): Role {
  return { ...data, id: (data as Partial<Role>).id ?? crypto.randomUUID() } as Role
}

function keyFor(role: { key?: string; name: string }): string {
  if (role.key) return role.key
  const name = role.name.toLowerCase()
  if (name.includes('téc') || name.includes('tec')) return 'technician'
  return 'viewer'
}

export const permissionService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: Omit<Role, 'id'>) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<Role>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  /**
   * Semeia/backfill da coleção local de cargos.
   *
   * NÃO é o mecanismo de inicialização do RBAC 2.0 — a autorização vive de
   * `memberships → role_permissions → Action` (`useCanAccessAction`) e a
   * visibilidade de `moduleVisibility`. Isto aqui só mantém a lista de NOMES de
   * cargo que as telas admin exibem consistente entre dispositivos.
   *
   * O F2-D-N2 removeu o backfill de `appAccess`: o campo não existe mais, e
   * nenhuma decisão de visibilidade ou autorização passa por ele.
   */
  migrate: () => {
    for (const def of DEFAULT_ROLES) {
      if (!service.query((r) => r.id === def.id)[0]) {
        service.create(serialize({ ...def }))
      }
    }
    const existing = service.getAll()
    for (const role of existing) {
      if (role.key === 'admin' || role.id === 'role-admin') {
        service.remove(role.id)
        continue
      }
      const patch: Partial<Role> = {}
      if (!role.key) patch.key = keyFor(role)
      // Backfill Fase 4/5: classificação de liderança ausente volta ao canônico
      // (cargo default) ou a executante (custom) — fail-closed, nunca sobrescreve
      // valor explícito.
      if (role.isLeadership === undefined) {
        patch.isLeadership = DEFAULT_ROLES.find((d) => d.id === role.id)?.isLeadership ?? false
      }
      if (role.leadershipLevel === undefined) {
        patch.leadershipLevel = DEFAULT_ROLES.find((d) => d.id === role.id)?.leadershipLevel ?? LeadershipLevel.None
      }
      if (Object.keys(patch).length > 0) service.update(role.id, patch)
    }
  },

  initDefaults: () => {
    const existing = service.getAll()
    if (existing.length === 0) {
      for (const role of DEFAULT_ROLES) {
        service.create(serialize({ ...role }))
      }
      return
    }
    permissionService.migrate()
  },

  getDefaultRole: (): Role | undefined => {
    return service.query((r) => r.isDefault)[0]
  },

  /** Resolve o cargo pelo id (novo) ou pelo valor legado (key/name — migração). */
  getRoleForUser: (userRole: string): Role | undefined => {
    const id = resolveRoleId(userRole)
    const byId = service.query((r) => r.id === id)[0]
    if (byId) return byId
    const byKey = service.query((r) => r.key === userRole)[0]
    if (byKey) return byKey
    return service.query((r) => r.name.toLowerCase().includes(userRole.toLowerCase()))[0]
  },
}
