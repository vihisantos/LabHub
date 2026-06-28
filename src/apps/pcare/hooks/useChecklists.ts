import { useCallback, useEffect, useState } from 'react'
import type { ChecklistTemplate, ChecklistTemplateForm, PCChecklist } from '../types/checklist'
import { checklistTemplateService, pcChecklistService } from '../services/checklistService'

export function useChecklistTemplates() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = checklistTemplateService.getAll()
    setTemplates(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const create = useCallback((data: ChecklistTemplateForm) => {
    const t = checklistTemplateService.create(data)
    setTemplates((prev) => [t, ...prev])
    return t
  }, [])

  const update = useCallback((id: string, data: Partial<ChecklistTemplate>) => {
    const t = checklistTemplateService.update(id, data)
    if (t) setTemplates((prev) => prev.map((x) => (x.id === id ? t : x)))
    return t
  }, [])

  const remove = useCallback((id: string) => {
    const ok = checklistTemplateService.remove(id)
    if (ok) setTemplates((prev) => prev.filter((x) => x.id !== id))
    return ok
  }, [])

  return { templates, loading, create, update, remove, reload: load }
}

export function usePCChecklists(pcId: string) {
  const [checklists, setChecklists] = useState<PCChecklist[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = pcChecklistService.getByPC(pcId)
    setChecklists(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    setLoading(false)
  }, [pcId])

  useEffect(() => { load() }, [load])

  const create = useCallback((data: Omit<PCChecklist, 'id' | 'createdAt' | 'updatedAt'>) => {
    const c = pcChecklistService.create(data)
    setChecklists((prev) => [c, ...prev])
    return c
  }, [])

  const update = useCallback((id: string, data: Partial<PCChecklist>) => {
    const c = pcChecklistService.update(id, data)
    if (c) setChecklists((prev) => prev.map((x) => (x.id === id ? c : x)))
    return c
  }, [])

  const remove = useCallback((id: string) => {
    const ok = pcChecklistService.remove(id)
    if (ok) setChecklists((prev) => prev.filter((x) => x.id !== id))
    return ok
  }, [])

  return { checklists, loading, create, update, remove, reload: load }
}
