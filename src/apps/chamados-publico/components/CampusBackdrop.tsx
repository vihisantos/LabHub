import type { ReactNode } from 'react'
import piracicaba from '../assets/campuses/piracicaba.svg'
import mooca from '../assets/campuses/mooca.svg'
import sjc from '../assets/campuses/sjc.svg'
import type { CampusArtworkKey } from '../utils/campusArtwork'
import './CampusBackdrop.css'

// Prefer optimized photographs when present; keep SVG fallbacks during migration.
const optimized = import.meta.glob<string>('../assets/campuses/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

const artwork: Record<CampusArtworkKey, string> = {
  piracicaba: optimized['../assets/campuses/piracicaba.webp'] ?? piracicaba,
  mooca: optimized['../assets/campuses/mooca.webp'] ?? mooca,
  sjc: optimized['../assets/campuses/sjc.webp'] ?? sjc,
}

export function CampusBackdrop({
  campus,
  variant = 'form',
}: {
  campus?: CampusArtworkKey
  variant?: 'form' | 'success'
}) {
  if (!campus) return null
  const src = artwork[campus]
  return (
    <div aria-hidden="true" className={`campus-backdrop campus-backdrop--${variant}`}>
      <img key={src} src={src} alt="" draggable={false} decoding="async" className="campus-backdrop__image" />
    </div>
  )
}

/** A bounded header: campus artwork must never sit behind the form fields. */
export function CampusHero({
  campus,
  variant = 'form',
  children,
  className = '',
}: {
  campus?: CampusArtworkKey
  variant?: 'form' | 'success'
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`campus-hero campus-hero--${variant}${campus ? ' campus-hero--illustrated' : ''} ${className}`}>
      <CampusBackdrop campus={campus} variant={variant} />
      <div className="campus-hero__content">{children}</div>
    </div>
  )
}
