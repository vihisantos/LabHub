import { checklistTemplateService, pcChecklistService } from '../checklistService'
import type { ChecklistTemplateForm } from '../../types/checklist'
import { permissionService } from '../../../../core/permissions/service'
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

describe('pcChecklistService', () => {
  it('create adiciona checklist para PC', () => {
    const cl = pcChecklistService.create({
      pcId: 'pc-1',
      templateId: 'template-1',
      templateName: 'Checklist Padrão',
      labName: 'Lab A',
      items: [{ itemId: 'item-1', label: 'Limpar', category: 'cleaning', done: false, doneAt: null }],
      completedAt: null,
    })
    expect(cl.id).toBeDefined()
    expect(cl.pcId).toBe('pc-1')
    expect(cl.items).toHaveLength(1)
  })

  it('getByPC retorna checklists de um PC', () => {
    pcChecklistService.create({ pcId: 'pc-1', templateId: 't1', templateName: 'T1', labName: 'Lab A', items: [], completedAt: null })
    pcChecklistService.create({ pcId: 'pc-1', templateId: 't2', templateName: 'T2', labName: 'Lab A', items: [], completedAt: null })
    pcChecklistService.create({ pcId: 'pc-2', templateId: 't3', templateName: 'T3', labName: 'Lab A', items: [], completedAt: null })
    const result = pcChecklistService.getByPC('pc-1')
    expect(result).toHaveLength(2)
  })

  it('update modifica itens do checklist', () => {
    const cl = pcChecklistService.create({
      pcId: 'pc-1', templateId: 't1', templateName: 'T1', labName: 'Lab A',
      items: [{ itemId: 'i1', label: 'Limpar', category: 'cleaning', done: false, doneAt: null }],
      completedAt: null,
    })
    const updated = pcChecklistService.update(cl.id, {
      items: [{ itemId: 'i1', label: 'Limpar', category: 'cleaning', done: true, doneAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any }],
    })
    expect(updated?.items[0].done).toBe(true)
  })
})

/**
 * F2-D-G — o gate legado saiu do service de TEMPLATE.
 *
 * A autorização por Action vive na UI (`useCanAccessAction`) e no RLS de
 * `pcare.checklist_templates` (migration 079). Aqui provamos que o caminho
 * legado (`requireWrite` → `canWriteApp` → `resolveAppAccess` →
 * `Role.appAccess`/`profiles.app_access`) NÃO é mais consultado.
 */
describe('checklistTemplateService — sem dependência do gate legado (RBAC 2.0)', () => {
  it('create/update/remove não chamam requireWrite', () => {
    const requireWrite = vi.spyOn(permissionService, 'requireWrite')

    const t = checklistTemplateService.create(validTemplateForm())
    checklistTemplateService.update(t.id, { name: 'Renomeado' })
    checklistTemplateService.remove(t.id)

    expect(requireWrite).not.toHaveBeenCalled()
    requireWrite.mockRestore()
  })

  it('funciona mesmo com o usuário SEM `pc-care: full` (o RLS é quem nega)', () => {
    // Um usuário somente-leitura (o `default` do setup é super admin, então
    // forçamos um não-escritor): o service legado lançaria aqui.
    const spy = vi.spyOn(authService, 'getCurrentUser').mockReturnValue({
      id: 'u-viewer',
      roleId: 'role-viewer',
      status: 'active',
      is_super_admin: false,
      membershipsLoaded: true,
      memberships: [{ workspace_id: 'ws-a', role_id: 'r-vis', status: 'active' }],
      workspace_ids: ['ws-a'],
    } as never)

    // Não lança: quem decide é a Action (UI) e o RLS, não o `app_access`.
    const t = checklistTemplateService.create(validTemplateForm())
    expect(t.id).toBeDefined()
    expect(checklistTemplateService.getAll()).toHaveLength(1)

    spy.mockRestore()
  })

  it('pcChecklistService (fluxo morto) MANTÉM o guard legado — não migrado nesta fase', () => {
    // §11 do F2-D-G: `pcChecklistService` não tem consumidor de produção, então
    // não ganhou Action nem migration de gate. O guard fica até a remoção da
    // feature; o teste trava essa decisão para ela não sumir por engano.
    const requireWrite = vi.spyOn(permissionService, 'requireWrite')
    const semEscrita = vi.spyOn(authService, 'getCurrentUser').mockReturnValue({
      id: 'u-viewer', roleId: 'role-viewer', status: 'active', is_super_admin: false,
      membershipsLoaded: true,
      memberships: [{ workspace_id: 'ws-a', role_id: 'r-vis', status: 'active' }],
      workspace_ids: ['ws-a'],
    } as never)

    expect(() =>
      pcChecklistService.create({
        pcId: 'pc-1', templateId: 't1', templateName: 'T1', labName: 'Lab A',
        items: [], completedAt: null,
      }),
    ).toThrow(/somente leitura/)
    expect(requireWrite).toHaveBeenCalledWith('pc-care')

    semEscrita.mockRestore()
    requireWrite.mockRestore()
  })
})
