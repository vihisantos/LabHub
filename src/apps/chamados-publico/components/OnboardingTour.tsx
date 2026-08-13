import { useCallback, useLayoutEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { icons } from '../../../lib/icons'

export interface TourStep {
  key: string
  target: () => HTMLElement | null
  title: string
  description: string
}

const TOUR_KEY = 'labhub_chamados_tour_done'

export function isTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return true
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {
    // storage indisponível — não bloqueia
  }
}

interface OnboardingTourProps {
  steps: TourStep[]
  onClose: () => void
}

export function OnboardingTour({ steps, onClose }: OnboardingTourProps) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  const updateRect = useCallback(() => {
    const el = steps[index]?.target()
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [steps, index])

  useLayoutEffect(() => {
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [updateRect])

  const step = steps[index]
  const last = index === steps.length - 1

  function handleNext() {
    if (last) {
      markTourDone()
      onClose()
      return
    }
    setIndex((i) => i + 1)
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Tour do formulário de chamados">
      {rect && (
        <motion.div
          className="pointer-events-none absolute z-10 rounded-2xl border-2 border-amber-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{ boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.72)' }}
        />
      )}

      <div className="absolute inset-0 z-0" onClick={onClose} aria-hidden="true" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-card p-5 shadow-[var(--shadow-elevated)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex gap-1.5">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-6 bg-amber-500' : 'w-1.5 bg-line'
                  }`}
                />
              ))}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
              aria-label="Fechar tour"
            >
              <icons.ui.close size={16} />
            </button>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">
            Passo {index + 1} de {steps.length}
          </p>
          <h3 className="mt-1 text-lg font-bold text-fg">{step?.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{step?.description}</p>

          <div className="mt-5 flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input"
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
            >
              {last ? 'Entendi' : 'Próximo'}
              {!last && <icons.ui.chevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
