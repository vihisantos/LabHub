/* eslint-disable react/only-export-components */
import type { User } from '../../../core/auth/types'
import { icons } from '../../../lib/icons'

const ACCENT_COLORS: Record<string, string> = {
  emerald: '#10b981',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  purple: '#a855f7',
}

export function accentColor(accent?: string): string {
  return ACCENT_COLORS[accent ?? ''] ?? '#10b981'
}

export function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function statusStyle(status: string): { dot: string; label: string; text: string; chip: string } {
  switch (status) {
    case 'pending':
      return {
        dot: 'bg-amber-500',
        label: 'Pendente',
        text: 'text-amber-600 dark:text-amber-400',
        chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      }
    case 'active':
      return {
        dot: 'bg-emerald-500',
        label: 'Ativo',
        text: 'text-emerald-600 dark:text-emerald-400',
        chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      }
    case 'blocked':
    case 'inactive':
      return {
        dot: 'bg-red-500',
        label: 'Bloqueado',
        text: 'text-red-600 dark:text-red-400',
        chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
      }
    default:
      return {
        dot: 'bg-slate-400',
        label: status,
        text: 'text-fg-muted',
        chip: 'bg-input text-fg-muted',
      }
  }
}

export function PersonAvatar({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' | 'lg' }) {
  const dims =
    size === 'sm' ? 'h-9 w-9 rounded-lg' : size === 'lg' ? 'h-16 w-16 rounded-2xl' : 'h-11 w-11 rounded-xl'
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 28 : 20
  const color = accentColor(user.accent)

  if (user.avatar) {
    return <img src={user.avatar} alt={user.name} className={`${dims} shrink-0 object-cover`} />
  }
  return (
    <div
      className={`${dims} flex shrink-0 items-center justify-center`}
      style={{ backgroundColor: color + '15', color }}
    >
      <icons.ui.user size={iconSize} />
    </div>
  )
}
