import { useCallback, useEffect, useState } from 'react'
import type { ChecklistTemplate, ChecklistTemplateForm } from '../types/checklist'
import { checklistTemplateService } from '../services/checklistService'

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
