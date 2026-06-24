import { useState } from 'react'
import { useParts } from '../hooks/useParts'
import { EmptyState } from '../components/EmptyState'
import { PullToRefresh } from '../components/PullToRefresh'
import { SkeletonCard } from '../components/Skeletons'
import type { PartFormData } from '../types'

const emptyPartForm: PartFormData = {
  name: '',
  category: '',
  quantity: 0,
  minQuantity: 0,
  serialNumber: '',
  notes: '',
}

const categories = [
  'fan', 'ssd', 'ram', 'keyboard', 'mouse',
  'cable', 'power_supply', 'monitor', 'other',
]

export function PartsList() {
  const { parts, loading, create, update, remove, reload } = useParts()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PartFormData>(emptyPartForm)
  const [editingId, setEditingId] = useState<string | null>(null)

  function resetForm() {
    setForm(emptyPartForm)
    setEditingId(null)
    setShowForm(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingId) {
      update(editingId, { ...form, updatedAt: undefined as any })
    } else {
      create(form)
    }
    resetForm()
  }

  function startEdit(part: typeof parts[0]) {
    setForm({
      name: part.name,
      category: part.category,
      quantity: part.quantity,
      minQuantity: part.minQuantity,
      serialNumber: part.serialNumber,
      notes: part.notes,
    })
    setEditingId(part.id)
    setShowForm(true)
  }

  function adjustQuantity(id: string, delta: number) {
    const part = parts.find((p) => p.id === id)
    if (!part) return
    const newQty = Math.max(0, part.quantity + delta)
    update(id, { quantity: newQty })
  }

  if (loading) return <div className="space-y-2">{[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}</div>

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Estoque de Peças</h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          {showForm ? 'Cancelar' : '+ Nova Peça'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {editingId ? 'Editar Peça' : 'Nova Peça'}
          </h3>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Fan Cooler 120mm"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Categoria</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                  required
                >
                  <option value="">Selecione</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Quantidade</label>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  min={0}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Qtd. Mínima</label>
                <input
                  type="number"
                  value={form.minQuantity}
                  onChange={(e) => setForm({ ...form, minQuantity: Number(e.target.value) })}
                  min={0}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Nº de Série</label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                placeholder="SN-12345"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Observações</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Local onde foi comprada, etc."
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
            >
              {editingId ? 'Salvar' : 'Adicionar ao Estoque'}
            </button>
          </div>
        </form>
      )}

      {parts.length === 0 && !showForm ? (
        <EmptyState
          icon="🔧"
          title="Estoque vazio"
          description="Adicione peças para controlar o inventário."
          action={{ label: 'Nova Peça', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {parts.map((part) => {
            const lowStock = part.quantity <= part.minQuantity
            return (
              <div
                key={part.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-200">{part.name}</h3>
                    {lowStock && (
                      <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                        Estoque baixo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {part.category} {part.serialNumber && `· ${part.serialNumber}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => adjustQuantity(part.id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-sm text-slate-400 ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-slate-200"
                    >
                      −
                    </button>
                    <span className="min-w-[2ch] text-center font-semibold text-white">
                      {part.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustQuantity(part.id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-sm text-slate-400 ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-slate-200"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(part)}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remover ${part.name}?`)) remove(part.id)
                    }}
                    className="text-xs font-medium text-red-400 hover:text-red-300"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PullToRefresh>
  )
}
