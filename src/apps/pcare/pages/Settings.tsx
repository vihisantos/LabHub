import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../lib/ThemeContext'
import { exportCSV, exportXLSX, pcToRows, partToRows } from '../utils/export'
import { pcService } from '../services/pcService'
import { partService } from '../services/partService'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function importCSV<T>(text: string): T[] {
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).map((line) => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += ch
    }
    values.push(current.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = values[i] || '' })
    return obj as unknown as T
  })
}

export function Settings() {
  const navigate = useNavigate()
  const { pcs, reload: reloadPCs } = usePCs()
  const { parts, reload: reloadParts } = useParts()
  const { theme, toggle } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<string | null>(null)

  function handleExportAll() {
    const all = {
      pcs: pcService.getAll(),
      parts: partService.getAll(),
      generalStock: JSON.parse(localStorage.getItem('labhub_general_stock') || '[]'),
      partUsage: JSON.parse(localStorage.getItem('labhub_part_usage') || '[]'),
      actionLogs: JSON.parse(localStorage.getItem('labhub_action_logs') || '[]'),
    }
    downloadJSON(all, `labhub_backup_${new Date().toISOString().slice(0, 10)}`)
  }

  function handleExportPcsCSV() {
    const { headers, rows } = pcToRows(pcs)
    exportCSV(headers, rows, 'pcs')
  }

  function handleExportPcsXLSX() {
    const { headers, rows } = pcToRows(pcs)
    exportXLSX(headers, rows, 'pcs')
  }

  function handleExportPartsCSV() {
    const { headers, rows } = partToRows(parts)
    exportCSV(headers, rows, 'pecas')
  }

  function handleExportPartsXLSX() {
    const { headers, rows } = partToRows(parts)
    exportXLSX(headers, rows, 'pecas')
  }

  function handleImportPCs(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = importCSV<Record<string, string>>(reader.result as string)
        let count = 0
        for (const row of data) {
          pcService.create({
            labName: row.Laboratório || row.labName || '',
            pcNumber: row.PC || row.pcNumber || '',
            roomLocation: row.Localização || row.roomLocation || '',
            cleaningStatus: 'pending',
            restorationStatus: 'pending',
            specs: {
              cpu: row.CPU || row.cpu || '',
              ram: row.RAM || row.ram || '',
              storage: row.Armazenamento || row.storage || '',
              os: row.SO || row.os || '',
            },
            softwareInstalled: [],
            partsReplaced: [],
            observations: row.Observações || row.observations || '',
          } as any)
          count++
        }
        reloadPCs()
        setImportResult(`${count} PCs importados com sucesso.`)
      } catch {
        setImportResult('Erro ao importar PCs. Verifique o formato do arquivo.')
      }
    }
    reader.readAsText(file)
  }

  function handleImportParts(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = importCSV<Record<string, string>>(reader.result as string)
        let count = 0
        for (const row of data) {
          partService.create({
            name: row.Nome || row.name || '',
            category: row.Categoria || row.category || '',
            quantity: Number(row.Quantidade || row.quantity || 0),
            minQuantity: Number(row['Qtd. Mínima'] || row.minQuantity || 0),
            serialNumber: row['N Série'] || row.serialNumber || '',
            notes: row.Observações || row.notes || '',
          } as any)
          count++
        }
        reloadParts()
        setImportResult(`${count} peças importadas com sucesso.`)
      } catch {
        setImportResult('Erro ao importar peças. Verifique o formato do arquivo.')
      }
    }
    reader.readAsText(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.includes('pc') || file.name.includes('PC')) {
      handleImportPCs(file)
    } else {
      handleImportParts(file)
    }
    e.target.value = ''
  }

  function handleClearAll() {
    if (!window.confirm('Tem certeza? Todos os dados serão perdidos permanentemente.')) return
    if (!window.confirm('Esta ação não pode ser desfeita. Deseja continuar?')) return
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('labhub_'))
    keys.forEach((k) => localStorage.removeItem(k))
    reloadPCs()
    reloadParts()
    setImportResult('Todos os dados foram limpos.')
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Configurações</h2>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Aparência</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-200">Tema</p>
            <p className="text-xs text-slate-500">{theme === 'dark' ? 'Escuro' : 'Claro'}</p>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
          >
            {theme === 'dark' ? '☀️ Claro' : '🌙 Escuro'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Exportar Dados</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-200">PCs</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleExportPcsCSV} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">CSV</button>
              <button type="button" onClick={handleExportPcsXLSX} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">XLSX</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-200">Peças</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleExportPartsCSV} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">CSV</button>
              <button type="button" onClick={handleExportPartsXLSX} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">XLSX</button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportAll}
          className="mt-3 w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          Exportar Tudo (JSON)
        </button>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Importar Dados</h3>
        <p className="mb-2 text-xs text-slate-500">O nome do arquivo deve conter "PC" (para PCs) ou "peca" (para peças) para identificar automaticamente o tipo.</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-slate-700 py-3 text-sm text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-300"
        >
          Selecionar arquivo CSV
        </button>
        {importResult && (
          <p className="mt-2 text-xs text-slate-400">{importResult}</p>
        )}
      </section>

      <section className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-400">Zona de Perigo</h3>
        <button
          type="button"
          onClick={handleClearAll}
          className="w-full rounded-lg border border-red-800 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/30"
        >
          Limpar Todos os Dados
        </button>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Sobre</h3>
        <p className="text-sm text-slate-300">Lab Hub v{import.meta.env.VITE_APP_VERSION || '0.1.0'}</p>
        <p className="text-xs text-slate-500 mt-1">
          PWA para gerenciamento de inventário de PCs em laboratórios universitários.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-3 text-xs text-cyan-400 hover:text-cyan-300"
        >
          Voltar ao Início
        </button>
      </section>
    </div>
  )
}
