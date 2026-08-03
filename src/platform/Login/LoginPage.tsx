import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, signUp, error, loading, isAuthenticated, user } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupSuccess, setSignupSuccess] = useState(false)

  useEffect(() => {
    if (isAuthenticated && user?.status === 'active') {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (mode === 'signin') {
        await signIn({ email, password })
        navigate('/', { replace: true })
      } else {
        const userEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@labhub.com`
        await signUp({ email: userEmail, password, name: username })
        setSignupSuccess(true)
      }
    } catch {
      // error is handled by useAuth
    }
  }

  // Signup success screen — animated!
  if (signupSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex min-h-dvh flex-col items-center justify-center bg-surface overflow-hidden px-5"
      >
        {/* Floating dots background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-emerald-500/20"
              style={{
                left: `${15 + (i * 15) % 70}%`,
                top: `${20 + (i * 12) % 60}%`,
              }}
              animate={{
                y: [0, -25, 0],
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: 3 + (i % 3),
                repeat: Infinity,
                delay: i * 0.5,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative z-10 mb-8 text-center max-w-sm"
        >
          {/* Animated checkmark circle */}
          <motion.div
            className="mx-auto mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          >
            <div className="relative">
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                {/* Outer ring */}
                <motion.circle
                  cx="36" cy="36" r="34"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-emerald-500/30"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
                {/* Inner bg */}
                <circle cx="36" cy="36" r="28" className="fill-emerald-500/10" />
                {/* Checkmark */}
                <motion.path
                  d="M24 36l8 8 16-16"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-500"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.6, delay: 0.6, ease: 'easeOut' }}
                />
                {/* Pulsing dot at center */}
                <motion.circle
                  cx="36" cy="36" r="2"
                  className="fill-emerald-500"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.6, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 1.5, ease: 'easeInOut' }}
                />
              </svg>
              {/* Glow ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  boxShadow: '0 0 30px rgba(16, 185, 129, 0.15)',
                }}
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            className="text-2xl font-bold text-fg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            Conta Criada!
          </motion.h1>

          {/* Description */}
          <motion.p
            className="mt-3 text-sm text-fg-muted leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1 }}
          >
            Sua conta foi criada e está aguardando aprovação do administrador.
            Você receberá acesso automaticamente quando for aprovado.
          </motion.p>

          {/* Waiting indicator */}
          <motion.div
            className="mt-6 flex items-center justify-center gap-2.5 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-5 py-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.2 }}
          >
            <div className="relative flex h-4 w-4 items-center justify-center">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Aguardando aprovação
            </span>
          </motion.div>

          {/* Back button */}
          <motion.button
            type="button"
            onClick={() => { setMode('signin'); setSignupSuccess(false) }}
            className="mt-8 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-[0.97]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Voltar para Login
          </motion.button>

          {/* Bottom line */}
          <motion.div
            className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.8, duration: 0.6 }}
          />
        </motion.div>
      </motion.div>
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
          {mode === 'signup' ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Usuário</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  pattern="[a-zA-Z0-9._-]+"
                  className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="meu.usuario"
                />
                <p className="mt-1 text-[10px] text-fg-dim">
                  Email gerado: <span className="font-mono text-fg-muted">{username || 'usuario'}@labhub.com</span>
                </p>
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
            </>
          ) : (
            <>
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
            </>
          )}

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
