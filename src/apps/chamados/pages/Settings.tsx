import { useState } from 'react'
import { useProblemTemplates } from '../hooks/useProblemTemplates'
import { icons } from '../../../lib/icons'

export function Settings() {
  const { templates, create, update, remove } = useProblemTemplates()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newType, setNewType] = useState('')
  const [newCategories, setNewCategories] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [editCategories, setEditCategories] = useState('')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newType.trim() || !newCategories.trim()) return
    const categories = newCategories.split('\n').map((c) => c.trim()).filter(Boolean)
    create({ assetType: newType.trim(), categories })
    setNewType('')
    setNewCategories('')
    setShowForm(false)
  }

  function startEditing(id: string, categories: string[]) {
    setEditingId(id)
    setEditCategories(categories.join('\n'))
  }

  function saveEdit(id: string) {
    const categories = editCategories.split('\n').map((c) => c.trim()).filter(Boolean)
    update(id, { categories })
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-muted">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400"
        >
          <icons.ui.plus size={14} />
          Novo Template
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-fg-muted">Tipo de Ativo *</label>
            <input
              type="text"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="Ex: Projetor"
              required
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-fg-muted">Categorias (uma por linha) *</label>
            <textarea
              value={newCategories}
              onChange={(e) => setNewCategories(e.target.value)}
              placeholder={"Não liga\nSem imagem\nHDMI\nOutro"}
              rows={4}
              required
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-fg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white"
            >
              Criar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">{template.assetType}</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEditing(template.id, template.categories)}
                  className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
                >
                  <icons.ui.edit size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(template.id)}
                  className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <icons.ui.trash size={14} />
                </button>
              </div>
            </div>

            {editingId === template.id ? (
              <div className="space-y-2">
                <textarea
                  value={editCategories}
                  onChange={(e) => setEditCategories(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit(template.id)}
                    className="flex-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {template.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
