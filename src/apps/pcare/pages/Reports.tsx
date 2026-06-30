import { useMemo, useState, useRef } from 'react'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'
import { exportCSV, exportXLSX, exportPDF, pcToRows, partToRows } from '../utils/export'
import { parseFile, mapPcRow, mapPartRow, validateRows } from '../utils/import'
import { pcService } from '../services/pcService'
import { partService } from '../services/partService'
import { SkeletonStatCard } from '../components/Skeletons'
import { icons } from '../../../lib/icons'

type DataType = 'pcs' | 'parts'
type Format = 'csv' | 'xlsx' | 'pdf'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente', in_progress: 'Andamento', done: 'Concluído',
}

export function Reports() {
  const { pcs, loading: pcsLoading, reload: reloadPCs } = usePCs()
  const { parts, loading: partsLoading, reload: reloadParts } = useParts()
  const [dataType, setDataType] = useState<DataType>('pcs')
  const [format, setFormat] = useState<Format>('csv')
  const [labFilter, setLabFilter] = useState('')
  const [importMode, setImportMode] = useState(false)
  const [importDataType, setImportDataType] = useState<DataType>('pcs')
  const [importResult, setImportResult] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const labs = useMemo(() => {
    const unique = new Set(pcs.map((p) => p.labName))
    return Array.from(unique).sort()
  }, [pcs])

  const filteredPCs = useMemo(() => {
    if (!labFilter) return pcs
    return pcs.filter((p) => p.labName === labFilter)
  }, [pcs, labFilter])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchText, setSearchText] = useState('')

  const categories = useMemo(() => {
    const unique = new Set(parts.map((p) => p.category))
    return Array.from(unique).sort()
  }, [parts])

  const filteredPCsAdvanced = useMemo(() => {
    let list = filteredPCs
    if (dateFrom) list = list.filter((p) => p.createdAt >= dateFrom)
    if (dateTo) list = list.filter((p) => p.createdAt <= dateTo + 'T23:59:59')
    if (statusFilter) list = list.filter((p) => p.cleaningStatus === statusFilter || p.restorationStatus === statusFilter)
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter((p) =>
        p.labName.toLowerCase().includes(q) ||
        p.pcNumber.toLowerCase().includes(q) ||
        p.roomLocation.toLowerCase().includes(q) ||
        p.assetTag.toLowerCase().includes(q) ||
        p.specs.cpu.toLowerCase().includes(q),
      )
    }
    return list
  }, [filteredPCs, dateFrom, dateTo, statusFilter, searchText])

  const filteredParts = useMemo(() => {
    let list = parts
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter)
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.serialNumber || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [parts, categoryFilter, searchText])

  if (pcsLoading || partsLoading) return <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <SkeletonStatCard key={i} />)}</div>

  function handleExport() {
    const filename = `PCare_${dataType}_${new Date().toISOString().split('T')[0]}`

    if (dataType === 'pcs') {
      const { headers, rows } = pcToRows(filteredPCsAdvanced)
      const title = `PCare - Inventário de PCs${labFilter ? ` - ${labFilter}` : ''}`
      if (format === 'csv') exportCSV(headers, rows, filename)
      else if (format === 'xlsx') exportXLSX(headers, rows, filename, 'PCs')
      else exportPDF(title, headers, rows, filename)
    } else {
      const { headers, rows } = partToRows(filteredParts)
      const title = 'PCare - Estoque de Peças'
      if (format === 'csv') exportCSV(headers, rows, filename)
      else if (format === 'xlsx') exportXLSX(headers, rows, filename, 'Peças')
      else exportPDF(title, headers, rows, filename)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImportResult(null)
    setImportSuccess(0)
    try {
      const parsed = await parseFile(file)
      setImportResult({ headers: parsed.headers, rows: parsed.rows })
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  async function handleImportConfirm() {
    if (!importResult) return
    setImporting(true)
    setImportError('')
    let success = 0

    try {
      if (importDataType === 'pcs') {
        const err = validateRows(importResult.rows, 4)
        if (err) { setImportError(err); setImporting(false); return }
        for (const row of importResult.rows) {
          const data = mapPcRow(importResult.headers, row)
          if (data.labName && data.pcNumber) {
            pcService.create({ ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
            success++
          }
        }
      } else {
        const err = validateRows(importResult.rows, 2)
        if (err) { setImportError(err); setImporting(false); return }
        for (const row of importResult.rows) {
          const data = mapPartRow(importResult.headers, row)
          if (data.name) {
            partService.create(data)
            success++
          }
        }
      }

      setImportSuccess(success)
      setImportResult(null)
      reloadPCs()
      reloadParts()
    } catch {
      setImportError('Erro ao importar dados.')
    }
    setImporting(false)
  }

  function resetImport() {
    setImportMode(false)
    setImportResult(null)
    setImportError('')
    setImportSuccess(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Relatórios</h2>
        <button
          type="button"
          onClick={() => setImportMode(!importMode)}
          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            importMode
              ? 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
              : 'border-line text-fg-dim hover:border-line'
          }`}
        >
          {importMode ? 'Exportar' : 'Importar CSV/XLSX'}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {importMode ? (
          <div className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Importar Dados</h3>

            {importSuccess > 0 && (
              <div className="mb-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {importSuccess} registro{importSuccess > 1 ? 's' : ''} importado{importSuccess > 1 ? 's' : ''} com sucesso!
              </div>
            )}

            {!importResult ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs text-fg-muted">Tipo de dados</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setImportDataType('pcs')}
                      className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                        importDataType === 'pcs'
                          ? 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
                          : 'border-line text-fg-dim hover:border-line'
                      }`}
                    >
                      <icons.nav.pcs size={16} className="inline-block mr-1" /> Computadores
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportDataType('parts')}
                      className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                        importDataType === 'parts'
                          ? 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
                          : 'border-line text-fg-dim hover:border-line'
                      }`}
                    >
                      <icons.nav.parts size={16} className="inline-block mr-1" /> Peças
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-fg-muted">Arquivo</label>
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line bg-input/50 p-8 text-center transition-colors hover:bg-input">
                    <icons.ui.upload size={28} className="text-fg-muted" />
                    <span className="text-sm text-fg-dim">
                      Clique para selecionar .csv ou .xlsx
                    </span>
                    <span className="text-[10px] text-fg-dim">
                      Formato: use a planilha exportada pelo próprio LabHub
                    </span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {importError && (
                  <p className="text-sm text-red-500">{importError}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-fg-dim">
                    {importResult.rows.length} linha{importResult.rows.length !== 1 ? 's' : ''} encontrada{importResult.rows.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={resetImport}
                    className="text-xs text-fg-muted hover:text-fg"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs text-fg-dim">
                    <thead>
                      <tr className="bg-input">
                        {importResult.headers.slice(0, 6).map((h, i) => (
                          <th key={i} className="px-2 py-1.5 font-medium text-fg-muted">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-line/50">
                          {row.slice(0, 6).map((cell, j) => (
                            <td key={j} className="px-2 py-1 truncate max-w-[120px]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importResult.rows.length > 5 && (
                    <p className="p-2 text-[10px] text-fg-muted">
                      + {importResult.rows.length - 5} linha{importResult.rows.length - 5 > 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                {importError && <p className="text-sm text-red-500">{importError}</p>}

                <button
                  type="button"
                  onClick={handleImportConfirm}
                  disabled={importing}
                  className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 py-3 text-sm font-medium text-fg shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                >
                  {importing ? 'Importando...' : `Importar ${importResult.rows.length} registro${importResult.rows.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-line bg-card/50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Configuração</h3>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs text-fg-muted">Dados</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDataType('pcs')}
                      className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-2 transition-all ${
                        dataType === 'pcs'
                          ? 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
                          : 'border-line text-fg-dim hover:border-line'
                      }`}
                    >
                      <icons.nav.pcs size={16} /> Computadores ({filteredPCsAdvanced.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDataType('parts')}
                      className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-2 transition-all ${
                        dataType === 'parts'
                          ? 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
                          : 'border-line text-fg-dim hover:border-line'
                      }`}
                    >
                      <icons.nav.parts size={16} /> Peças ({filteredParts.length})
                    </button>
                  </div>
                </div>

                {dataType === 'pcs' && labs.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs text-fg-muted">Filtrar por laboratório</label>
                    <select
                      value={labFilter}
                      onChange={(e) => setLabFilter(e.target.value)}
                      className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                    >
                      <option value="">Todos os laboratórios</option>
                      {labs.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}

                {dataType === 'pcs' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-fg-muted">De</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-fg-muted">Até</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                      />
                    </div>
                  </div>
                )}

                {dataType === 'pcs' && (
                  <div>
                    <label className="mb-1 block text-xs text-fg-muted">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                    >
                      <option value="">Todos</option>
                      <option value="done">Concluído</option>
                      <option value="in_progress">Em andamento</option>
                      <option value="pending">Pendente</option>
                    </select>
                  </div>
                )}

                {dataType === 'parts' && categories.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs text-fg-muted">Categoria</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                    >
                      <option value="">Todas</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs text-fg-muted">Busca</label>
                  <div className="relative">
                    <icons.ui.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Buscar por nome, laboratório ou local..."
                      className="w-full rounded-lg border border-line bg-card py-2 pl-8 pr-3 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-fg-muted">Formato</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['csv', 'xlsx', 'pdf'] as Format[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                          format === f
                            ? 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
                            : 'border-line text-fg-dim hover:border-line'
                        }`}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExport}
                  className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-3 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
                >
                  Exportar {format.toUpperCase()}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card/50 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">Prévia</h3>
              {dataType === 'pcs' ? (
                filteredPCsAdvanced.length === 0 ? (
                  <p className="text-sm text-fg-muted">Nenhum PC encontrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-fg-dim">
                      <thead>
                        <tr className="border-b border-line text-fg-muted">
                          <th className="px-2 py-1">Lab</th>
                          <th className="px-2 py-1">PC</th>
                          <th className="px-2 py-1">Limpeza</th>
                          <th className="px-2 py-1">Rest.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPCsAdvanced.slice(0, 5).map((pc) => (
                          <tr key={pc.id} className="border-b border-line/50">
                            <td className="px-2 py-1">{pc.labName}</td>
                            <td className="px-2 py-1">{pc.pcNumber}</td>
                            <td className="px-2 py-1">{STATUS_LABELS[pc.cleaningStatus]}</td>
                            <td className="px-2 py-1">{STATUS_LABELS[pc.restorationStatus]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredPCsAdvanced.length > 5 && (
                      <p className="mt-2 text-xs text-fg-muted">
                        + {filteredPCsAdvanced.length - 5} PCs · todos serão exportados
                      </p>
                    )}
                  </div>
                )
              ) : (
                filteredParts.length === 0 ? (
                  <p className="text-sm text-fg-muted">Nenhuma peça no estoque.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-fg-dim">
                      <thead>
                        <tr className="border-b border-line text-fg-muted">
                          <th className="px-2 py-1">Nome</th>
                          <th className="px-2 py-1">Categoria</th>
                          <th className="px-2 py-1">Qtd</th>
                          <th className="px-2 py-1">Mín</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParts.slice(0, 5).map((part) => (
                          <tr key={part.id} className="border-b border-line/50">
                            <td className="px-2 py-1">{part.name}</td>
                            <td className="px-2 py-1">{part.category}</td>
                            <td className="px-2 py-1">{part.quantity}</td>
                            <td className="px-2 py-1">{part.minQuantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredParts.length > 5 && (
                      <p className="mt-2 text-xs text-fg-muted">
                        + {filteredParts.length - 5} peças · todas serão exportadas
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
