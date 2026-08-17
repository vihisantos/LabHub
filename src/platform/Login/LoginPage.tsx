import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Fingerprint } from 'lucide-react'
import { useAuth } from '../../core/auth/AuthContext'
import { authService } from '../../core/auth/service'
import { defaultDb } from '../../lib/supabase'
import { browserSupportsPasskey, securityService } from '../../core/auth/securityService'
import { SignupStatusScreen } from './SignupStatusScreen'

export function buildUserEmail(username: string): string {
  return `${username.toLowerCase().replace(/[^a-z0-9.-]/g, '')}@labhub.com`
}

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, signUp, error, loading, isAuthenticated, user } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<'waiting' | 'approved' | 'rejected'>('waiting')
  const [secondsLeft, setSecondsLeft] = useState(60)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  const isPendingUser = signupSuccess || (!!user && user.status === 'pending')
  const canPasskey = browserSupportsPasskey()

  useEffect(() => {
    if (isAuthenticated && user?.status === 'active' && !mfaRequired) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, user, navigate, mfaRequired])

  useEffect(() => {
    if (isPendingUser && user?.id) {
      setPendingUserId((cur) => cur ?? user.id)
    }
  }, [isPendingUser, user])

  useEffect(() => {
    if (!isPendingUser || !pendingUserId) return
    let cancelled = false

    const check = async () => {
      if (!defaultDb) return
      const { data, error } = await defaultDb
        .from('profiles')
        .select('id, status')
        .eq('id', pendingUserId)
        .maybeSingle()
      if (cancelled || error) return
      if (!data) {
        setPendingStatus('rejected')
      } else if (data.status === 'active') {
        setPendingStatus('approved')
      }
    }

    check()
    const timer = setInterval(check, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isPendingUser, pendingUserId])

  useEffect(() => {
    if (pendingStatus !== 'approved') return
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [pendingStatus])

  function handleEnterApp() {
    authService.refreshProfile().finally(() => navigate('/', { replace: true }))
  }

  useEffect(() => {
    if (pendingStatus === 'approved' && secondsLeft === 0) {
      handleEnterApp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStatus, secondsLeft])

  function handleRetry() {
    setSignupSuccess(false)
    setPendingStatus('waiting')
    setPendingUserId(null)
    setSecondsLeft(60)
    setMode('signup')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMfaError(null)
    try {
      const userEmail = buildUserEmail(username)
      if (mode === 'signin') {
        await signIn({ email: userEmail, password })
        // Usuário com fator MFA: sessão fica em aal1 — precisa do 2º fator antes de entrar
        const aal = await securityService.getAssuranceLevel()
        if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          setMfaRequired(true)
          return
        }
        navigate('/', { replace: true })
      } else {
        await signUp({ email: userEmail, password, name: username })
        setSignupSuccess(true)
      }
    } catch {
      // error is handled by useAuth
    }
  }

  async function handlePasskey() {
    setPasskeyError(null)
    setPasskeyBusy(true)
    try {
      const res = await securityService.signInWithPasskey()
      if (!res.ok) {
        setPasskeyError(res.error || 'Falha ao entrar com biometria')
        return
      }
      // Sessão criada pelo passkey — verifica se ainda falta MFA
      const aal = await securityService.getAssuranceLevel()
      if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        setMfaRequired(true)
        return
      }
      authService.refreshProfile().finally(() => navigate('/', { replace: true }))
    } catch (e) {
      setPasskeyError(e instanceof Error ? e.message : 'Falha ao entrar com biometria')
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function handleMfaConfirm() {
    setMfaError(null)
    setMfaBusy(true)
    try {
      const { webauthn } = await securityService.listFactors()
      const factor = webauthn[0]
      if (!factor) {
        setMfaError('Nenhum fator biométrico cadastrado nesta conta')
        return
      }
      const res = await securityService.authenticateWebauthn(factor.id)
      if (!res.ok) {
        setMfaError(res.error || 'Falha na verificação biométrica')
        return
      }
      setMfaRequired(false)
      authService.refreshProfile().finally(() => navigate('/', { replace: true }))
    } catch (e) {
      setMfaError(e instanceof Error ? e.message : 'Falha na verificação biométrica')
    } finally {
      setMfaBusy(false)
    }
  }

  if (isPendingUser) {
    return (
      <SignupStatusScreen
        status={pendingStatus}
        secondsLeft={secondsLeft}
        totalSeconds={60}
        onEnter={handleEnterApp}
        onRetry={handleRetry}
      />
    )
  }

  if (mfaRequired) {
    return (
      <MfaStep
        busy={mfaBusy}
        error={mfaError}
        onConfirm={handleMfaConfirm}
        onBack={() => {
          setMfaRequired(false)
          setMfaError(null)
        }}
      />
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5">
      <div className="mb-8 text-center">
        <img src="/logo-192.png" alt="LabHub" className="mx-auto mb-3 h-14 w-14 rounded-2xl" />
        <h1 className="text-2xl font-bold text-fg">LabHub</h1>
        <p className="mt-1 text-sm text-fg-muted">Plataforma de Gestão de Laboratórios</p>
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-4 flex rounded-xl bg-card p-1">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'signin' ? 'bg-blue-500 text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'signup' ? 'bg-blue-500 text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Usuário</label>
            <div className="flex items-center overflow-hidden rounded-xl border border-line bg-card focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                pattern="[a-zA-Z0-9._\-]+"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:outline-none"
                placeholder="nome.escolhido"
              />
              <span className="shrink-0 pr-4 text-sm text-fg-muted">@labhub.com</span>
            </div>
            <p className="mt-1 text-[10px] text-fg-dim">
              Email: <span className="font-mono text-fg-muted">{username || 'usuario'}@labhub.com</span>
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-xl border border-line bg-card px-4 py-3 pr-11 text-sm text-fg placeholder:text-fg-dim focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-dim transition-colors hover:text-fg"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : mode === 'signin' ? 'Entrar' : 'Solicitar Acesso'}
          </button>

          {mode === 'signin' && canPasskey && (
            <>
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-fg-dim">ou</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <button
                type="button"
                onClick={handlePasskey}
                disabled={passkeyBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card py-3 text-sm font-semibold text-fg transition-colors hover:bg-input disabled:opacity-50"
              >
                <Fingerprint size={18} className="text-blue-500" />
                {passkeyBusy ? 'Verificando biometria...' : 'Entrar com biometria'}
              </button>
              {passkeyError && <p className="text-xs text-red-500">{passkeyError}</p>}
            </>
          )}
        </form>
      </div>
    </div>
  )
}

/** Tela de confirmação do segundo fator (biometria) após a senha. */
function MfaStep({
  busy,
  error,
  onConfirm,
  onBack,
}: {
  busy: boolean
  error: string | null
  onConfirm: () => void
  onBack: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5">
      <div className="mb-8 text-center">
        <img src="/logo-192.png" alt="LabHub" className="mx-auto mb-3 h-14 w-14 rounded-2xl" />
        <h1 className="text-2xl font-bold text-fg">Verificação em duas etapas</h1>
        <p className="mt-1 text-sm text-fg-muted">Confirme sua identidade com a biometria</p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
            <Fingerprint size={32} />
          </div>
          <p className="text-sm text-fg-muted">
            Toque no botão abaixo e use a biometria (impressão digital, Face ID ou chave de segurança) para
            concluir o login.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:opacity-50"
        >
          <Fingerprint size={18} />
          {busy ? 'Verificando...' : 'Confirmar com biometria'}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="w-full rounded-xl py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          Voltar e trocar de conta
        </button>
      </div>
    </div>
  )
}
