import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, signUp, error, loading, isAuthenticated } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (mode === 'signin') {
        await signIn({ email, password })
      } else {
        await signUp({ email, password, name })
      }
      navigate('/', { replace: true })
    } catch {
      // error is handled by useAuth
    }
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
          {mode === 'signup' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Seu nome"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : mode === 'signin' ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>
      </div>
    </div>
  )
}
