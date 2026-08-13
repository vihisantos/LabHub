import { icons } from '../../../lib/icons'

interface StarsProps {
  value: number
  onChange?: (value: number) => void
  size?: number
  disabled?: boolean
}

export function Stars({ value, onChange, size = 22, disabled }: StarsProps) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled || !onChange}
          onClick={() => onChange?.(n)}
          className={onChange && !disabled ? 'p-1 transition-transform active:scale-90' : 'p-1'}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
        >
          <icons.ui.star
            size={size}
            className={n <= value ? 'fill-amber-500 text-amber-500' : 'text-fg-dim'}
          />
        </button>
      ))}
    </div>
  )
}
