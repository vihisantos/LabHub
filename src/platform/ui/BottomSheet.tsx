import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { icons } from '../../lib/icons'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface text-fg shadow-2xl"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

interface SheetHeaderProps {
  title?: string
  subtitle?: string
  onClose: () => void
  children?: ReactNode
}

export function SheetHeader({ title, subtitle, onClose, children }: SheetHeaderProps) {
  return (
    <>
      <div className="relative flex shrink-0 items-center justify-center pt-3">
        <div className="h-1.5 w-10 rounded-full bg-fg-muted/30" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
        >
          <icons.ui.close size={16} />
        </button>
      </div>
      <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
        <div>
          {title && <h2 className="text-lg font-bold text-fg">{title}</h2>}
          {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </>
  )
}
