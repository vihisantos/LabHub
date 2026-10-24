import { useState, useEffect, useRef, useCallback } from 'react'
import { Images } from 'lucide-react'
import type { TvGalleryPhoto } from '../types'

const PHOTO_MS = 15_000
const FADE_MS = 1000

interface PhotoSlideshowProps {
  photos: TvGalleryPhoto[]
  title: string
  onAllFailed?: () => void
}

export function PhotoSlideshow({ photos, title, onAllFailed }: PhotoSlideshowProps) {
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'enter' | 'zoom' | 'exit'>('enter')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset de falhas quando a galeria muda.
  useEffect(() => {
    setFailedIds(new Set())
    setIndex(0)
    setPhase('enter')
  }, [photos])

  const validPhotos = photos.filter((p) => !failedIds.has(p.id))

  // Aviso quando todas as imagens falharam (permite ao pai pular a galeria).
  useEffect(() => {
    if (photos.length > 0 && validPhotos.length === 0) {
      console.warn('[PhotoSlideshow] todas as imagens da galeria falharam')
      onAllFailed?.()
    }
  }, [photos.length, validPhotos.length, onAllFailed])

  const safeIndex = validPhotos.length > 0 ? Math.min(index, validPhotos.length - 1) : 0

  useEffect(() => {
    if (validPhotos.length === 0) return

    const advance = () => {
      setPhase('exit')
      setTimeout(() => {
        setIndex((i) => (i + 1) % validPhotos.length)
        setPhase('enter')
      }, FADE_MS)
    }

    timerRef.current = setTimeout(advance, PHOTO_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [validPhotos.length, safeIndex])

  useEffect(() => {
    if (phase === 'enter') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('zoom'))
      })
    }
  }, [phase, safeIndex])

  const markFailed = useCallback((photoId: string) => {
    console.warn('[PhotoSlideshow] falha ao carregar imagem', photoId)
    setFailedIds((prev) => {
      const next = new Set(prev)
      next.add(photoId)
      return next
    })
    // Avança imediatamente, sem esperar o timer.
    setPhase('exit')
    setTimeout(() => {
      setIndex(0)
      setPhase('enter')
    }, FADE_MS)
  }, [])

  if (photos.length === 0 || validPhotos.length === 0) return null

  const photo = validPhotos[safeIndex]

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      background: '#080a14',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        transform: phase === 'zoom' ? 'scale(1.15)' : 'scale(1)',
        transition: phase === 'zoom'
          ? `transform ${PHOTO_MS - FADE_MS}ms ease-in, opacity ${FADE_MS}ms ease-in`
          : `opacity ${FADE_MS}ms ease-out`,
        opacity: phase === 'exit' ? 0 : 1,
        willChange: 'transform, opacity',
      }}>
        <img
          key={photo.id}
          src={photo.image_url}
          alt=""
          onError={() => markFailed(photo.id)}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>

      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(8,10,20,0.4) 0%, transparent 30%, transparent 70%, rgba(8,10,20,0.6) 100%)',
        transition: `opacity ${FADE_MS}ms`,
        opacity: phase === 'exit' ? 0 : 1,
      }} />

      <div style={{
        position: 'absolute', top: '3rem', left: '3rem', zIndex: 5,
        transition: `opacity ${FADE_MS}ms`,
        opacity: phase === 'exit' ? 0 : 1,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.5rem 1rem 0.5rem 0.8rem',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <Images size={16} color="#818cf8" />
          <span style={{
            fontSize: 'clamp(0.9rem, 1.5vw, 1.3rem)',
            fontWeight: 700, color: '#f1f5f9',
            letterSpacing: '0.01em',
          }}>
            {title}
          </span>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: '6rem', left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: '0.5rem', zIndex: 5,
      }}>
        {validPhotos.map((_, i) => (
          <div key={i} style={{
            width: i === safeIndex ? '24px' : '8px',
            height: '8px', borderRadius: '4px',
            background: i === safeIndex ? '#818cf8' : 'rgba(255,255,255,0.2)',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>
    </div>
  )
}