import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-emerald-600/20 text-emerald-400',
        secondary: 'border-transparent bg-slate-800 text-slate-300',
        destructive: 'border-transparent bg-red-600/20 text-red-400',
        outline: 'text-slate-300 border-slate-600',
        warning: 'border-transparent bg-amber-600/20 text-amber-400',
        info: 'border-transparent bg-blue-600/20 text-blue-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
