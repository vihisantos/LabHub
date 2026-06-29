import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme, type ThemeVariant, type Accent } from '../../../lib/ThemeContext'
import { exportCSV, exportXLSX, pcToRows, partToRows } from '../utils/export'
import { pcService } from '../services/pcService'
import { partService } from '../services/partService'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'
import { useOnlineSync } from '../hooks/useOnlineSync'
import { useKioskMode } from '../../../lib/useKioskMode'
import { icons } from '../../../lib/icons'
import { ConfirmDialog } from '../components/Modal'

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

function SyncSection() {
  const { online, syncing, syncError, lastSync, pendingChanges, triggerSync, syncLog } = useOnlineSync()
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<string | null>(null)

  function formatTime(isoString: string): string {
    const d = new Date(isoString)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  async function handlePing() {
    setPinging(true)
    setPingResult(null)
    const start = Date.now()
    try {
      const { pcareDb } = await import('../../../lib/supabase')
      if (pcareDb) {
        await pcareDb.from('pcs').select('id').limit(1)
        setPingResult(`✓ Supabase respondeu em ${Date.now() - start}ms`)
      } else {
        setPingResult('⚠ Supabase não configurado (modo local)')
      }
    } catch (e) {
      setPingResult(`✗ Erro: ${e instanceof Error ? e.message : 'Falha na conexão'}`)
    } finally {
      setPinging(false)
    }
  }

  const recentLogs = [...syncLog].reverse().slice(0, 20)

  return (
    <section className="rounded-xl border border-line bg-card/50 p-4 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Sincronização</h3>

      {/* Status geral */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-fg">Status</p>
          <p className="text-xs text-fg-muted mt-0.5">
            {!online ? 'Offline' : syncing ? 'Sincronizando...' : syncError ? 'Erro no último sync' : pendingChanges > 0 ? `${pendingChanges} alteração(ões) pendente(s)` : 'Sincronizado'}
          </p>
          {lastSync && (
            <p className="text-[10px] text-fg-muted mt-0.5">
              Última sync: {lastSync.toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${
          !online ? 'bg-red-400' :
          syncing ? 'bg-amber-400 animate-pulse' :
          syncError ? 'bg-red-400 animate-pulse' :
          pendingChanges > 0 ? 'bg-amber-400 animate-pulse' :
          'bg-emerald-400'
        }`} />
      </div>

      {/* Erro */}
      {syncError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <p className="font-medium">Erro:</p>
          <p className="font-mono text-[10px] mt-0.5 break-all">{syncError}</p>
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-2">
        <button
          type="button"
          id="settings-sync-now"
          onClick={() => triggerSync()}
          disabled={syncing || !online}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-xs font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <icons.ui.refresh size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
        <button
          type="button"
          id="settings-ping-supabase"
          onClick={handlePing}
          disabled={pinging}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs text-fg-dim transition-colors hover:bg-input disabled:opacity-50"
        >
          <icons.ui.cloud size={12} />
          {pinging ? 'Testando...' : 'Testar conexão'}
        </button>
      </div>

      {pingResult && (
        <p className={`text-xs rounded-lg px-3 py-2 ${pingResult.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400' : pingResult.startsWith('⚠') ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
          {pingResult}
        </p>
      )}

      {/* Log de sync */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Log de sincronização</p>
        {recentLogs.length === 0 ? (
          <p className="text-xs text-fg-muted">Nenhuma entrada no log.</p>
        ) : (
          <div className="rounded-lg border border-line overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-line bg-input/50">
                  <th className="px-3 py-1.5 text-left font-medium text-fg-muted">Coleção</th>
                  <th className="px-2 py-1.5 text-center font-medium text-fg-muted">Itens</th>
                  <th className="px-2 py-1.5 text-center font-medium text-fg-muted">Status</th>
                  <th className="px-3 py-1.5 text-right font-medium text-fg-muted">Horário</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((entry, i) => (
                  <tr key={i} className={`border-b border-line last:border-0 ${i % 2 === 0 ? '' : 'bg-input/20'}`}>
                    <td className="px-3 py-1.5 text-fg-dim font-mono">{entry.collection}</td>
                    <td className="px-2 py-1.5 text-center text-fg-dim">{entry.itemCount}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        entry.status === 'ok' ? 'bg-emerald-500/15 text-emerald-400' :
                        entry.status === 'error' ? 'bg-red-500/15 text-red-400' :
                        'bg-amber-500/15 text-amber-400'
                      }`}>
                        {entry.status === 'ok' ? 'ok' : entry.status === 'error' ? 'erro' : 'local'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-fg-muted">{formatTime(entry.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function KioskToggle() {
  const { kioskMode, enterKiosk, exitKiosk } = useKioskMode()
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-fg">Modo quiosque</p>
        <p className="text-xs text-fg-muted">{kioskMode ? 'Ativo' : 'Inativo'}</p>
      </div>
      <button
        type="button"
        onClick={kioskMode ? exitKiosk : enterKiosk}
        className={`rounded-lg px-4 py-2 text-sm transition-colors ${
          kioskMode
            ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25'
            : 'border border-line text-fg-dim hover:bg-input'
        }`}
      >
        {kioskMode ? 'Desativar' : 'Ativar'}
      </button>
    </div>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const { pcs, reload: reloadPCs } = usePCs()
  const { parts, reload: reloadParts } = useParts()
  const { theme, accent, setTheme, setAccent } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClearFinal, setConfirmClearFinal] = useState(false)

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
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('labhub_'))
    keys.forEach((k) => localStorage.removeItem(k))
    reloadPCs()
    reloadParts()
    setImportResult('Todos os dados foram limpos.')
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Configurações</h2>

      <section className="rounded-xl border border-line bg-card/50 p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Aparência</h3>

        <div>
          <p className="mb-2 text-sm text-fg">Tema base</p>
          <div className="flex gap-2">
            {(['dark', 'dim', 'light'] as ThemeVariant[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTheme(v)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                  theme === v
                    ? 'bg-fg text-surface shadow-sm'
                    : 'border border-line text-fg-dim hover:bg-input'
                }`}
              >
                {v === 'dark' ? 'Escuro' : v === 'dim' ? 'Suave' : 'Claro'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-fg">Cor de destaque</p>
          <div className="flex gap-2">
            {(['emerald', 'cyan', 'blue', 'purple'] as Accent[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAccent(a)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                  accent === a
                    ? 'text-fg shadow-sm'
                    : 'border border-line text-fg-dim hover:bg-input'
                }`}
                style={accent === a ? { backgroundColor: `var(--accent)`, color: '#fff' } : undefined}
              >
                {a === 'emerald' ? 'Verde' : a === 'cyan' ? 'Ciano' : a === 'blue' ? 'Azul' : 'Roxo'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Modo Quiosque</h3>
        <p className="mb-3 text-xs text-fg-muted">O modo quiosque oculta a navegação e o cabeçalho, ideal para exibir painéis em telas públicas.</p>
        <KioskToggle />
      </section>

      <section className="rounded-xl border border-line bg-card/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Exportar Dados</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg">PCs</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleExportPcsCSV} className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg-dim hover:bg-input">CSV</button>
              <button type="button" onClick={handleExportPcsXLSX} className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg-dim hover:bg-input">XLSX</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg">Peças</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleExportPartsCSV} className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg-dim hover:bg-input">CSV</button>
              <button type="button" onClick={handleExportPartsXLSX} className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg-dim hover:bg-input">XLSX</button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportAll}
          className="mt-3 w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          Exportar Tudo (JSON)
        </button>
      </section>

      <section className="rounded-xl border border-line bg-card/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Importar Dados</h3>
        <p className="mb-2 text-xs text-fg-muted">O nome do arquivo deve conter "PC" (para PCs) ou "peca" (para peças) para identificar automaticamente o tipo.</p>
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
          className="w-full rounded-lg border border-dashed border-line py-3 text-sm text-fg-dim transition-colors hover:border-line hover:text-fg-dim"
        >
          Selecionar arquivo CSV
        </button>
        {importResult && (
          <p className="mt-2 text-xs text-fg-dim">{importResult}</p>
        )}
      </section>

      <section className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Zona de Perigo</h3>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="w-full rounded-lg border border-red-600 dark:border-red-800 py-2 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30"
        >
          Limpar Todos os Dados
        </button>
      </section>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); setConfirmClearFinal(true) }}
        title="Limpar dados"
        message="Tem certeza? Todos os dados serão perdidos permanentemente."
        confirmLabel="Sim, quero limpar"
        variant="danger"
      />

      <ConfirmDialog
        open={confirmClearFinal}
        onClose={() => setConfirmClearFinal(false)}
        onConfirm={() => { setConfirmClearFinal(false); handleClearAll() }}
        title="Confirmação final"
        message="Esta ação não pode ser desfeita. Deseja continuar?"
        confirmLabel="Sim, estou certo"
        variant="danger"
      />

      <SyncSection />

      <section className="rounded-xl border border-line bg-card/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Sobre</h3>
        <p className="text-sm text-fg-dim">Lab Hub v{import.meta.env.VITE_APP_VERSION || '0.1.0'}</p>
        <p className="text-xs text-fg-muted mt-1">
          PWA para gerenciamento de inventário de PCs em laboratórios universitários.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-3 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300"
        >
          Voltar ao Início
        </button>
      </section>
    </div>
  )
}
