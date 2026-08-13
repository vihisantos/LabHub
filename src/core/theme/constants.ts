import type { Accent, ThemeVariant } from '../auth/types'
import { icons } from '../../lib/icons'

export const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: 'blue', label: 'Azul', color: '#3b82f6' },
  { value: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { value: 'cyan', label: 'Ciano', color: '#06b6d4' },
  { value: 'purple', label: 'Roxo', color: '#a855f7' },
]

export const THEMES: { value: ThemeVariant; label: string; icon: typeof icons.ui.sun }[] = [
  { value: 'dark', label: 'Escuro', icon: icons.ui.moon },
  { value: 'dim', label: 'Sutil', icon: icons.ui.sun },
  { value: 'light', label: 'Claro', icon: icons.ui.sun },
]

export function accentColor(accent: Accent): string {
  return ACCENTS.find((a) => a.value === accent)?.color || '#3b82f6'
}
