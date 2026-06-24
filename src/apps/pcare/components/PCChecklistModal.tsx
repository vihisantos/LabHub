import { useState } from 'react'
import type { ChecklistTemplate, PCChecklist } from '../types/checklist'
import { Modal } from './Modal'

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
            <p className="text-xs font-medium text-slate-400">Checklists ativos</p>
            {existingChecklists.map((cl) => (
              <div key={cl.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <p className="mb-2 text-sm font-medium text-slate-200">{cl.templateName}</p>
                <div className="flex flex-col gap-1">
                  {cl.items.map((item) => (
                    <button
                      key={item.itemId}
                      type="button"
                      onClick={() => onToggleItem(cl.id, item.itemId)}
                      className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                        item.done ? 'bg-emerald-900/30 text-emerald-300' : 'text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                        item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-500'
                      }`}>
                        {item.done ? '✓' : ''}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
                {cl.items.every((i) => i.done) && (
                  <p className="mt-2 text-xs text-emerald-400">✓ Todos concluídos</p>
                )}
              </div>
            ))}
          </div>
        )}

        {availableTemplates.length > 0 && (
          <div>
            <label className="mb-1 block text-xs text-slate-500">Aplicar novo checklist</label>
            <div className="flex gap-2">
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              >
                <option value="">Selecione um template</option>
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.labName || 'Todos'})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApply}
                disabled={!selectedTemplate}
                className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}

        {availableTemplates.length === 0 && existingChecklists.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum template disponível. Crie um checklist primeiro.</p>
        )}

        {availableTemplates.length === 0 && existingChecklists.length > 0 && (
          <p className="text-xs text-slate-500">Todos os templates já foram aplicados a este PC.</p>
        )}
      </div>
    </Modal>
  )
}
