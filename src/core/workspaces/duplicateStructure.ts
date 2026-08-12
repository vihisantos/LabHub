import { getCol, setCol } from '../../lib/db'

export interface HasWorkspaceId {
  id: string
  workspace_id?: string
}

export interface DuplicateStructureResult {
  rooms: number
  problemTemplates: number
  checklistTemplates: number
}

type StructureSource = {
  collection: string
  uniqueKey: (item: HasWorkspaceId) => string
}

const STRUCTURE_SOURCES: StructureSource[] = [
  { collection: 'rooms', uniqueKey: (r) => String((r as any).name || r.id) },
  { collection: 'problem_templates', uniqueKey: (t) => String((t as any).assetType || t.id) },
  { collection: 'checklist_templates', uniqueKey: (t) => String((t as any).name || t.id) },
]

/**
 * Copia a estrutura (salas, categorias de problema, templates de checklist)
 * de um workspace de origem para um de destino.
 * - Só itens explicitamente vinculados ao workspace de origem são copiados
 *   (itens globais, sem workspace_id, já aparecem em todos os ambientes).
 * - Itens com a mesma chave já existentes no destino são pulados (dedupe).
 * - Novos ids são gerados e o workspace_id aponta para o destino.
 */
export function duplicateWorkspaceStructure(
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
): DuplicateStructureResult {
  const result: DuplicateStructureResult = { rooms: 0, problemTemplates: 0, checklistTemplates: 0 }

  for (const source of STRUCTURE_SOURCES) {
    const all = getCol<HasWorkspaceId>(source.collection)
    const sourceItems = all.filter((item) => item.workspace_id === sourceWorkspaceId)
    if (sourceItems.length === 0) continue

    const targetKeys = new Set(
      all.filter((item) => item.workspace_id === targetWorkspaceId).map(source.uniqueKey),
    )
    const now = new Date().toISOString()
    let copied = 0

    for (const item of sourceItems) {
      if (targetKeys.has(source.uniqueKey(item))) continue
      const { id, workspace_id, ...rest } = item as unknown as Record<string, unknown>
      const copy = {
        ...rest,
        workspace_id: targetWorkspaceId,
        updatedAt: now,
      }
      all.push({ ...copy, id: crypto.randomUUID() } as HasWorkspaceId)
      targetKeys.add(source.uniqueKey(item))
      copied++
    }

    if (copied > 0) setCol(source.collection, all)
    if (source.collection === 'rooms') result.rooms = copied
    if (source.collection === 'problem_templates') result.problemTemplates = copied
    if (source.collection === 'checklist_templates') result.checklistTemplates = copied
  }

  return result
}
