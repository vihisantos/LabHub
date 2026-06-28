import { useState } from 'react'
import type { StockItemFormData, StockSection } from '../types'
import { stockSections, sectionSubcategories, stockConditions } from '../types'

interface StockFormProps {
  initial?: Partial<StockItemFormData>
  onSave: (data: StockItemFormData) => void
  onCancel: () => void
}

const emptyForm = (): StockItemFormData => ({
  name: '',
  section: 'maquinas',
  subcategory: '',
  serialNumber: '',
  room: '',
  status: 'ativo',
  condition: 'Bom',
  notes: '',
})

export function StockForm({ initial, onSave, onCancel }: StockFormProps) {
  const [form, setForm] = useState<StockItemFormData>({ ...emptyForm(), ...initial })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  function set<K extends keyof StockItemFormData>(key: K, value: StockItemFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const subcategories = sectionSubcategories[form.section as StockSection] || []

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Nome</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ex: Notebook Dell"
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Seção</label>
          <select
            value={form.section}
            onChange={(e) => set('section', e.target.value as StockSection)}
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          >
            {stockSections.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Subcategoria</label>
          <input
            type="text"
            value={form.subcategory}
            onChange={(e) => set('subcategory', e.target.value)}
            placeholder={subcategories.length > 0 ? subcategories[0] : 'Ex: Notebook'}
            list={`subcats-${form.section}`}
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
          {subcategories.length > 0 && (
            <datalist id={`subcats-${form.section}`}>
              {subcategories.map((s) => <option key={s} value={s} />)}
            </datalist>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Condição</label>
          <select
            value={form.condition}
            onChange={(e) => set('condition', e.target.value)}
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          >
            {stockConditions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Série / Patrimônio</label>
          <input
            type="text"
            value={form.serialNumber}
            onChange={(e) => set('serialNumber', e.target.value)}
            placeholder="TAG-001"
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
          <input
            type="text"
            value={form.room}
            onChange={(e) => set('room', e.target.value)}
            placeholder="Lab Info 1"
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-fg-muted">Observações</label>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Detalhes adicionais..."
          className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
