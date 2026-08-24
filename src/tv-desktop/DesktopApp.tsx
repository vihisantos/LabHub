import { useEffect, useState, type CSSProperties } from 'react'
import { defaultDb as supabase } from '../lib/supabase'
import { loadConfig, saveConfig, type DeviceConfig } from './config'
import { hasDeviceSession } from './deviceService'
import { SetupFlow } from './SetupFlow'
import { DisplayShell } from './DisplayShell'

export function DesktopApp() {
  const [config, setConfig] = useState<DeviceConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconfiguring, setReconfiguring] = useState(false)
  const [sessionOk, setSessionOk] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      const c = await loadConfig()
      if (!active) return
      setConfig(c)
      // Sem identidade própria de kiosk (sessão ausente/expirada/legada),
      // força reativação — o RLS fechado não aceita mais anon/humano.
      if (!c || !supabase) {
        setSessionOk(!!c && !supabase)
      } else {
        setSessionOk(await hasDeviceSession())
      }
      setLoading(false)
    })()
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

  if (!config || reconfiguring || !sessionOk) {
    console.log('[LabHub TV] Modo configuração (sem device config ou sem sessão de kiosk)')
    return (
      <SetupFlow
        existing={config}
        onDone={(cfg) => {
          void saveConfig(cfg)
          setConfig(cfg)
          setSessionOk(true)
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
