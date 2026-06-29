import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useStock } from '../hooks/useStock'
import { useKits } from '../hooks/useKits'
import { pcService } from '../../pcare/services/pcService'
import { icons } from '../../../lib/icons'
import { LoadingSpinner } from '../../pcare/components/LoadingSpinner'
import { stockSections } from '../types'

type EntityType = 'items' | 'pcs' | 'kits'

interface QROptions {
  size: number
  margin: number
  dark: string
  light: string
  labelFormat: 'name' | 'name+code' | 'code'
}

interface QRItem {
  id: string
  label: string
  sublabel: string
  code: string
  dataUrl: string
}

const sizeOptions = [
  { value: 200, label: 'Pequeno' },
  { value: 300, label: 'Médio' },
  { value: 400, label: 'Grande' },
]

const labelFormats = [
  { value: 'name' as const, label: 'Nome' },
  { value: 'name+code' as const, label: 'Nome + Código' },
  { value: 'code' as const, label: 'Código' },
]

export function QRGenerator() {
  const { items } = useStock()
  const { kits } = useKits()
  const pcs = useMemo(() => pcService.getAll(), [])

  const [entityType, setEntityType] = useState<EntityType>('items')
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [options, setOptions] = useState<QROptions>({
    size: 200,
    margin: 2,
    dark: '#1e293b',
    light: '#ffffff',
    labelFormat: 'name+code',
  })
  const [qrItems, setQrItems] = useState<QRItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showOptions, setShowOptions] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const sourceItems = useMemo(() => {
    if (entityType === 'items') {
      return items.filter((item) => {
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
        if (sectionFilter && item.section !== sectionFilter) return false
        return true
      })
    }
    if (entityType === 'pcs') {
      return pcs.filter((pc) => {
        if (search && !`${pc.labName} ${pc.pcNumber}`.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
    }
    return kits.filter((kit) => {
      if (search && !kit.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [entityType, items, pcs, kits, search, sectionFilter])

  useEffect(() => {
    let cancelled = false
    async function generate() {
      setGenerating(true)
      const results: QRItem[] = []
      for (const item of sourceItems) {
        if (cancelled) break
        let code = ''
        let label = ''
        let sublabel = ''

        if (entityType === 'items') {
          const si = item as typeof items[number]
          code = `${si.section}/${si.name}`
          label = si.name
          sublabel = si.section
        } else if (entityType === 'pcs') {
          const pc = item as typeof pcs[number]
          code = `${pc.labName}/${pc.pcNumber}`
          label = `${pc.labName} — ${pc.pcNumber}`
          sublabel = pc.assetTag || pc.roomLocation
        } else {
          const kit = item as typeof kits[number]
          code = kit.name
          label = kit.name
          sublabel = `${kit.items.length} itens`
        }

        try {
          const dataUrl = await QRCode.toDataURL(code, {
            width: options.size,
            margin: options.margin,
            color: { dark: options.dark, light: options.light },
          })
          const id = 'id' in item ? item.id : ''
          results.push({ id, label, sublabel, code, dataUrl })
        } catch {
          // skip
        }
      }
      if (!cancelled) {
        setQrItems(results)
        setSelected(new Set(results.map((r) => r.id)))
        setGenerating(false)
      }
    }
    generate()
    return () => { cancelled = true }
  }, [sourceItems, options.size, options.margin, options.dark, options.light, entityType])

  const toggleAll = useCallback(() => {
    if (selected.size === qrItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(qrItems.map((r) => r.id)))
    }
  }, [selected, qrItems])

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handleDownloadZip = useCallback(async () => {
    const selectedItems = qrItems.filter((r) => selected.has(r.id))
    if (selectedItems.length === 0) return

    const zip = new JSZip()
    for (const item of selectedItems) {
      const base64 = item.dataUrl.split(',')[1]
      zip.file(`${item.label.replace(/[^a-zA-Z0-9]/g, '_')}.png`, base64, { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, 'qr-codes.zip')
  }, [qrItems, selected])

  const section = entityType === 'items' ? (
    <select
      value={sectionFilter}
      onChange={(e) => setSectionFilter(e.target.value)}
      className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg outline-none focus:border-cyan-500"
    >
      <option value="">Todas seções</option>
      {stockSections.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  ) : null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <icons.ui.qrCode size={24} className="text-fg" />
          <h2 className="text-xl font-semibold">QR Codes</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={selected.size === 0}
            className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-input disabled:opacity-40"
          >
            <icons.ui.download size={14} className="inline mr-1" />
            ZIP
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-1.5 text-xs font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
          >
            <icons.ui.printer size={14} className="inline mr-1" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {((['items', 'pcs', 'kits']) as EntityType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setEntityType(t); setSectionFilter(''); setSearch('') }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              entityType === t
                ? 'bg-cyan-600 text-white'
                : 'bg-card text-fg-dim hover:text-fg border border-line'
            }`}
          >
            {t === 'items' ? 'Itens' : t === 'pcs' ? 'PCs' : 'Kits'}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <icons.ui.search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-40 rounded-lg border border-line bg-card py-1.5 pl-7 pr-2.5 text-xs text-fg outline-none placeholder:text-fg-dim focus:border-cyan-500"
            />
          </div>
          {section}
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className={`rounded-lg border border-line px-2.5 py-1.5 text-xs transition-colors ${
              showOptions ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-card text-fg-dim hover:text-fg'
            }`}
          >
            <icons.ui.sliders size={14} />
          </button>
        </div>
      </div>

      {showOptions && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-fg-dim">Tamanho:</label>
            <select
              value={options.size}
              onChange={(e) => setOptions((o) => ({ ...o, size: Number(e.target.value) }))}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg outline-none"
            >
              {sizeOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-fg-dim">Cor:</label>
            <input
              type="color"
              value={options.dark}
              onChange={(e) => setOptions((o) => ({ ...o, dark: e.target.value }))}
              className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-fg-dim">Fundo:</label>
            <input
              type="color"
              value={options.light}
              onChange={(e) => setOptions((o) => ({ ...o, light: e.target.value }))}
              className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-fg-dim">Label:</label>
            <select
              value={options.labelFormat}
              onChange={(e) => setOptions((o) => ({ ...o, labelFormat: e.target.value as QROptions['labelFormat'] }))}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg outline-none"
            >
              {labelFormats.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {generating ? (
        <LoadingSpinner />
      ) : qrItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <icons.ui.qrCode size={32} className="text-fg-muted" />
          <p className="text-sm text-fg-muted">Nenhum resultado encontrado</p>
          <p className="text-xs text-fg-dim">Tente ajustar os filtros ou selecionar outra entidade</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-xs text-fg-dim">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.size === qrItems.length && qrItems.length > 0}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-line accent-cyan-600"
              />
              {selected.size} de {qrItems.length} selecionados
            </label>
          </div>

          <div
            ref={printRef}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 print:grid-cols-4 print:gap-2"
          >
            {qrItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`relative flex flex-col items-center rounded-xl border bg-white p-3 text-center transition-all ${
                  selected.has(item.id)
                    ? 'border-cyan-400 ring-1 ring-cyan-400/50'
                    : 'border-line opacity-50'
                }`}
              >
                {selected.has(item.id) && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[10px] text-white shadow-sm">
                    <icons.ui.check size={12} />
                  </span>
                )}
                <img
                  src={item.dataUrl}
                  alt={item.label}
                  className="mb-1.5"
                  style={{ width: options.size > 300 ? 128 : options.size > 200 ? 112 : 96 }}
                />
                <p className="text-[10px] font-medium text-slate-800 leading-tight">
                  {options.labelFormat === 'name' ? item.label
                    : options.labelFormat === 'code' ? item.code
                    : `${item.label} (${item.code})`}
                </p>
                <p className="mt-0.5 text-[9px] text-slate-500">{item.sublabel}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
