import { useState } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { AlertTriangle } from 'lucide-react'
import { parseYouTubeUrl } from '../utils/youtubeUtils'

interface YouTubePlayerProps {
  url: string
  onEnd?: () => void
  className?: string
}

export function YouTubePlayer({ url, onEnd, className }: YouTubePlayerProps) {
  const [error, setError] = useState<string | null>(null)
  const info = parseYouTubeUrl(url)

  if (!info) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#64748b', fontSize: '1.25rem',
      }}>
        URL inválida
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#ef4444', gap: '0.75rem', padding: '2rem', textAlign: 'center',
      }}>
        <AlertTriangle size={40} />
        <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Vídeo bloqueado</p>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '400px' }}>{error}</p>
      </div>
    )
  }

  const opts: YouTubeProps['opts'] = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      loop: 1,
      origin: window.location.origin,
      ...(info.type === 'playlist' && info.playlistId
        ? { list: info.playlistId, listType: 'playlist' as const, index: 0 }
        : {}),
    },
  }

  return (
    <YouTube
      videoId={info.videoId}
      opts={opts}
      onEnd={onEnd}
      onError={(e) => {
        const msgs: Record<number, string> = {
          2: 'ID do vídeo inválido',
          5: 'O player não consegue reproduzir este formato',
          100: 'Este vídeo não está disponível',
          101: 'Embedding desabilitado pelo proprietário',
          150: 'Embedding desabilitado pelo proprietário',
        }
        setError(msgs[e.data] || 'Erro ao carregar o vídeo')
      }}
      style={{ height: '100%' }}
      className={className}
      iframeClassName={className}
    />
  )
}
