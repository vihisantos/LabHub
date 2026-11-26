import piracicaba from '../assets/campuses/piracicaba.svg'
import mooca from '../assets/campuses/mooca.svg'
import sjc from '../assets/campuses/sjc.svg'
import type { CampusArtworkKey } from '../utils/campusArtwork'
import './CampusBackdrop.css'

const artwork: Record<CampusArtworkKey, string> = { piracicaba, mooca, sjc }

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
