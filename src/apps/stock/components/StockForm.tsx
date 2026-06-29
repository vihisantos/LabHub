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
  cableType: '',
  cableLength: '',
  connectorType: '',
  outletCount: undefined,
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
          {subcategories.length > 0 ? (
            <select
              value={form.subcategory}
              onChange={(e) => set('subcategory', e.target.value)}
              className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="">Selecione...</option>
              {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={form.subcategory}
              onChange={(e) => set('subcategory', e.target.value)}
              placeholder="Ex: Notebook"
              className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
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

      {form.section === 'cabos' && (
        <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Informações do Cabo</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Tipo de Cabo</label>
              <select
                value={form.cableType || ''}
                onChange={(e) => set('cableType', e.target.value)}
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">Selecione...</option>
                <option value="HDMI">HDMI</option>
                <option value="VGA">VGA</option>
                <option value="USB">USB</option>
                <option value="USB-C">USB-C</option>
                <option value="Rede">Rede</option>
                <option value="Extensão">Extensão</option>
                <option value="Energia">Energia</option>
                <option value="DisplayPort">DisplayPort</option>
                <option value="P2">P2</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Comprimento (metros)</label>
              <input
                type="text"
                value={form.cableLength || ''}
                onChange={(e) => set('cableLength', e.target.value)}
                placeholder="Ex: 1.5, 3, 5"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Conectores</label>
              <select
                value={form.connectorType || ''}
                onChange={(e) => set('connectorType', e.target.value)}
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">Selecione...</option>
                <option value="Macho/Macho">Macho / Macho</option>
                <option value="Macho/Fêmea">Macho / Fêmea</option>
                <option value="Fêmea/Fêmea">Fêmea / Fêmea</option>
                <option value="Macho">Macho</option>
                <option value="Fêmea">Fêmea</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Tomadas</label>
              <input
                type="number"
                value={form.outletCount ?? ''}
                onChange={(e) => set('outletCount', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Ex: 4"
                min={1}
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
        </div>
      )}

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
