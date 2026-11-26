import { useEffect, useRef } from 'react'
import type { ReactNode, KeyboardEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion'

/** Portal avoids clipping/fixed-position issues inside the public route's
 * animated layout. Only local UI state controls opening and closing. */
export function FeedbackSheet({ open, onClose, children }: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex="0"]',
    ) ?? []).filter(element => element.tabIndex >= 0)
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <FeedbackSheetContent key="feedback-sheet" panel={panel} onKeyDown={handleKeyDown}>
          {children}
        </FeedbackSheetContent>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// AnimatePresence keeps the exiting element mounted until the animation
// finishes. Make that visual-only exit inaccessible and non-interactive
// immediately, even when animation frames are delayed.
function FeedbackSheetContent({ panel, onKeyDown, children }: {
  panel: RefObject<HTMLDivElement | null>
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}) {
  const isPresent = useIsPresent()
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      aria-hidden={!isPresent}
      inert={!isPresent}
      className={`fixed inset-0 z-[100] flex items-end justify-center ${isPresent ? '' : 'pointer-events-none'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22 }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden="true" />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal={isPresent ? true : undefined}
        aria-label="Avaliar atendimento"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={reduceMotion ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: reduceMotion ? 0 : '100%' }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-card text-fg shadow-2xl outline-none"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-center pb-2 pt-3" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-fg-muted/30" />
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
