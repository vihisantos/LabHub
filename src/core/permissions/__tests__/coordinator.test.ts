import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_ROLES, resolveRoleId } from '../types'
import { permissionService } from '../service'
import { moduleLevelForSlug } from '../moduleVisibility'

/**
 * F2-D-N2 — o cargo Coordenador Multiunidade.
 *
 * Antes, este arquivo comparava `DEFAULT_ROLES[].appAccess` (a matriz legada
 * local) e chamava `resolveAppAccess`/`canWriteApp`. Essas APIs foram removidas,
 * então a verificação passou a ser feita na FONTE DE VERDADE do RBAC 2.0
 * (`moduleLevelForSlug`, alimentada por `membership → roles.slug`), e a parte de
 * identidade do cargo (key/default/nome) continua testada aqui.
 *
 * Não se recriou nenhuma asserção equivalente sobre `appAccess`: o oráculo
 * passou a ser a matriz RBAC2, não uma cópia da matriz antiga.
 */
function coordinatorRole() {
  return DEFAULT_ROLES.find((r) => r.id === 'role-coordinator')!
}

describe('Cargo Coordenador Multiunidade (role-coordinator)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('existe nos DEFAULT_ROLES com identidade coerente e não é default', () => {
    const role = coordinatorRole()
    expect(role).toBeDefined()
    expect(role.key).toBe('coordinator')
    expect(role.isDefault).toBe(false)
    expect(role.name).toBe('Coordenador Multiunidade')
    // O default de registro continua sendo o Visualizador (regressão).
    expect(DEFAULT_ROLES.find((r) => r.isDefault)?.id).toBe('role-viewer')
  })

  it('resolveRoleId aceita coordinator novo e legado sem quebrar regressões', () => {
    expect(resolveRoleId('coordinator')).toBe('role-coordinator')
    expect(resolveRoleId('role-coordinator')).toBe('role-coordinator')
    expect(resolveRoleId('lider')).toBe('role-lider')
    expect(resolveRoleId('role-lider')).toBe('role-lider')
    expect(resolveRoleId('technician')).toBe('role-technician')
    expect(resolveRoleId('viewer')).toBe('role-viewer')
    expect(resolveRoleId('admin')).toBe('role-technician') // legado preservado
    expect(resolveRoleId(null)).toBe('role-viewer')
  })

  it('migrate() semeia o cargo novo em instalações existentes (idempotente)', () => {
    permissionService.initDefaults()
    // Simula instalação que ainda não conhecia o cargo.
    permissionService.remove('role-coordinator')
    expect(permissionService.getById('role-coordinator')).toBeUndefined()

    permissionService.migrate()
    expect(permissionService.getById('role-coordinator')).toBeDefined()
    expect(permissionService.getById('role-coordinator')?.name).toBe('Coordenador Multiunidade')

    permissionService.migrate()
    expect(permissionService.getAll()).toHaveLength(4)
  })

  it('a matriz RBAC2 dá read nos cinco módulos do workspace do coordenador', () => {
    // Autorização/vizibilidade do coordenador é a MATRIZ RBAC2, resolvida do
    // slug da membership ativa — não mais uma propriedade do cargo local.
    // `chamados` BAIXOU de `full` para `read`: o coordenador acompanha as
    // unidades, e a operação de chamados continua decidida por Action
    // (`ticket.*` da 040/082), não pela matriz. O escopo por unidade — uma
    // membership por workspace — é o que o limita, e a matriz não o altera.
    expect(moduleLevelForSlug('coordinator', 'chamados')).toBe('read')
    expect(moduleLevelForSlug('coordinator', 'stock')).toBe('read')
    expect(moduleLevelForSlug('coordinator', 'pc-care')).toBe('read')
    expect(moduleLevelForSlug('coordinator', 'tv')).toBe('read')
    expect(moduleLevelForSlug('coordinator', 'reservalab')).toBe('read')
    // Fail-closed: nada fora da matriz.
    expect(moduleLevelForSlug('coordinator', 'admin')).toBe('none')
    expect(moduleLevelForSlug('coordinator', 'dashboard')).toBe('none')
  })

  it('regressão: técnico (full) e visualizador (read) nos cinco módulos', () => {
    for (const appId of ['chamados', 'stock', 'pc-care', 'reservalab', 'tv'] as const) {
      expect(moduleLevelForSlug('tec', appId), `tec/${appId}`).toBe('full')
      expect(moduleLevelForSlug('vis', appId), `vis/${appId}`).toBe('read')
    }
  })

  it('a cadeia legada de autorização não existe mais no serviço', () => {
    // Trava explícita: os nomes foram removidos, não renomeados.
    const svc = permissionService as unknown as Record<string, unknown>
    for (const api of ['resolveAppAccess', 'canAccessApp', 'canWriteApp', 'requireWrite']) {
      expect(svc[api]).toBeUndefined()
    }
  })
})
