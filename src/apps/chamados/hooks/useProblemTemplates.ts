import { useCallback, useEffect, useState } from 'react'
import type { ProblemTemplate, ProblemTemplateFormData } from '../types'
import { problemTemplateService } from '../services/problemTemplateService'

export function useProblemTemplates() {
  const [templates, setTemplates] = useState<ProblemTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    problemTemplateService.initDefaults()
    const data = problemTemplateService.getAll()
    setTemplates(data.sort((a, b) => a.assetType.localeCompare(b.assetType)))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: ProblemTemplateFormData) => {
    const template = problemTemplateService.create(data)
    setTemplates((prev) => [...prev, template].sort((a, b) => a.assetType.localeCompare(b.assetType)))
    return template
  }, [])

  const update = useCallback((id: string, data: Partial<ProblemTemplate>) => {
    const template = problemTemplateService.update(id, data)
    if (template) {
      setTemplates((prev) => prev.map((t) => (t.id === id ? template : t)).sort((a, b) => a.assetType.localeCompare(b.assetType)))
    }
    return template
  }, [])

  const remove = useCallback((id: string) => {
    const ok = problemTemplateService.remove(id)
    if (ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    }
    return ok
  }, [])

  const getByAssetType = useCallback((assetType: string) => {
    return templates.find((t) => t.assetType === assetType)
  }, [templates])

  return { templates, loading, create, update, remove, getByAssetType, reload: load }
}
