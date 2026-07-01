import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { AlertTriangle } from 'lucide-react'
import { parseYouTubeUrl } from '../utils/youtubeUtils'

interface YouTubePlayerProps {
  url: string
  onEnd?: () => void
  isPlaying?: boolean
  className?: string
}

export interface YouTubePlayerHandle {
  play: () => void
  pause: () => void
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ url, onEnd, isPlaying = true, className }, ref) {
    const [error, setError] = useState<string | null>(null)
    const playerRef = useRef<any>(null)
    const isPlayingRef = useRef(isPlaying)

    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
    }))

    useEffect(() => {
      if (!playerRef.current) return
      if (isPlaying === isPlayingRef.current) return
      isPlayingRef.current = isPlaying
      if (isPlaying) {
        playerRef.current.playVideo()
      } else {
        playerRef.current.pauseVideo()
      }
    }, [isPlaying])

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
        autoplay: isPlaying ? 1 : 0,
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
        onReady={(e) => {
          playerRef.current = e.target
        }}
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
)
