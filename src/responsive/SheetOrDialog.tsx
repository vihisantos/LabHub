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

type SheetOrDialogRole = 'dialog' | 'alertdialog'

interface SheetOrDialogProps {
  open: boolean
  onClose: () => void
  /** Título exibido no sheet (SheetHeader) ou no diálogo (DialogTitle). */
  title?: string
  /** Descrição exibida somente na variante diálogo (desktop/wide). */
  description?: string
  /**
   * Semântica ARIA do conteúdo (default `dialog`). Use `alertdialog` para
   * confirmações destrutivas: o postura é preservada nas DUAS faixas, porque o
   * BottomSheet não declara role próprio (o consumidor da sheet adiciona).
   */
  role?: SheetOrDialogRole
  /**
   * Rótulo acessível do conteúdo quando não há `title` (ex.: conteúdo sem
   * cabeçalho dentro do BottomSheet, que não deriva nome).
   */
  ariaLabel?: string
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
  role = 'dialog',
  ariaLabel,
  children,
  className,
}: SheetOrDialogProps) {
  const { bp } = useBreakpoint()

  if (bp === 'compact' || bp === 'tablet') {
    return (
      <BottomSheet open={open} onClose={onClose}>
        <div
          role={role}
          aria-modal="true"
          aria-label={ariaLabel ?? title}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        >
          {title != null && <SheetHeader title={title} onClose={onClose} />}
          {children}
        </div>
      </BottomSheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        role={role}
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