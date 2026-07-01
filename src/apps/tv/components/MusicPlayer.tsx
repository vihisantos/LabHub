import YouTube, { type YouTubeProps } from 'react-youtube'
import { parseYouTubeUrl } from './youtubeUtils'
import { Music } from 'lucide-react'

interface MusicPlayerProps {
  url: string
  onEnd?: () => void
}

export function MusicPlayer({ url, onEnd }: MusicPlayerProps) {
  const info = parseYouTubeUrl(url)

  if (!info) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#64748b', fontSize: '1.25rem', gap: '1rem',
      }}>
        <Music size={64} strokeWidth={1} />
        <span>URL inválida</span>
      </div>
    )
  }

  const opts: YouTubeProps['opts'] = {
    height: '0',
    width: '0',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      rel: 0,
      loop: 1,
      ...(info.type === 'playlist' && info.playlistId
        ? { list: info.playlistId, listType: 'playlist' as const, index: 0 }
        : {}),
    },
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: '2rem',
    }}>
      <div style={{
        width: '200px', height: '200px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'spin 8s linear infinite',
        boxShadow: '0 0 60px rgba(99, 102, 241, 0.3)',
      }}>
        <Music size={80} color="#fff" strokeWidth={1.5} />
      </div>
      <p style={{ color: '#cbd5e1', fontSize: '1.25rem', fontWeight: 500 }}>
        Tocando música...
      </p>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '32px' }}>
        {[16, 24, 12, 28, 20, 8, 32, 14, 22, 18].map((h, i) => (
          <div
            key={i}
            style={{
              width: '4px', height: `${h}px`, borderRadius: '2px',
              background: '#6366f1',
              animation: 'equalizer 0.6s ease-in-out infinite alternate',
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>
      <YouTube
        videoId={info.videoId}
        opts={opts}
        onEnd={onEnd}
        style={{ display: 'none' }}
      />
    </div>
  )
}
