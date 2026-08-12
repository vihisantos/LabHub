import { Music, SkipBack, Play, Pause, SkipForward, PlayCircle } from 'lucide-react'
import { useMusicPlayer } from '../contexts/MusicPlayerContext'

const THUMB_BASE = 'https://img.youtube.com/vi/'
const THUMB_SIZE = 'mqdefault.jpg'

const btn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'rgba(255,255,255,0.6)', padding: '0.3rem',
  display: 'flex', borderRadius: '50%', transition: 'color 0.2s', flexShrink: 0,
}

export function MusicQueuePlayer() {
  const { currentTrack, isPlaying, shuffle, currentTrackIndex, tracks, togglePlay, next, prev, upNext, clearUpNext } = useMusicPlayer()

  if (tracks.length === 0 || !currentTrack) return null

  return (
    <>
      {/* Now playing overlay */}
      <div style={{
        position: 'fixed', bottom: '2rem', right: '3rem', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px',
      }}>
        {upNext && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 12px 6px 10px',
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(16px)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <PlayCircle size={14} color="#fbbf24" />
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
              Próxima: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{upNext.title}</span>
            </div>
            <button
              onClick={clearUpNext}
              style={{ ...btn, padding: '0.1rem', color: 'rgba(255,255,255,0.4)' }}
              title="Cancelar"
            >
              ✕
            </button>
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 14px 8px 8px',
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(16px)',
          borderRadius: '9999px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
        <img
          key={currentTrack.youtube_video_id}
          src={`${THUMB_BASE}${currentTrack.youtube_video_id}/${THUMB_SIZE}`}
          alt={currentTrack.title}
          style={{
            width: '44px', height: '44px', borderRadius: '10px',
            objectFit: 'cover', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
          onError={(e) => {
            const t = e.currentTarget
            t.style.display = 'none'
            const fb = t.nextElementSibling as HTMLElement | null
            if (fb) fb.style.display = 'flex'
          }}
        />
        <div style={{
          display: 'none', width: '36px', height: '36px', borderRadius: '9999px',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Music size={14} color="#fff" />
        </div>
        <div style={{ maxWidth: '160px', overflow: 'hidden' }}>
          <div style={{
            fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {currentTrack.title}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            {shuffle ? 'Aleatório' : 'Sequencial'} · {currentTrackIndex + 1}/{tracks.length}
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        <button style={btn} onClick={prev} title="Anterior"><SkipBack size={14} /></button>
        <button style={{ ...btn, background: 'rgba(255,255,255,0.1)' }} onClick={togglePlay} title={isPlaying ? 'Pausar' : 'Tocar'}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button style={btn} onClick={next} title="Próximo"><SkipForward size={14} /></button>
      </div>
      </div>
    </>
  )
}
