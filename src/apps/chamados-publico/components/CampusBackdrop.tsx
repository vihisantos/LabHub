import type { ReactNode } from 'react'
import piracicabaUrl from '../assets/campuses/piracicaba.webp?url'
import moocaUrl from '../assets/campuses/mooca.webp?url'
import sjcUrl from '../assets/campuses/sjc.webp?url'
import type { CampusArtworkKey } from '../utils/campusArtwork'
import './CampusBackdrop.css'

// Static URL imports: Vite emits each WebP as a separate hashed asset and
// includes them in the Workbox precache manifest automatically.
// The browser only downloads the image when the corresponding <img> is rendered
// (i.e. when the matching campus is selected), so network cost is deferred.
const artwork: Record<CampusArtworkKey, string> = {
  piracicaba: piracicabaUrl,
  mooca: moocaUrl,
  sjc: sjcUrl,
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
