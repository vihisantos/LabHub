import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from './utils'

const TooltipProvider = TooltipPrimitive.Provider
const TooltipRoot = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 shadow-xl data-[state=open]:animate-tooltip-show',
      className,
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }
