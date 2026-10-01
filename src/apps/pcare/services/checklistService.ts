import type { ChecklistTemplate, ChecklistTemplateForm } from '../types/checklist'
import { createSyncService } from '../../../lib/sync'

const templateStore = createSyncService<ChecklistTemplate>('checklist_templates')

function serialize<T>(data: T) {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now }
}

/**
 * RBAC 2.0 (F2-D-G) — escrita de TEMPLATE de checklist autorizada pela Action
 * `pcare.checklist.create|edit|delete` (migration 082).
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

// F2-D-N2: `pcChecklistService` foi REMOVIDO, junto com o store de
// `pcare.pc_checklists` e o hook `usePCChecklists`.
//
// Motivo: era o ÚNICO detentor do gate legado `permissionService.requireWrite
// ('pc-care')`, que decidia por `Role.appAccess` + `profiles.app_access`. Como o
// F2-D-F provou que não há consumidor de produção (só testes importavam o hook),
// e o F2-D-N2 removeu `requireWrite`/`canWriteApp`/`resolveAppAccess`, não havia
// o que manter.
//
// A feature de checklist por PC continua DEPRECATED no catálogo, e a tabela
// remota `pcare.pc_checklists` segue endurecida no RLS pela 082 (defesa em
// profundidade do dado) — nada disso foi tocado aqui. Nenhuma Action fictícia
// foi criada para "salvar" o código morto.
