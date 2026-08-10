import { useEffect, useState, type CSSProperties } from 'react'
import { loadConfig, saveConfig, type DeviceConfig } from './config'
import { SetupFlow } from './SetupFlow'
import { DisplayShell } from './DisplayShell'

export function DesktopApp() {
  const [config, setConfig] = useState<DeviceConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconfiguring, setReconfiguring] = useState(false)

  useEffect(() => {
    let active = true
    loadConfig().then((c) => {
      if (!active) return
      setConfig(c)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div style={splashStyle}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (!config || reconfiguring) {
    console.log('[LabHub TV] Modo configuração (sem device config)')
    return (
      <SetupFlow
        existing={config}
        onDone={(cfg) => {
          void saveConfig(cfg)
          setConfig(cfg)
          setReconfiguring(false)
        }}
      />
    )
  }

  console.log('[LabHub TV] Display ativo:', config.name, '| workspace:', config.workspace.name, '| device:', config.deviceId)
  return <DisplayShell config={config} onReconfigure={() => setReconfiguring(true)} />
}

const splashStyle: CSSProperties = {
  width: '100vw', height: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#080a14',
}
