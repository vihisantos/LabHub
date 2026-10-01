import { checklistTemplateService } from '../checklistService'
import type { ChecklistTemplateForm } from '../../types/checklist'
import { authService } from '../../../../core/auth/service'

function validTemplateForm(): ChecklistTemplateForm {
  return {
    name: 'Checklist Padrão',
    labName: 'Lab A',
    items: [
      { id: 'item-1', label: 'Limpar teclado', category: 'cleaning' },
      { id: 'item-2', label: 'Testar mouse', category: 'restoration' },
    ],
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('checklistTemplateService', () => {
  it('create adiciona template com timestamps', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    expect(t.id).toBeDefined()
    expect(t.name).toBe('Checklist Padrão')
    expect(t.items).toHaveLength(2)
    expect(t.createdAt).toBeDefined()
  })

  it('getAll retorna todos os templates', () => {
    checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.create({ ...validTemplateForm(), name: 'Outro' })
    expect(checklistTemplateService.getAll()).toHaveLength(2)
  })

  it('getById retorna template', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    expect(checklistTemplateService.getById(t.id)?.name).toBe('Checklist Padrão')
  })

  it('update modifica nome', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.update(t.id, { name: 'Renomeado' })
    expect(checklistTemplateService.getById(t.id)?.name).toBe('Renomeado')
  })

  it('remove deleta template', () => {
    const t = checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.remove(t.id)
    expect(checklistTemplateService.getById(t.id)).toBeUndefined()
  })

  it('getByLab retorna templates de um laboratório', () => {
    checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.create({ ...validTemplateForm(), labName: 'Lab B' })
    const result = checklistTemplateService.getByLab('Lab A')
    expect(result).toHaveLength(1)
  })
})

/**
 * F2-D-G / F2-D-N2 — o gate legado saiu do service de TEMPLATE e não voltou.
 *
 * A autorização por Action vive na UI (`useCanAccessAction`) e no RLS de
 * `pcare.checklist_templates` (migration 079). A cadeia legada
 * (`requireWrite` → `canWriteApp` → `resolveAppAccess` →
 * `Role.appAccess`/`profiles.app_access`) foi REMOVIDA no F2-D-N2, junto com
 * `pcChecklistService` — o fluxo morto que era o único detentor dela.
 */
describe('checklistTemplateService — sem dependência do gate legado (RBAC 2.0)', () => {
  it('funciona com um usuário sem acesso a pc-care (quem nega é a Action/RLS)', () => {
    const spy = vi.spyOn(authService, 'getCurrentUser').mockReturnValue({
      id: 'u-viewer',
      roleId: 'role-viewer',
      status: 'active',
      is_super_admin: false,
      membershipsLoaded: true,
      memberships: [{ workspace_id: 'ws-a', role_id: 'r-vis', status: 'active' }],
      workspace_ids: ['ws-a'],
    } as never)

    // O service legado lançaria aqui. Não lança: a decisão é do servidor.
    const t = checklistTemplateService.create(validTemplateForm())
    expect(t.id).toBeDefined()
    expect(checklistTemplateService.getAll()).toHaveLength(1)

    spy.mockRestore()
  })

  it('o módulo não referencia nenhuma API legada de autorização', () => {
    // Trava estrutural: se alguém reintroduzir a cadeia, isto quebra.
    const fonte = require('fs')
      .readFileSync(require('path').resolve(__dirname, '../checklistService.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(fonte).not.toMatch(/permissions\/service/)
    expect(fonte).not.toMatch(/requireWrite|canWriteApp|resolveAppAccess/)
    expect(fonte).not.toMatch(/appAccess|app_access/)
  })
})

