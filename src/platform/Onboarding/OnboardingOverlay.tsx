import { useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { icons } from '../../lib/icons'

function storageKey(userId: string): string {
  return 'labhub_onboarding_done_' + userId
}

export function hasCompletedOnboarding(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === 'true'
  } catch {
    return false
  }
}

export function completeOnboarding(userId: string): void {
  try {
    localStorage.setItem(storageKey(userId), 'true')
  } catch {
    // storage indisponível — não bloqueia o tour
  }
}

interface Step {
  icon: ReactNode
  color: string
  title: string
  description: string
}

function makeSteps(userName: string): Step[] {
  const firstName = userName.trim().split(' ')[0] || 'Bem-vindo'
  return [
    {
      icon: <icons.ui.partyPopper size={28} />,
      color: '#10b981',
      title: `Olá, ${firstName}!`,
      description:
        'Este é o LabHub, o sistema do laboratório. Tudo o que você precisa está aqui, em um só lugar.',
    },
    {
      icon: <icons.ui.home size={28} />,
      color: '#8b5cf6',
      title: 'Clique nos aplicativos',
      description:
        'A tela inicial mostra os aplicativos que você pode usar. Toque no grande para abrir — é só isso.',
    },
    {
      icon: <icons.ui.alertCircle size={28} />,
      color: '#f59e0b',
      title: 'Atalhos rápidos',
      description:
        'Quando disponíveis, os atalhos facilitam: escanear, abrir chamados, cadastrar ativo e ver logs.',
    },
    {
      icon: <icons.ui.inbox size={28} />,
      color: '#ef4444',
      title: 'Notificações',
      description:
        'Toque no sino para ver seus alertas. O número vermelho indica novidades que precisam da sua atenção.',
    },
    {
      icon: <icons.ui.user size={28} />,
      color: '#0ea5e9',
      title: 'Seu perfil',
      description:
        'Toque no seu avatar para acessar o perfil, trocar de laboratório (workspace) ou sair.',
    },
    {
      icon: <icons.ui.checkCircle size={28} />,
      color: '#10b981',
      title: 'Tudo pronto!',
      description:
        'Aproveite o LabHub. Se precisar de ajuda, é só falar com o responsável pelo laboratório.',
    },
  ]
}

interface OnboardingOverlayProps {
  open: boolean
  userName: string
  onFinish: () => void
}

export function OnboardingOverlay({ open, userName, onFinish }: OnboardingOverlayProps) {
  const steps = makeSteps(userName)
  const [index, setIndex] = useState(0)

  const step = steps[index]
  const isLast = index === steps.length - 1

  function goNext() {
    if (isLast) {
      onFinish()
    } else {
      setIndex(index + 1)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-full max-w-md rounded-t-3xl bg-surface p-6 text-fg shadow-2xl sm:rounded-3xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                Tour de boas-vindas · {index + 1}/{steps.length}
              </span>
              <button
                type="button"
                onClick={onFinish}
                className="rounded-lg px-3 py-1 text-xs font-medium text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                Pular
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-6 text-center"
              >
                <div
                  className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl"
                  style={{ backgroundColor: step.color + '18', color: step.color }}
                >
                  {step.icon}
                </div>
                <h2 className="mb-2 text-xl font-bold text-fg">{step.title}</h2>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-fg-muted">{step.description}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mb-5 flex items-center justify-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-6 bg-emerald-500' : 'w-1.5 bg-fg-muted/30'
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIndex(Math.max(0, index - 1))}
                disabled={index === 0}
                className="flex h-12 flex-1 items-center justify-center rounded-xl bg-card text-sm font-semibold text-fg transition-colors hover:bg-input disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={goNext}
                className="flex h-12 flex-[2] items-center justify-center rounded-xl bg-emerald-500 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
              >
                {isLast ? 'Começar!' : 'Continuar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
