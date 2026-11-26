import piracicaba from '../assets/campuses/piracicaba.svg'
import type { CampusArtworkKey } from '../utils/campusArtwork'
import './CampusBackdrop.css'

const artwork: Record<CampusArtworkKey, string> = { piracicaba }

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
      <img key={src} src={src} alt="" draggable={false} className="campus-backdrop__image" />
    </div>
  )
}
