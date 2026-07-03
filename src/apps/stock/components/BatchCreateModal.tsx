import { useState, useMemo } from 'react'
import type { StockItemFormData, StockSection } from '../types'
import { stockSections, sectionSubcategories, stockConditions } from '../types'
import { Modal } from '../../pcare/components/Modal'

interface BatchCreateModalProps {
  open: boolean
  onClose: () => void
  onCreate: (items: StockItemFormData[]) => void
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
  linkedPcId: undefined,
  linkedPcLabel: undefined,
})

export function BatchCreateModal({ open, onClose, onCreate }: BatchCreateModalProps) {
  const [form, setForm] = useState<StockItemFormData>(emptyForm())
  const [serialsText, setSerialsText] = useState('')

  const serialList = useMemo(() => {
    return serialsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }, [serialsText])

  const previewItems = useMemo(() => {
    return serialList.slice(0, 5)
  }, [serialList])

  function set<K extends keyof StockItemFormData>(key: K, value: StockItemFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || serialList.length === 0) return

    const items: StockItemFormData[] = serialList.map((serial) => ({
      ...form,
      serialNumber: serial,
    }))

    onCreate(items)
    setForm(emptyForm())
    setSerialsText('')
    onClose()
  }

  function handleClose() {
    setForm(emptyForm())
    setSerialsText('')
    onClose()
  }

  const subcategories = sectionSubcategories[form.section as StockSection] || []

  const placeholders: Record<StockSection, { name: string; room: string; notes: string }> = {
    maquinas: { name: 'Ex: Dell Optiplex 7090', room: 'Lab Info 1', notes: 'Especificações técnicas...' },
    perifericos: { name: 'Ex: Mouse Logitech M90', room: 'Lab Info 1', notes: 'Detalhes do periférico...' },
    material_escritorio: { name: 'Ex: Resma Papel A4', room: 'Sala 5', notes: 'Quantidade, marca...' },
    adaptadores: { name: 'Ex: Adaptador HDMI-VGA', room: 'Lab Info 1', notes: 'Tipo de adaptador...' },
    equipamentos: { name: 'Ex: SSD Kingston 480GB', room: 'Lab Info 1', notes: 'Especificações do componente...' },
    cabos: { name: 'Ex: Cabo HDMI 3m', room: 'Lab Redes', notes: 'Estado do cabo...' },
    outros: { name: 'Ex: Item genérico', room: 'Sala', notes: 'Detalhes adicionais...' },
  }

  const p = placeholders[form.section as StockSection]

  return (
    <Modal open={open} onClose={handleClose} title="Criar Lote">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ── Patrimônios ── */}
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            Patrimônios / Nº de Série <span className="text-red-500">*</span>
          </label>
          <textarea
            value={serialsText}
            onChange={(e) => setSerialsText(e.target.value)}
            placeholder={'Cole os patrimônios, um por linha:\n\nPAT-001\nPAT-002\nPAT-003'}
            rows={4}
            className="w-full resize-none rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-emerald-500/30"
            required
          />
          {serialList.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                {serialList.length} patrimônio{serialList.length > 1 ? 's' : ''}
              </span>
              {serialList.length > 5 && (
                <span className="text-[10px] text-fg-muted">(mostrando os 5 primeiros)</span>
              )}
            </div>
          )}
          {serialList.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {previewItems.map((s, i) => (
                <span key={i} className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">
                  {s}
                </span>
              ))}
              {serialList.length > 5 && (
                <span className="rounded-md bg-input px-2 py-0.5 text-[10px] text-fg-dim ring-1 ring-line/50">
                  +{serialList.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        <hr className="border-line" />

        <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
          Campos comuns do lote
        </p>

        {/* ── Nome e Seção ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Nome <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={p.name}
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

        {/* ── Subcategoria e Condição ── */}
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
                placeholder="Ex: Desktop"
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

        {/* ── Sala ── */}
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
          <input
            type="text"
            value={form.room}
            onChange={(e) => set('room', e.target.value)}
            placeholder={p.room}
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {/* ── Observações ── */}
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Observações</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={p.notes}
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {/* ── Botões ── */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={!form.name.trim() || serialList.length === 0}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 py-2.5 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50 btn-interactive"
          >
            {serialList.length > 0
              ? `Criar ${serialList.length} ${serialList.length === 1 ? 'item' : 'itens'}`
              : 'Criar Lote'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  )
}
