import type { ElementType, ReactNode } from 'react'
import { cn } from '../lib/components/ui/utils'

interface PageContainerProps {
  /** Elemento semântico renderizado como container (default `div`). */
  as?: ElementType
  className?: string
  children: ReactNode
}

/**
 * Container de página centralizado. Substituirá, fase a fase, os `max-w-lg`/
 * `max-w-*` manuais espalhados pelos módulos.
 *
 * Largura e gutters são adaptados conforme a faixa de viewport. Este é o ÚNICO
 * lugar com permissão de escrever larguras de breakpoint "na mão"; os módulos
 * só compõem `<PageContainer>`.
 *
 * Faixas (Tailwind v4): compact <640 · tablet sm:640 · desktop lg:1024 · wide xl:1280.
 */
export function PageContainer({ as: Tag = 'div', className, children }: PageContainerProps) {
  return (
    <Tag
      className={cn(
        'mx-auto w-full max-w-lg px-4 sm:max-w-3xl sm:px-6 lg:max-w-6xl xl:max-w-7xl xl:px-8',
        className,
      )}
    >
      {children}
    </Tag>
  )
}