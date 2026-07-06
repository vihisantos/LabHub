import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { AlertTriangle } from 'lucide-react'
import { parseYouTubeUrl } from '../utils/youtubeUtils'
import { getGoogleDriveEmbedUrl, parseGoogleDriveUrl } from '../utils/googleDriveUtils'
import type { PlaylistSource } from '../types'

interface VideoPlayerProps {
  url: string
  source?: PlaylistSource
  onEnd?: () => void
  isPlaying?: boolean
  className?: string
}

export interface VideoPlayerHandle {
  play: () => void
  pause: () => void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ url, source = 'youtube', onEnd, isPlaying = true, className }, ref) {
    const [error, setError] = useState<string | null>(null)
    const playerRef = useRef<any>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const prevPlayingRef = useRef(isPlaying)

    useImperativeHandle(ref, () => ({
      play: () => {
        if (source === 'youtube') playerRef.current?.playVideo()
        else if (source === 'cloudinary') videoRef.current?.play()
        else if (source === 'google_drive') {}
      },
      pause: () => {
        if (source === 'youtube') playerRef.current?.pauseVideo()
        else if (source === 'cloudinary') videoRef.current?.pause()
        else if (source === 'google_drive') {}
      },
    }))

    useEffect(() => {
      if (source !== 'cloudinary') return
      if (isPlaying === prevPlayingRef.current) return
      prevPlayingRef.current = isPlaying
      if (isPlaying) {
        videoRef.current?.play()
      } else {
        videoRef.current?.pause()
      }
    }, [isPlaying, source])

    /* YouTube */
    if (source === 'youtube') {
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
            : { playlist: info.videoId }),
        },
      }

      return (
        <YouTube
          videoId={info.videoId}
          opts={opts}
          onReady={(e) => { playerRef.current = e.target }}
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

    /* Google Drive */
    if (source === 'google_drive') {
      const fileId = parseGoogleDriveUrl(url)
      if (!fileId) {
        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#64748b', fontSize: '1.25rem',
          }}>
            URL do Google Drive inválida
          </div>
        )
      }

      return (
        <iframe
          ref={iframeRef}
          src={getGoogleDriveEmbedUrl(fileId)}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay"
          allowFullScreen
          title="Google Drive Video"
        />
      )
    }

    /* Cloudinary */
    if (source === 'cloudinary') {
      return (
        <video
          ref={videoRef}
          src={url}
          autoPlay={isPlaying}
          loop
          muted={false}
          controls={false}
          onEnded={onEnd}
          onError={() => setError('Erro ao carregar o vídeo')}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          playsInline
        />
      )
    }

    return null
  }
)
