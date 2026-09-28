import type { ChecklistTemplate, ChecklistTemplateForm, PCChecklist } from '../types/checklist'
import { createSyncService } from '../../../lib/sync'
import { permissionService } from '../../../core/permissions/service'

const templateStore = createSyncService<ChecklistTemplate>('checklist_templates')
const pcChecklistStore = createSyncService<PCChecklist>('pc_checklists')

function serialize<T>(data: T) {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now }
}

/**
 * RBAC 2.0 (F2-D-G) — escrita de TEMPLATE de checklist autorizada pela Action
 * `pcare.checklist.create|edit|delete` (migration 079).
 *
 * A autorização saiu do service e foi para os dois lugares que realmente
 * mandam, seguindo o padrão dos demais módulos migrados (partService,
 * assetService, maintenanceService, ticketService):
 *
 *   · UI  — `useCanAccessAction('pcare.checklist.create' | '.edit' | '.delete')`
 *           em `pages/ChecklistTemplates.tsx` (gate assíncrono, fail-closed);
 *   · BANCO — policies de escrita de `pcare.checklist_templates` exigem a Action
 *           via `public.user_has_action(...)` (079). Como a tabela é
 *           sincronizada com a chave ANON (`REMOTE_DB` em lib/sync.ts), quem
 *           executa o INSERT/UPDATE/DELETE é o próprio usuário e o RLS é a
 *           autoridade real: chamar direto no banco, sem a Action, é negado.
 *
 * Por isso NÃO há `requireWrite` aqui: ele decidia por `Role.appAccess` /
 * `profiles.app_access`, que o banco nunca consultou — o gate legado divergia
 * do enforcement. A feature é deprecated (será removida), mas enquanto tem
 * consumidor de produção, a Action é a autoridade.
 */
export const checklistTemplateService = {
  getAll: () => templateStore.getAll(),
  getById: (id: string) => templateStore.getById(id),
  create: (data: ChecklistTemplateForm) => {
    const template = serialize(data) as unknown as ChecklistTemplate
    return templateStore.create(template)
  },
  update: (id: string, data: Partial<ChecklistTemplate>) => {
    return templateStore.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },
  remove: (id: string) => {
    return templateStore.remove(id)
  },
  getByLab: (labName: string) => templateStore.query((t) => t.labName === labName),
}

/**
 * `pcChecklistService` — NÃO MIGRADO (F2-D-G §11).
 *
 * A auditoria F2-D-F provou que não há consumidor de produção (só
 * `usePCChecklists`, que só testes importam), e a feature está marcada como
 * DEPRECATED no catálogo. O guard legado `requireWrite('pc-care')` foi mantido
 * deliberadamente: migrar código morto para Action criaria Actions sem
 * dono real e um segundo caminho de autorização sem consumidor. A tabela
 * remota `pcare.pc_checklists` foi endurecida no RLS pela 079 (defesa em
 * profundidade do dado), mas este service fica como está até a remoção da
 * feature — quando o guard e o service saem juntos.
 */
export const pcChecklistService = {
  getAll: () => pcChecklistStore.getAll(),
  getByPC: (pcId: string) => pcChecklistStore.query((c) => c.pcId === pcId),
  create: (data: Omit<PCChecklist, 'id' | 'createdAt' | 'updatedAt'>) => {
    permissionService.requireWrite('pc-care')
    const checklist = serialize(data) as unknown as PCChecklist
    return pcChecklistStore.create(checklist)
  },
  update: (id: string, data: Partial<PCChecklist>) => {
    permissionService.requireWrite('pc-care')
    return pcChecklistStore.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },
  remove: (id: string) => {
    permissionService.requireWrite('pc-care')
    return pcChecklistStore.remove(id)
  },
}
