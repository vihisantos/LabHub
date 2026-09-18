import type { ReactNode } from 'react'
import { BottomSheet, SheetHeader } from '../platform/ui/BottomSheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../lib/components/ui/dialog'
import { cn } from '../lib/components/ui/utils'
import { useBreakpoint } from './useBreakpoint'

interface SheetOrDialogProps {
  open: boolean
  onClose: () => void
  /** Título exibido no sheet (SheetHeader) ou no diálogo (DialogTitle). */
  title?: string
  /** Descrição exibida somente na variante diálogo (desktop/wide). */
  description?: string
  /** Único conteúdo reutilizado nas duas variantes. */
  children: ReactNode
  className?: string
}

/**
 * Primitive para o padrão "mesmo conteúdo, enquadramento conforme a faixa":
 * - compact/tablet → BottomSheet (mobile-first, drag para fechar);
 * - desktop/wide → Dialog (Radix) centralizado.
 *
 * A lógica e o conteúdo continuam únicos — só o chrome muda.
 */
export function SheetOrDialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: SheetOrDialogProps) {
  const { bp } = useBreakpoint()

  if (bp === 'compact' || bp === 'tablet') {
    return (
      <BottomSheet open={open} onClose={onClose}>
        {title != null && <SheetHeader title={title} onClose={onClose} />}
        {children}
      </BottomSheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className={cn('max-h-[85vh] overflow-y-auto bg-card text-fg border-line', className)}
      >
        {(title != null || description != null) && (
          <DialogHeader className="text-left">
            {title != null && <DialogTitle>{title}</DialogTitle>}
            {description != null && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  )
}