import { useState, type FormEvent, type CSSProperties } from 'react'
import { Tv, ArrowLeft, Check, KeyRound } from 'lucide-react'
import type { Workspace } from '../core/workspaces/types'
import type { User } from '../core/auth/types'
import { authService } from '../core/auth/service'
import { defaultDb as supabase } from '../lib/supabase'
import { redeemActivationCode, provisionWithLogin } from './deviceService'
import type { DeviceConfig } from './config'

type Step = 'login' | 'activation' | 'workspace' | 'name' | 'saving'

const WS_COLORS = [
  'from-red-500 to-rose-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-indigo-500 to-purple-600',
  'from-cyan-500 to-blue-600',
]

interface SetupFlowProps {
  existing: DeviceConfig | null
  onDone: (config: DeviceConfig) => void
}

export function SetupFlow({ existing, onDone }: SetupFlowProps) {
  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [deviceName, setDeviceName] = useState(existing?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [activationCode, setActivationCode] = useState('')
  const [activating, setActivating] = useState(false)

  const loadWorkspaces = async (u: User) => {
    if (!supabase) return
    const { data } = await supabase.from('workspaces').select('*').order('name')
    const all = (data as Workspace[]) || []
    let assigned = all
    if (!u.is_super_admin && u.workspace_ids.length > 0) {
      assigned = all.filter((w) => u.workspace_ids.includes(w.id))
    }
    setWorkspaces(assigned)
    if (assigned.length === 1) {
      setSelectedWorkspace(assigned[0])
    }
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const u = await authService.signIn({ email, password })
      setUser(u)
      await loadWorkspaces(u)
      setStep('workspace')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao fazer login'
      setError(msg.replace(/^Invalid login credentials/, 'E-mail ou senha incorretos'))
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedWorkspace || !user || !deviceName.trim()) return
    setStep('saving')
    setSaving(true)
    setError(null)
    const deviceId = existing?.deviceId ?? crypto.randomUUID()
    try {
      // Provisiona identidade de kiosk e substitui a sessão humana local
      // pela sessão do device (credenciais humanas não ficam na TV).
      await provisionWithLogin({
        workspaceId: selectedWorkspace.id,
        deviceId,
        deviceName: deviceName.trim(),
      })
      onDone({
        deviceId,
        name: deviceName.trim(),
        workspace: selectedWorkspace,
        createdAt: new Date().toISOString(),
        // Preserva a preferência local de tela em reconfigurações
        // (nova instalação fica sem screenApp ⇒ resolve para 'tv').
        screenApp: existing?.screenApp,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar a TV')
      setSaving(false)
      setStep('name')
    }
  }

  const canLogin = email.trim() && password && !loading

  const handleActivate = async () => {
    const code = activationCode.trim().toUpperCase()
    if (code.length < 6) return
    setActivating(true)
    setError(null)
    try {
      const deviceId = existing?.deviceId ?? crypto.randomUUID()
      const res = await redeemActivationCode(code, deviceId, deviceName.trim())
      const name = deviceName.trim() || res.device_name || 'TV Desktop'
      onDone({
        deviceId,
        name,
        workspace: res.workspace,
        createdAt: new Date().toISOString(),
        // Preserva a preferência local de tela em reconfigurações
        // (nova instalação fica sem screenApp ⇒ resolve para 'tv').
        screenApp: existing?.screenApp,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ativar a TV')
      setActivating(false)
    }
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#080a14',
      backgroundImage: 'radial-gradient(ellipse at top, #1e293b 0%, #080a14 70%)',
      color: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 440, padding: '2rem' }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #ef4444, #e11d48)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 40px rgba(239,68,68,0.35)',
          }}>
            <Tv size={26} color="#fff" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>Lab Hub TV</h1>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.15rem 0 0' }}>
              {existing ? 'Reconfigurando esta TV' : 'Configuração inicial'}
            </p>
          </div>
        </div>

        {step === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              autoFocus
              style={inputStyle}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              style={inputStyle}
            />
            {error && (
              <p style={{ fontSize: '0.75rem', color: '#fca5a5', margin: 0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={!canLogin}
              style={{
                ...buttonStyle, marginTop: '0.25rem',
                background: 'linear-gradient(135deg, #ef4444, #e11d48)',
                opacity: canLogin ? 1 : 0.4, cursor: canLogin ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={() => setStep('activation')}
              style={{ ...ghostButtonStyle }}
            >
              <KeyRound size={14} /> Já tenho um código de ativação
            </button>
            {existing && (
              <button
                type="button"
                onClick={() => onDone(existing)}
                style={{ ...ghostButtonStyle }}
              >
                <ArrowLeft size={14} /> Voltar para a TV
              </button>
            )}
          </form>
        )}

        {step === 'activation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0, textAlign: 'center' }}>
              Digite o código de ativação gerado no painel do site
            </p>
            <input
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && activationCode.trim().length >= 6 && handleActivate()}
              placeholder="EX: AB3XYZ"
              maxLength={6}
              autoFocus
              style={{
                ...inputStyle,
                textAlign: 'center',
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                fontFamily: 'monospace',
                fontWeight: 700,
              }}
            />
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Nome da TV (opcional)"
              maxLength={60}
              style={inputStyle}
            />
            {error && (
              <p style={{ fontSize: '0.75rem', color: '#fca5a5', margin: 0, textAlign: 'center' }}>{error}</p>
            )}
            <button
              type="button"
              disabled={activating || activationCode.trim().length < 6}
              onClick={handleActivate}
              style={{
                ...buttonStyle, marginTop: '0.25rem',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                opacity: activating || activationCode.trim().length < 6 ? 0.4 : 1,
                cursor: activating || activationCode.trim().length < 6 ? 'not-allowed' : 'pointer',
              }}
            >
              {activating ? 'Ativando...' : 'Ativar TV'}
            </button>
            <button type="button" onClick={() => setStep('login')} style={{ ...ghostButtonStyle }}>
              <ArrowLeft size={14} /> Voltar
            </button>
          </div>
        )}

        {step === 'workspace' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0, textAlign: 'center' }}>
              A qual workspace esta TV pertence?
            </p>
            {workspaces.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#fca5a5', margin: 0, textAlign: 'center' }}>
                Este usuário não tem acesso a nenhum workspace. Fale com um administrador.
              </p>
            ) : (
              workspaces.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWorkspace(w)}
                  style={{
                    ...rowButtonStyle,
                    borderColor: selectedWorkspace?.id === w.id ? '#ef4444' : 'rgba(255,255,255,0.08)',
                    background: selectedWorkspace?.id === w.id ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: `linear-gradient(135deg, ${i < WS_COLORS.length ? WS_COLORS[i].split(' ')[0] : '#ef4444'}, ${i < WS_COLORS.length ? WS_COLORS[i].split(' ')[1] : '#e11d48'})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.85rem', fontWeight: 800, color: '#fff',
                  }}>
                    {w.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: '#f1f5f9' }}>{w.name}</p>
                    {w.location && <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0 }}>{w.location}</p>}
                  </div>
                  {selectedWorkspace?.id === w.id && <Check size={18} color="#ef4444" />}
                </button>
              ))
            )}
            <button
              type="button"
              disabled={!selectedWorkspace}
              onClick={() => setStep('name')}
              style={{
                ...buttonStyle,
                opacity: selectedWorkspace ? 1 : 0.4,
                cursor: selectedWorkspace ? 'pointer' : 'not-allowed',
                marginTop: '0.25rem',
              }}
            >
              Continuar
            </button>
            <button type="button" onClick={() => setStep('login')} style={{ ...ghostButtonStyle }}>
              <ArrowLeft size={14} /> Trocar de usuário
            </button>
          </div>
        )}

        {step === 'name' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0, textAlign: 'center' }}>
              Como esta TV deve ser chamada?
            </p>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              placeholder="Ex: TV Recepção, TV Lab 2..."
              maxLength={60}
              autoFocus
              style={inputStyle}
            />
            <button
              type="button"
              disabled={!deviceName.trim() || saving}
              onClick={handleConfirm}
              style={{
                ...buttonStyle,
                opacity: deviceName.trim() && !saving ? 1 : 0.4,
                cursor: deviceName.trim() && !saving ? 'pointer' : 'not-allowed',
                marginTop: '0.25rem',
              }}
            >
              {saving ? 'Salvando...' : 'Iniciar TV'}
            </button>
            <button type="button" onClick={() => setStep('workspace')} style={{ ...ghostButtonStyle }}>
              <ArrowLeft size={14} /> Voltar
            </button>
          </div>
        )}

        {step === 'saving' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '1rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>Registrando a TV...</p>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '0.7rem 0.9rem', borderRadius: 12,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#f1f5f9', fontSize: '0.9rem', outline: 'none',
  boxSizing: 'border-box',
}

const buttonStyle: CSSProperties = {
  width: '100%', padding: '0.7rem', borderRadius: 12,
  border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 700,
  cursor: 'pointer', transition: 'opacity 0.2s',
}

const ghostButtonStyle: CSSProperties = {
  width: '100%', padding: '0.6rem', borderRadius: 12,
  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
}

const rowButtonStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.75rem',
  padding: '0.75rem', borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  cursor: 'pointer', transition: 'all 0.2s', width: '100%',
}
