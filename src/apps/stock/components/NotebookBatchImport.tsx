import { useState, useRef } from 'react'
import type { StockItemFormData } from '../types'
import { stockConditions } from '../types'
import { Modal } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'

interface NotebookBatchImportProps {
  open: boolean
  onClose: () => void
  onCreate: (items: StockItemFormData[]) => void
}

interface NotebookRow {
  id: string
  brand: string
  model: string
  cpu: string
  ram: string
  storage: string
  osType: string
  osVersion: string
  osEdition: string
  osBuild: string
  serialNumber: string
  patrimonyAnhembi: string
  room: string
  bay: string
  lockedInBay: boolean
  padlockPassword: string
  hasMouse: boolean
  mouseMissing: boolean
  batteryStatus: string
  visualDamage: string
  condition: string
  chargerBrand: string
  chargerName: string
  chargerSerial: string
  chargerPower: string
  chargerCondition: string
  notes: string
}

const CSV_HEADERS = [
  'Marca',
  'Modelo',
  'CPU',
  'RAM',
  'Armazenamento',
  'Sistema Operacional',
  'Versão SO',
  'Edição SO',
  'Build SO',
  'Nº Série',
  'Patrimônio AM',
  'Sala',
  'Baia',
  'Trancado (Sim/Não)',
  'Senha Cadeado',
  'Possui Mouse (Sim/Não)',
  'Mouse Faltando (Sim/Não)',
  'Status Bateria (OK/Ruim/Sem)',
  'Avarias Visuais',
  'Condição (Bom/Regular/Danificado)',
  'Marca Carregador',
  'Nome Carregador',
  'Série Carregador',
  'Potência Carregador',
  'Condição Carregador',
  'Observações',
]

function generateTemplateCSV(): string {
  const header = CSV_HEADERS.join(';')
  const example = [
    'HP',
    'ProBook 440 G3',
    'Intel Core i5-6200',
    '4GB',
    'SSD 240GB',
    'windows10',
    '22H2',
    'pro_education',
    '19045.6456',
    'BRJ745KSWQ',
    '138356',
    'Lab Info 2',
    'Baia 1',
    'Sim',
    '1234',
    'Sim',
    'Não',
    'OK',
    '',
    'Bom',
    'HP',
    'Carregador HP 65W',
    '',
    '65W',
    'Bom',
    '',
  ].join(';')
  return `${header}\n${example}\n${example}`
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ';' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function rowToNotebook(row: string[], index: number): NotebookRow {
  return {
    id: `row-${index}`,
    brand: row[0] || 'HP',
    model: row[1] || '',
    cpu: row[2] || '',
    ram: row[3] || '',
    storage: row[4] || '',
    osType: row[5] || 'windows10',
    osVersion: row[6] || '22H2',
    osEdition: row[7] || 'pro_education',
    osBuild: row[8] || '',
    serialNumber: row[9] || '',
    patrimonyAnhembi: row[10] || '',
    room: row[11] || '',
    bay: row[12] || '',
    lockedInBay: row[13]?.toLowerCase() === 'sim',
    padlockPassword: row[14] || '',
    hasMouse: row[15]?.toLowerCase() !== 'não',
    mouseMissing: row[16]?.toLowerCase() === 'sim',
    batteryStatus: row[17]?.toLowerCase() === 'ruim' ? 'ruim' : row[17]?.toLowerCase() === 'sem' ? 'sem' : 'ok',
    visualDamage: row[18] || '',
    condition: row[19] || 'Bom',
    chargerBrand: row[20] || 'HP',
    chargerName: row[21] || '',
    chargerSerial: row[22] || '',
    chargerPower: row[23] || '',
    chargerCondition: row[24] || 'Bom',
    notes: row[25] || '',
  }
}

function notebookToItem(row: NotebookRow): StockItemFormData {
  const mouseStatus = row.hasMouse ? (row.mouseMissing ? 'Faltando' : 'Presente') : 'Sem mouse'
  return {
    name: `${row.brand} ${row.model}`.trim(),
    section: 'maquinas',
    subcategory: 'Notebook',
    serialNumber: row.serialNumber,
    room: row.room,
    status: 'ativo',
    condition: row.condition,
    notes: `${row.brand} ${row.model} | ${row.cpu} | ${row.ram} | ${row.storage} | ${row.osType} ${row.osVersion} ${row.osEdition} Build ${row.osBuild} | Patrimônio AM: ${row.patrimonyAnhembi} | Baia: ${row.bay} | Trancado: ${row.lockedInBay ? 'Sim' : 'Não'}${row.padlockPassword ? ` | Senha Cadeado: ${row.padlockPassword}` : ''} | Mouse: ${mouseStatus} | Bateria: ${row.batteryStatus} | Autologon: Não${row.visualDamage ? ` | Avarias: ${row.visualDamage}` : ''}${row.notes ? ` | ${row.notes}` : ''}`,
    cableType: '',
    cableLength: '',
    connectorType: '',
    outletCount: undefined,
    linkedPcId: undefined,
    linkedPcLabel: undefined,
  }
}

function chargerToItem(row: NotebookRow): StockItemFormData | null {
  if (!row.chargerName.trim()) return null
  return {
    name: `${row.chargerBrand} ${row.chargerName}`.trim(),
    section: 'equipamentos',
    subcategory: 'Carregador',
    serialNumber: row.chargerSerial,
    room: row.room,
    status: 'ativo',
    condition: row.chargerCondition,
    notes: `Marca: ${row.chargerBrand} | Potência: ${row.chargerPower}`,
    cableType: '',
    cableLength: '',
    connectorType: '',
    outletCount: undefined,
    linkedPcId: undefined,
    linkedPcLabel: undefined,
  }
}

export function NotebookBatchImport({ open, onClose, onCreate }: NotebookBatchImportProps) {
  const [rows, setRows] = useState<NotebookRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editField, setEditField] = useState<string>('')
  const [editValue, setEditValue] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleDownloadTemplate() {
    const csv = generateTemplateCSV()
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'template_notebooks.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      const dataLines = lines.slice(1) // Skip header
      
      const parsed = dataLines.map((line, i) => {
        const cols = parseCSVLine(line)
        return rowToNotebook(cols, i)
      })
      
      setRows(parsed)
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  function addEmptyRow() {
    setRows(prev => [...prev, {
      id: `row-${Date.now()}`,
      brand: 'HP',
      model: '',
      cpu: '',
      ram: '',
      storage: '',
      osType: 'windows10',
      osVersion: '22H2',
      osEdition: 'pro_education',
      osBuild: '',
      serialNumber: '',
      patrimonyAnhembi: '',
      room: '',
      bay: '',
      lockedInBay: false,
      padlockPassword: '',
      hasMouse: true,
      mouseMissing: false,
      batteryStatus: 'ok',
      visualDamage: '',
      condition: 'Bom',
      chargerBrand: 'HP',
      chargerName: '',
      chargerSerial: '',
      chargerPower: '',
      chargerCondition: 'Bom',
      notes: '',
    }])
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function duplicateRow(id: string) {
    const row = rows.find(r => r.id === id)
    if (row) {
      setRows(prev => [...prev, { ...row, id: `row-${Date.now()}` }])
    }
  }

  function startEdit(id: string, field: string, value: string) {
    setEditingId(id)
    setEditField(field)
    setEditValue(value)
  }

  function saveEdit() {
    if (!editingId) return
    setRows(prev => prev.map(r => {
      if (r.id !== editingId) return r
      const updated = { ...r }
      const field = editField as keyof NotebookRow
      if (typeof updated[field] === 'boolean') {
        (updated as any)[field] = editValue === 'Sim'
      } else if (field === 'batteryStatus') {
        updated[field] = editValue as any
      } else if (field === 'condition') {
        updated[field] = editValue as any
      } else {
        (updated as any)[field] = editValue
      }
      return updated
    }))
    setEditingId(null)
  }

  function handleSubmit() {
    const items: StockItemFormData[] = []
    for (const row of rows) {
      items.push(notebookToItem(row))
      const charger = chargerToItem(row)
      if (charger) items.push(charger)
    }
    if (items.length > 0) {
      onCreate(items)
    }
    handleClose()
  }

  function handleClose() {
    setRows([])
    setEditingId(null)
    onClose()
  }

  function CellValue({ row, field, label }: { row: NotebookRow; field: keyof NotebookRow; label: string }) {
    const value = row[field]
    const isEditing = editingId === row.id && editField === field

    if (isEditing) {
      if (typeof value === 'boolean') {
        return (
          <select
            value={editValue}
            onChange={(e) => { setEditValue(e.target.value); setTimeout(saveEdit, 0) }}
            onBlur={saveEdit}
            className="w-full rounded bg-input px-1 py-0.5 text-[11px] text-fg outline-none"
            autoFocus
          >
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
          </select>
        )
      }
      if (field === 'batteryStatus') {
        return (
          <select
            value={editValue}
            onChange={(e) => { setEditValue(e.target.value); setTimeout(saveEdit, 0) }}
            onBlur={saveEdit}
            className="w-full rounded bg-input px-1 py-0.5 text-[11px] text-fg outline-none"
            autoFocus
          >
            <option value="ok">OK</option>
            <option value="ruim">Ruim</option>
            <option value="sem">Sem</option>
          </select>
        )
      }
      if (field === 'condition') {
        return (
          <select
            value={editValue}
            onChange={(e) => { setEditValue(e.target.value); setTimeout(saveEdit, 0) }}
            onBlur={saveEdit}
            className="w-full rounded bg-input px-1 py-0.5 text-[11px] text-fg outline-none"
            autoFocus
          >
            {stockConditions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )
      }
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
          className="w-full rounded bg-input px-1 py-0.5 text-[11px] text-fg outline-none"
          autoFocus
        />
      )
    }

    let displayValue = ''
    if (typeof value === 'boolean') {
      displayValue = value ? 'Sim' : 'Não'
    } else if (field === 'batteryStatus') {
      displayValue = value === 'ok' ? 'OK' : value === 'ruim' ? 'Ruim' : 'Sem'
    } else {
      displayValue = String(value || '—')
    }

    return (
      <button
        type="button"
        onClick={() => startEdit(row.id, field, typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value))}
        className="w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-fg hover:bg-input/80 transition-colors"
        title={`${label}: ${displayValue}`}
      >
        {displayValue}
      </button>
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar Notebooks em Lote" wide>
      <div className="flex flex-col gap-4">
        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 rounded-lg bg-violet-100 px-3 py-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:hover:bg-violet-900/50"
            >
              <icons.ui.download size={14} />
              Baixar Template CSV
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-100 px-3 py-2 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:hover:bg-cyan-900/50"
            >
              <icons.ui.upload size={14} />
              Importar CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <button
            type="button"
            onClick={addEmptyRow}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
          >
            <icons.ui.plus size={14} />
            Adicionar Linha
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-input/30 py-12">
            <icons.ui.package size={40} className="mb-3 text-fg-muted" />
            <p className="text-sm font-medium text-fg-dim">Nenhum notebook adicionado</p>
            <p className="mt-1 text-xs text-fg-muted">
              Baixe o template CSV, preencha no Excel e importe, ou adicione linhas manualmente
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-fg-muted">
                {rows.length} notebook{rows.length !== 1 ? 's' : ''} • Clique em qualquer célula para editar
              </p>
              <p className="text-xs text-fg-muted">
                {rows.filter(r => r.model.trim()).length} com modelo preenchido
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="bg-input">
                    <th className="px-2 py-2 font-medium text-fg-muted sticky left-0 bg-input">#</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Marca</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Modelo</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">CPU</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">RAM</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Storage</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">SO</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Versão</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Edição</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Build</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Nº Série</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Patrimônio</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Sala</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Baia</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Trancado</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Senha Cadeado</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Mouse</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Mouse Falta</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Bateria</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Avarias</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Condição</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Carregador</th>
                    <th className="px-2 py-2 font-medium text-fg-muted">Obs</th>
                    <th className="px-2 py-2 font-medium text-fg-muted sticky right-0 bg-input">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id} className="border-t border-line/50 hover:bg-input/30">
                      <td className="px-2 py-1 text-fg-muted sticky left-0 bg-card/80">{i + 1}</td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="brand" label="Marca" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="model" label="Modelo" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="cpu" label="CPU" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="ram" label="RAM" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="storage" label="Storage" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="osType" label="SO" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="osVersion" label="Versão" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="osEdition" label="Edição" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="osBuild" label="Build" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="serialNumber" label="Nº Série" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="patrimonyAnhembi" label="Patrimônio" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="room" label="Sala" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="bay" label="Baia" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="lockedInBay" label="Trancado" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="padlockPassword" label="Senha Cadeado" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="hasMouse" label="Mouse" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="mouseMissing" label="Mouse Falta" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="batteryStatus" label="Bateria" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="visualDamage" label="Avarias" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="condition" label="Condição" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="chargerName" label="Carregador" /></td>
                      <td className="px-1 py-0.5"><CellValue row={row} field="notes" label="Obs" /></td>
                      <td className="px-2 py-1 sticky right-0 bg-card/80">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => duplicateRow(row.id)}
                            className="rounded p-1 text-fg-muted hover:text-cyan-500 transition-colors"
                            title="Duplicar"
                          >
                            <icons.ui.copy size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="rounded p-1 text-fg-muted hover:text-red-500 transition-colors"
                            title="Remover"
                          >
                            <icons.ui.trash size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={rows.length === 0 || rows.every(r => !r.model.trim())}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
          >
            Importar {rows.filter(r => r.model.trim()).length} Notebook{rows.filter(r => r.model.trim()).length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}