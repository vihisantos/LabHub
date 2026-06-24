import { useState } from 'react'
import { useChecklistTemplates } from '../hooks/useChecklists'
import { EmptyState } from '../components/EmptyState'
import { SkeletonCard } from '../components/Skeletons'
import type { ChecklistItemDef, ChecklistTemplateForm } from '../types/checklist'

const emptyForm = (): ChecklistTemplateForm => ({
  name: '',
  labName: '',
  items: [],
})

const categories = [
  { value: 'cleaning', label: 'Limpeza' },
  { value: 'restoration', label: 'Restauração' },
  { value: 'both', label: 'Ambos' },
]

export function ChecklistTemplates() {
  const { templates, loading, create, update, remove } = useChecklistTemplates()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ChecklistTemplateForm>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)

  function reset() {
    setForm(emptyForm())
    setEditingId(null)
    setShowForm(false)
  }

  function addItem() {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: crypto.randomUUID(),
          label: '',
          category: 'both',
          optional: false,
        },
      ],
    }))
  }

  function updateItem(index: number, data: Partial<ChecklistItemDef>) {
    setForm((prev) => {
      const items = [...prev.items]
      items[index] = { ...items[index], ...data }
      return { ...prev, items }
    })
  }

  function removeItem(index: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validItems = form.items.filter((i) => i.label.trim())
    const data = { ...form, items: validItems }
    if (editingId) {
      update(editingId, data)
    } else {
      create(data)
    }
    reset()
  }

  function startEdit(t: (typeof templates)[0]) {
    setForm({
      name: t.name,
      labName: t.labName,
      items: t.items.map((i) => ({ ...i })),
    })
    setEditingId(t.id)
    setShowForm(true)
  }

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Checklists</h2>
        <button
          type="button"
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm()) }}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          {showForm ? 'Cancelar' : '+ Novo Template'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {editingId ? 'Editar Template' : 'Novo Template'}
          </h3>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Limpeza completa"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Laboratório</label>
                <input
                  type="text"
                  value={form.labName}
                  onChange={(e) => setForm({ ...form, labName: e.target.value })}
                  placeholder="LAB-01"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs text-slate-500">Itens do Checklist</label>
                <button type="button" onClick={addItem} className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
                  + Adicionar item
                </button>
              </div>

              {form.items.length === 0 && (
                <p className="text-xs text-slate-500">Nenhum item adicionado.</p>
              )}

              <div className="flex flex-col gap-2">
                {form.items.map((item, index) => (
                  <div key={index} className="flex items-start gap-2 rounded-lg bg-slate-800/50 p-2 ring-1 ring-slate-700/50">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateItem(index, { label: e.target.value })}
                        placeholder="Descrição do item..."
                        className="mb-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-500"
                      />
                      <div className="flex gap-2">
                        <select
                          value={item.category}
                          onChange={(e) => updateItem(index, { category: e.target.value as any })}
                          className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs text-slate-300 outline-none"
                        >
                          {categories.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-slate-400">
                          <input
                            type="checkbox"
                            checked={item.optional}
                            onChange={(e) => updateItem(index, { optional: e.target.checked })}
                          />
                          Opcional
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="mt-1 text-xs text-red-400 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button type="submit" className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md">
              {editingId ? 'Salvar' : 'Criar Template'}
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 && !showForm ? (
        <EmptyState
          icon="📋"
          title="Nenhum checklist"
          description="Crie templates de checklist para os laboratórios."
          action={{ label: 'Criar Template', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-slate-200">{t.name}</h3>
                  <p className="text-xs text-slate-500">{t.labName || 'Todos os laboratórios'} · {t.items.length} itens</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => startEdit(t)} className="text-xs font-medium text-cyan-400 hover:text-cyan-300">Editar</button>
                  <button type="button" onClick={() => { if (window.confirm(`Remover "${t.name}"?`)) remove(t.id) }} className="text-xs font-medium text-red-400 hover:text-red-300">Excluir</button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {t.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="h-1 w-1 rounded-full bg-slate-600" />
                    <span>{item.label}</span>
                    {item.optional && <span className="text-slate-600">(opcional)</span>}
                    <span className="text-slate-600">· {categories.find(c => c.value === item.category)?.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
