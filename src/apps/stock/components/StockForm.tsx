import { useState, useMemo, useEffect, useRef } from 'react'
import type { StockItemFormData, StockSection } from '../types'
import { stockSections, sectionSubcategories, stockConditions, DEFAULT_PC_PARTS } from '../types'
import { pcService } from '../../pcare/services/pcService'
import { stockService } from '../services/stockService'
import { stockPhotoService, uploadFiles } from '../services/stockPhotoService'
import { icons } from '../../../lib/icons'
import { Popover, PopoverTrigger, PopoverContent } from '../../../lib/components/ui'

interface PhotoUploadButtonProps {
  uploading: boolean
  onSelect: (files: FileList) => void
}

function PhotoUploadButton({ uploading, onSelect }: PhotoUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onSelect(e.target.files)
            e.target.value = ''
          }
        }}
        className="hidden"
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-input/50 text-fg-muted transition-colors hover:bg-input disabled:opacity-50"
      >
        {uploading ? (
          <span className="text-[10px] font-medium">Enviando...</span>
        ) : (
          <>
            <icons.ui.camera size={18} />
            <span className="text-[10px] font-medium">Adicionar</span>
          </>
        )}
      </button>
    </>
  )
}

interface StockFormProps {
  initial?: Partial<StockItemFormData> & { id?: string }
  onSave: (data: StockItemFormData, photos?: string[]) => void
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
  linkedPcId: undefined,
  linkedPcLabel: undefined,
  pcParts: DEFAULT_PC_PARTS.map(name => ({ partName: name, present: false })),
})

export function StockForm({ initial, onSave, onCancel }: StockFormProps) {
  const [form, setForm] = useState<StockItemFormData>({ ...emptyForm(), ...initial })
  const [pcSearch, setPcSearch] = useState('')
  const [showPcPicker, setShowPcPicker] = useState(false)
  const [localPhotos, setLocalPhotos] = useState<string[]>(() => {
    return initial?.id ? stockPhotoService.get(initial.id) : []
  })
  const [uploading, setUploading] = useState(false)

  const pcs = useMemo(() => pcService.getAll(), [])

  const linkedPcIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of stockService.getAll()) {
      if (item.linkedPcId && item.id !== initial?.id) ids.add(item.linkedPcId)
    }
    return ids
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id])

  const filteredPcs = useMemo(() => {
    if (!pcSearch.trim()) return pcs.slice(0, 20)
    const q = pcSearch.toLowerCase()
    return pcs.filter(
      (p) =>
        p.labName.toLowerCase().includes(q) ||
        p.pcNumber.toLowerCase().includes(q) ||
        p.roomLocation.toLowerCase().includes(q) ||
        p.assetTag.toLowerCase().includes(q),
    ).slice(0, 20)
  }, [pcs, pcSearch])

  useEffect(() => {
    if (initial?.id) {
      setLocalPhotos(stockPhotoService.get(initial.id))
    }
  }, [initial?.id])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form, localPhotos.length > 0 ? localPhotos : undefined)
  }

  function set<K extends keyof StockItemFormData>(key: K, value: StockItemFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const subcategories = sectionSubcategories[form.section as StockSection] || []

  const placeholders: Record<StockSection, { name: string; serial: string; room: string; notes: string }> = {
    maquinas: { name: 'Ex: Dell Optiplex 7090', serial: 'Ex: PAT-001', room: 'Lab Info 1', notes: 'Especificações técnicas...' },
    perifericos: { name: 'Ex: Mouse Logitech M90', serial: 'Ex: SN-123', room: 'Lab Info 1', notes: 'Detalhes do periférico...' },
    material_escritorio: { name: 'Ex: Resma Papel A4', serial: '', room: 'Sala 5', notes: 'Quantidade, marca...' },
    adaptadores: { name: 'Ex: Adaptador HDMI-VGA', serial: '', room: 'Lab Info 1', notes: 'Tipo de adaptador...' },
    equipamentos: { name: 'Ex: SSD Kingston 480GB', serial: 'Ex: SN-456', room: 'Lab Info 1', notes: 'Especificações do componente...' },
    cabos: { name: 'Ex: Cabo HDMI 3m', serial: '', room: 'Lab Redes', notes: 'Estado do cabo...' },
    outros: { name: 'Ex: Item genérico', serial: 'Ex: TAG-001', room: 'Sala', notes: 'Detalhes adicionais...' },
  }

  const p = placeholders[form.section as StockSection]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Nome</label>
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
            onChange={(e) => {
              const newSection = e.target.value as StockSection
              if (newSection !== 'maquinas') {
                setForm(prev => ({ ...prev, section: newSection, pcParts: undefined }))
              } else if (!form.linkedPcId) {
                setForm(prev => ({
                  ...prev,
                  section: newSection,
                  pcParts: prev.pcParts && prev.pcParts.length > 0
                    ? prev.pcParts
                    : DEFAULT_PC_PARTS.map(name => ({ partName: name, present: false })),
                }))
              } else {
                set('section', newSection)
              }
            }}
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
              placeholder={form.section === 'cabos' ? 'Ex: Extensão 5 tomadas' : 'Ex: Notebook'}
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
            placeholder={p.serial || 'Nº de série'}
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
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
      </div>

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

      <div>
        <label className="mb-1 block text-xs font-medium text-fg-muted">Vincular a um PC</label>
        {form.linkedPcId ? (
          <div className="flex items-center gap-2 rounded-xl bg-violet-50 dark:bg-violet-950/20 px-3.5 py-2.5">
            <icons.nav.pcs size={16} className="shrink-0 text-violet-500" />
            <span className="flex-1 text-sm text-fg">{form.linkedPcLabel || 'PC vinculado'}</span>
            <button
              type="button"
              onClick={() => { set('linkedPcId', undefined); set('linkedPcLabel', undefined) }}
              className="rounded-lg p-1 text-fg-muted hover:text-red-500 transition-colors"
              aria-label="Desvincular PC"
            >
              <icons.ui.close size={14} />
            </button>
          </div>
        ) : (
          <Popover open={showPcPicker} onOpenChange={setShowPcPicker}>
            <PopoverTrigger asChild>
              <input
                type="text"
                value={pcSearch}
                onChange={(e) => { setPcSearch(e.target.value); setShowPcPicker(true) }}
                onFocus={() => setShowPcPicker(true)}
                placeholder="Buscar PC por lab, número ou sala..."
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-violet-500/30"
              />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-[var(--radix-popover-trigger-width)] p-1 border-line bg-card shadow-lg shadow-black/20" onOpenAutoFocus={(e) => e.preventDefault()}>
              {filteredPcs.length > 0 ? (
                <div className="max-h-48 overflow-y-auto">
                  {filteredPcs.map((pc) => (
                    <button
                      key={pc.id}
                      type="button"
                      onClick={() => {
                        set('linkedPcId', pc.id)
                        set('linkedPcLabel', `${pc.labName} - ${pc.pcNumber}`)
                        setPcSearch('')
                        setShowPcPicker(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg-dim hover:bg-violet-50 dark:hover:bg-violet-950/20 hover:text-fg transition-colors"
                    >
                      <icons.nav.pcs size={14} className="text-violet-500" />
                      <span>{pc.labName} — {pc.pcNumber}</span>
                      {linkedPcIds.has(pc.id) && <span className="ml-auto text-[10px] font-medium text-amber-600 dark:text-amber-400">já vinculado</span>}
                      {!linkedPcIds.has(pc.id) && pc.roomLocation && <span className="text-xs text-fg-muted ml-auto">{pc.roomLocation}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-fg-muted">
                  {pcSearch.trim() ? 'Nenhum PC encontrado' : 'Digite para buscar...'}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
        <p className="mt-1 text-[10px] text-fg-muted">Opção de associar este item a um computador específico</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-fg-muted">Fotos</label>
        {localPhotos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {localPhotos.map((photo, i) => (
              <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-xl bg-input">
                <img
                  src={photo}
                  alt={`Foto ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setLocalPhotos((prev) => prev.filter((_, idx) => idx !== i))
                  }}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remover foto"
                >
                  <icons.ui.close size={12} />
                </button>
              </div>
            ))}
            <PhotoUploadButton
              uploading={uploading}
              onSelect={async (files) => {
                setUploading(true)
                try {
                  const urls = await uploadFiles(files)
                  setLocalPhotos((prev) => [...prev, ...urls])
                } catch (e) {
                  console.error('Erro ao enviar fotos:', e)
                  alert('Erro ao enviar fotos. Tente novamente.')
                }
                setUploading(false)
              }}
            />
          </div>
        ) : (
          <PhotoUploadButton
            uploading={uploading}
            onSelect={async (files) => {
              setUploading(true)
              try {
                const urls = await uploadFiles(files)
                setLocalPhotos(urls)
              } catch (e) {
                console.error('Erro ao enviar fotos:', e)
                alert('Erro ao enviar fotos. Tente novamente.')
              }
              setUploading(false)
            }}
          />
        )}
  
        <p className="mt-1 text-[10px] text-fg-muted">Fotos armazenadas no Cloudinary (hospedagem externa) — upload em até 10MB</p>
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

      {form.section === 'maquinas' && !form.linkedPcId && form.pcParts && form.pcParts.length > 0 && (
        <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/20 p-3 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Peças do PC</p>
          <p className="text-[11px] text-fg-dim">Marque as peças que estão presentes neste PC</p>
          <div className="space-y-2">
            {form.pcParts.map((part) => (
              <label key={part.partName} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={part.present}
                  onChange={() => {
                    setForm(prev => ({
                      ...prev,
                      pcParts: prev.pcParts?.map(p =>
                        p.partName === part.partName ? { ...p, present: !p.present } : p
                      )
                    }))
                  }}
                  className="h-4 w-4 rounded border-line text-cyan-600 focus:ring-cyan-500/30"
                />
                <span className="text-sm text-fg">{part.partName}</span>
                {part.present ? (
                  <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Presente</span>
                ) : (
                  <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 font-medium">Faltando</span>
                )}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span>{form.pcParts.filter(p => p.present).length} de {form.pcParts.length} peças</span>
            {form.pcParts.every(p => p.present) && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">— Completo</span>
            )}
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
