import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../core/auth/AuthContext'
import { authService } from '../../core/auth/service'
import { defaultDb } from '../../lib/supabase'
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

  const isPendingUser = signupSuccess || (!!user && user.status === 'pending')

  useEffect(() => {
    if (isAuthenticated && user?.status === 'active') {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

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
    try {
      const userEmail = buildUserEmail(username)
      if (mode === 'signin') {
        await signIn({ email: userEmail, password })
        navigate('/', { replace: true })
      } else {
        await signUp({ email: userEmail, password, name: username })
        setSignupSuccess(true)
      }
    } catch {
      // error is handled by useAuth
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
              mode === 'signin' ? 'bg-emerald-500 text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'signup' ? 'bg-emerald-500 text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Usuário</label>
            <div className="flex items-center overflow-hidden rounded-xl border border-line bg-card focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                pattern="[a-zA-Z0-9._-]+"
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
                className="w-full rounded-xl border border-line bg-card px-4 py-3 pr-11 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : mode === 'signin' ? 'Entrar' : 'Solicitar Acesso'}
          </button>
        </form>
      </div>
    </div>
  )
}
