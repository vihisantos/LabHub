import type { User } from '../../core/auth/types'
import { accentColor } from '../../core/theme/constants'
import { icons } from '../../lib/icons'

interface UserAvatarProps {
  user: User
  size?: number
  className?: string
}

export function UserAvatar({ user, size = 40, className = '' }: UserAvatarProps) {
  const color = accentColor(user.accent)
  const initial = user.name?.trim()?.charAt(0)?.toUpperCase() || '?'

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: color }}
    >
      {initial}
    </div>
  )
}

export function AvatarIcon({ user, size = 40, className = '' }: UserAvatarProps) {
  const color = accentColor(user.accent)

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        className={`object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ width: size, height: size, backgroundColor: color + '15', color }}
    >
      <icons.ui.user size={size * 0.55} />
    </div>
  )
}
