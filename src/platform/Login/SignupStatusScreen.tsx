import { motion } from 'framer-motion'

interface SignupStatusScreenProps {
  status: 'waiting' | 'approved' | 'rejected'
  secondsLeft?: number
  totalSeconds?: number
  onEnter: () => void
  onRetry: () => void
}

function ApprovedIcon() {
  return (
    <div className="relative">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <motion.circle
          cx="36" cy="36" r="34"
          stroke="currentColor"
          strokeWidth="2"
          className="text-blue-500/30"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        <circle cx="36" cy="36" r="28" className="fill-blue-500/10" />
        <motion.path
          d="M24 36l8 8 16-16"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-blue-500"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.6, ease: 'easeOut' }}
        />
        <motion.circle
          cx="36" cy="36" r="2"
          className="fill-blue-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: 1.5, ease: 'easeInOut' }}
        />
      </svg>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: '0 0 30px rgba(16, 185, 129, 0.15)' }}
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

function RejectedIcon() {
  return (
    <div className="relative">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <motion.circle
          cx="36" cy="36" r="34"
          stroke="currentColor"
          strokeWidth="2"
          className="text-red-500/30"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        <circle cx="36" cy="36" r="28" className="fill-red-500/10" />
        <motion.path
          d="M27 27l18 18"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-red-500"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.6, ease: 'easeOut' }}
        />
        <motion.path
          d="M45 27L27 45"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-red-500"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.85, ease: 'easeOut' }}
        />
      </svg>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: '0 0 30px rgba(239, 68, 68, 0.15)' }}
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

function WaitingIcon() {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-blue-500/20">
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-blue-500/40"
        animate={{ scale: [1, 1.15], opacity: [0.6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-blue-500/40"
        animate={{ scale: [1, 1.15], opacity: [0.6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, delay: 0.8, ease: 'easeOut' }}
      />
      <motion.div
        className="h-4 w-4 rounded-full bg-blue-500"
        animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

export function SignupStatusScreen({ status, secondsLeft = 60, totalSeconds = 60, onEnter, onRetry }: SignupStatusScreenProps) {
  const approved = status === 'approved'
  const rejected = status === 'rejected'
  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex min-h-dvh flex-col items-center justify-center bg-surface overflow-hidden px-5"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            className={`absolute h-1.5 w-1.5 rounded-full ${rejected ? 'bg-red-500/20' : 'bg-blue-500/20'}`}
            style={{
              left: `${15 + ((i * 15) % 70)}%`,
              top: `${20 + ((i * 12) % 60)}%`,
            }}
            animate={{ y: [0, -25, 0], opacity: [0, 0.5, 0] }}
            transition={{ duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 mb-8 w-full max-w-sm text-center"
      >
        <motion.div
          className="mx-auto mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        >
          {rejected ? <RejectedIcon /> : approved ? <ApprovedIcon /> : <WaitingIcon />}
        </motion.div>

        <motion.h1
          className={`text-2xl font-bold ${rejected ? 'text-red-500' : approved ? 'text-blue-500' : 'text-fg'}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          {rejected ? 'Conta Negada' : approved ? 'Conta Aprovada!' : 'Conta Criada!'}
        </motion.h1>

        <motion.p
          className="mt-3 text-sm leading-relaxed text-fg-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
        >
          {rejected
            ? 'Criação de conta negada pelo administrador.'
            : approved
              ? 'O administrador está montando sua stack. Aguarde — isso pode levar até 1 minuto.'
              : 'Sua conta foi criada e está aguardando aprovação do administrador. Você receberá acesso automaticamente quando for aprovado.'}
        </motion.p>

        {approved && (
          <motion.div
            className="mt-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.2 }}
          >
            <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
              <span>Montando seu ambiente...</span>
              <span className="font-mono text-blue-500">{secondsLeft}s</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-blue-500/15">
              <motion.div
                className="h-full rounded-full bg-blue-500"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'linear' }}
              />
            </div>
            <motion.button
              type="button"
              onClick={onEnter}
              className="mt-6 w-full rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-400 active:scale-[0.97]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              Entrar agora
            </motion.button>
          </motion.div>
        )}

        {!approved && !rejected && (
          <motion.div
            className="mt-6 flex items-center justify-center gap-2.5 rounded-2xl border border-blue-500/15 bg-blue-500/5 px-5 py-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.2 }}
          >
            <div className="relative flex h-4 w-4 items-center justify-center">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            </div>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Aguardando aprovação
            </span>
          </motion.div>
        )}

        {rejected && (
          <motion.button
            type="button"
            onClick={onRetry}
            className="mt-8 w-full rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-all hover:bg-red-400 active:scale-[0.97]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            Tentar novamente
          </motion.button>
        )}

        {!approved && !rejected && (
          <motion.button
            type="button"
            onClick={onRetry}
            className="mt-8 w-full rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-400 active:scale-[0.97]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            Voltar para Login
          </motion.button>
        )}

        <motion.div
          className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1.8, duration: 0.6 }}
        />
      </motion.div>
    </motion.div>
  )
}
