import { useMemo, useState } from 'react'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'
import { exportCSV, exportXLSX, exportPDF, pcToRows, partToRows } from '../utils/export'
import { SkeletonStatCard } from '../components/Skeletons'
import { icons } from '../../../lib/icons'

type DataType = 'pcs' | 'parts'
type Format = 'csv' | 'xlsx' | 'pdf'

export function Reports() {
  const { pcs, loading: pcsLoading } = usePCs()
  const { parts, loading: partsLoading } = useParts()
  const [dataType, setDataType] = useState<DataType>('pcs')
  const [format, setFormat] = useState<Format>('csv')
  const [labFilter, setLabFilter] = useState('')

  const labs = useMemo(() => {
    const unique = new Set(pcs.map((p) => p.labName))
    return Array.from(unique).sort()
  }, [pcs])

  const filteredPCs = useMemo(() => {
    if (!labFilter) return pcs
    return pcs.filter((p) => p.labName === labFilter)
  }, [pcs, labFilter])

  if (pcsLoading || partsLoading) return <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <SkeletonStatCard key={i} />)}</div>

  function handleExport() {
    const filename = `PCare_${dataType}_${new Date().toISOString().split('T')[0]}`

    if (dataType === 'pcs') {
      const { headers, rows } = pcToRows(filteredPCs)
      const title = `PCare - Inventário de PCs${labFilter ? ` - ${labFilter}` : ''}`

      if (format === 'csv') exportCSV(headers, rows, filename)
      else if (format === 'xlsx') exportXLSX(headers, rows, filename, 'PCs')
      else exportPDF(title, headers, rows, filename)
    } else {
      const { headers, rows } = partToRows(parts)
      const title = 'PCare - Estoque de Peças'

      if (format === 'csv') exportCSV(headers, rows, filename)
      else if (format === 'xlsx') exportXLSX(headers, rows, filename, 'Peças')
      else exportPDF(title, headers, rows, filename)
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Exportar Relatório</h2>

      <div className="flex flex-col gap-4">
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
                      ? 'border-cyan-500 bg-cyan-900/30 text-cyan-300'
                      : 'border-line text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <icons.nav.pcs size={16} /> Computadores ({filteredPCs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDataType('parts')}
                  className={`rounded-lg border px-4 py-3 text-sm flex items-center gap-2 transition-all ${
                    dataType === 'parts'
                      ? 'border-cyan-500 bg-cyan-900/30 text-cyan-300'
                      : 'border-line text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <icons.nav.parts size={16} /> Peças ({parts.length})
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
                        ? 'border-cyan-500 bg-cyan-900/30 text-cyan-300'
                        : 'border-line text-fg-dim hover:border-slate-600'
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
            filteredPCs.length === 0 ? (
              <p className="text-sm text-fg-muted">Nenhum PC encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-line text-fg-muted">
                      <th className="px-2 py-1">Lab</th>
                      <th className="px-2 py-1">PC</th>
                      <th className="px-2 py-1">Limpeza</th>
                      <th className="px-2 py-1">Rest.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPCs.slice(0, 5).map((pc) => (
                      <tr key={pc.id} className="border-b border-line/50">
                        <td className="px-2 py-1">{pc.labName}</td>
                        <td className="px-2 py-1">{pc.pcNumber}</td>
                        <td className="px-2 py-1">{pc.cleaningStatus}</td>
                        <td className="px-2 py-1">{pc.restorationStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPCs.length > 5 && (
                  <p className="mt-2 text-xs text-fg-muted">
                    + {filteredPCs.length - 5} PCs · todos serão exportados
                  </p>
                )}
              </div>
            )
          ) : (
            parts.length === 0 ? (
              <p className="text-sm text-fg-muted">Nenhuma peça no estoque.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-line text-fg-muted">
                      <th className="px-2 py-1">Nome</th>
                      <th className="px-2 py-1">Qtd</th>
                      <th className="px-2 py-1">Mín</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.slice(0, 5).map((part) => (
                      <tr key={part.id} className="border-b border-line/50">
                        <td className="px-2 py-1">{part.name}</td>
                        <td className="px-2 py-1">{part.quantity}</td>
                        <td className="px-2 py-1">{part.minQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parts.length > 5 && (
                  <p className="mt-2 text-xs text-fg-muted">
                    + {parts.length - 5} peças · todas serão exportadas
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
