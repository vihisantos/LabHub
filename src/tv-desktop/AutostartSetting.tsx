import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

interface AutostartStatus {
  enabled: boolean
  mechanism: 'Task' | 'StartupShortcut' | 'None' | string
  shortcutPath: string
  targetPath: string
}

export function AutostartSetting() {
  const [status, setStatus] = useState<AutostartStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    void invoke<AutostartStatus>('autostart_status').then(setStatus).catch((e) => setError(String(e)))
  }, [])

  const toggle = async (enabled: boolean) => {
    if (!isTauri() || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await invoke<AutostartStatus>('set_autostart', { enabled })
      setStatus(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!isTauri()) return null
  return (
    <div style={{ margin: '16px 0', padding: 14, border: '1px solid rgba(100,116,139,.3)', borderRadius: 10, textAlign: 'left' }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
        <input type="checkbox" checked={status?.enabled ?? false} disabled={!status || busy} onChange={(e) => void toggle(e.target.checked)} />
        Iniciar o LabHub TV ao entrar no Windows
      </label>
      {status?.enabled && (
        <p style={{ margin: '8px 0 0 26px', fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>
          Mecanismo ativo: {status.mechanism === 'Task' ? 'Agendador de Tarefas' : 'Atalho Inicializar'} · {status.targetPath}
        </p>
      )}
      {error && <p role="alert" style={{ margin: '8px 0 0', color: '#b91c1c', fontSize: 12 }}>{error}</p>}
    </div>
  )
}
