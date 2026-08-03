import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import type { ReactNode } from 'react'
import { icons } from '../../lib/icons'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const dragControls = useDragControls()

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
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose()
            }}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface text-fg shadow-2xl"
          >
            {/* Drag handle */}
            <div
              className="flex shrink-0 cursor-grab items-center justify-center pt-3 pb-1 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="h-1.5 w-10 rounded-full bg-fg-muted/30" />
            </div>
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
  hideClose?: boolean
  children?: ReactNode
}

export function SheetHeader({ title, subtitle, onClose, hideClose, children }: SheetHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-3 pt-1">
      <div className="min-w-0">
        {title && <h2 className="truncate text-lg font-bold text-fg">{title}</h2>}
        {subtitle && <p className="truncate text-xs text-fg-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
          >
            <icons.ui.close size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
