import { useState } from 'react'
import type { GeneralItemFormData } from '../types'
import { stockCategories, stockUnits } from '../types'

interface StockFormProps {
  initial?: Partial<GeneralItemFormData>
  onSave: (data: GeneralItemFormData) => void
  onCancel: () => void
}

const emptyForm = (): GeneralItemFormData => ({
  name: '',
  category: '',
  quantity: 0,
  minQuantity: 0,
  unit: 'un',
  location: '',
  notes: '',
})

export function StockForm({ initial, onSave, onCancel }: StockFormProps) {
  const [form, setForm] = useState<GeneralItemFormData>({ ...emptyForm(), ...initial })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  function set<K extends keyof GeneralItemFormData>(key: K, value: GeneralItemFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-fg-muted">Nome</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ex: Caneta azul"
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-fg-muted">Categoria</label>
          <select
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
            required
          >
            <option value="">Selecione</option>
            {stockCategories.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs text-fg-muted">Quantidade</label>
          <input
            type="number"
            value={form.quantity}
            onChange={(e) => set('quantity', Math.max(0, Number(e.target.value)))}
            min={0}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-fg-muted">Qtd. Mínima</label>
          <input
            type="number"
            value={form.minQuantity}
            onChange={(e) => set('minQuantity', Math.max(0, Number(e.target.value)))}
            min={0}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-fg-muted">Unidade</label>
          <select
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
          >
            {stockUnits.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-fg-muted">Localização</label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => set('location', e.target.value)}
          placeholder="Ex: Armário A, Gaveta 3"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-slate-600 transition-colors focus:border-cyan-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-fg-muted">Observações</label>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Onde comprar, marca, etc."
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-slate-600 transition-colors focus:border-cyan-500"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 py-2 text-sm font-medium text-fg shadow-sm shadow-emerald-500/20 transition-all hover:shadow-md"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-4 py-2 text-sm text-fg-dim transition-colors hover:bg-input hover:text-fg"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
