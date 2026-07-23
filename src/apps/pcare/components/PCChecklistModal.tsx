import { useState } from 'react'
import type { ChecklistTemplate, PCChecklist } from '../types/checklist'
import { Modal } from './Modal'
import { icons } from '../../../lib/icons'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../lib/components/ui'

interface PCChecklistModalProps {
  open: boolean
  onClose: () => void
  templates: ChecklistTemplate[]
  existingChecklists: PCChecklist[]
  onApplyTemplate: (templateId: string) => void
  onToggleItem: (checklistId: string, itemId: string) => void
}

export function PCChecklistModal({
  open,
  onClose,
  templates,
  existingChecklists,
  onApplyTemplate,
  onToggleItem,
}: PCChecklistModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const activeTemplateIds = new Set(existingChecklists.map((c) => c.templateId))
  const availableTemplates = templates.filter((t) => !activeTemplateIds.has(t.id))

  function handleApply() {
    if (!selectedTemplate) return
    onApplyTemplate(selectedTemplate)
    setSelectedTemplate('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Checklists do PC">
      <div className="flex flex-col gap-4">
        {existingChecklists.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-fg-dim">Checklists ativos</p>
            {existingChecklists.map((cl) => (
              <div key={cl.id} className="rounded-lg border border-line bg-card/50 p-3">
                <p className="mb-2 text-sm font-medium text-fg">{cl.templateName}</p>
                <div className="flex flex-col gap-1">
                  {cl.items.map((item) => (
                    <button
                      key={`${item.itemId}-${item.done}`}
                      type="button"
                      onClick={() => onToggleItem(cl.id, item.itemId)}
                      className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                        item.done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'text-fg-dim hover:bg-card'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                        item.done ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500 checkbox-animated' : 'border-line'
                      }`}>
                        {item.done && <icons.ui.check size={12} className="text-fg" />}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
                {cl.items.every((i) => i.done) && (
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400"><icons.ui.check size={12} className="inline" /> Todos concluídos</p>
                )}
              </div>
            ))}
          </div>
        )}

        {availableTemplates.length > 0 && (
          <div>
            <label className="mb-1 block text-xs text-fg-muted">Aplicar novo checklist</label>
            <div className="flex gap-2">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {availableTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.labName || 'Todos'})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={handleApply}
                disabled={!selectedTemplate}
                className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-3 py-2 text-sm font-medium text-fg shadow-sm shadow-violet-500/20 transition-all hover:shadow-md disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}

        {availableTemplates.length === 0 && existingChecklists.length === 0 && (
          <p className="text-sm text-fg-muted">Nenhum template disponível. Crie um checklist primeiro.</p>
        )}

        {availableTemplates.length === 0 && existingChecklists.length > 0 && (
          <p className="text-xs text-fg-muted">Todos os templates já foram aplicados a este PC.</p>
        )}
      </div>
    </Modal>
  )
}
