import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { getGoogleDriveEmbedUrl, parseGoogleDriveUrl } from '../utils/googleDriveUtils'
import type { PlaylistSource } from '../types'

interface VideoPlayerProps {
  url: string
  source?: PlaylistSource
  contentType?: 'video' | 'image'
  /** `failed = true` indica erro de decodificação/leitura (não fim normal). */
  onEnd?: (failed?: boolean) => void
  isPlaying?: boolean
  className?: string
  style?: React.CSSProperties
}

export interface VideoPlayerHandle {
  play: () => void
  pause: () => void
}

/**
 * Palco de mídia sempre do tamanho exato do container.
 *
 * O `position: absolute; inset: 0` desacopla o vídeo da cadeia de percentuais
 * e do alinhamento flex do palco: assim o elemento já nasce com o tamanho
 * final, sem depender de metadados nem do layout do pai para "abrir" na tela.
 */
const FILL_STAGE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  background: '#000',
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ url, source = 'local', contentType, onEnd, isPlaying = true, className, style }, ref) {
    const [error, setError] = useState<string | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const prevPlayingRef = useRef(isPlaying)
    const prevUrlRef = useRef(url)

    useImperativeHandle(ref, () => ({
      play: () => {
        if (source === 'cloudinary' || source === 'local') videoRef.current?.play()
      },
      pause: () => {
        if (source === 'cloudinary' || source === 'local') videoRef.current?.pause()
      },
    }))

    // Detecta troca de URL para reset de estado
    useEffect(() => {
      if (url !== prevUrlRef.current) {
        setIsLoaded(false)
        prevUrlRef.current = url
      }
    }, [url])

    useEffect(() => {
      if (isPlaying === prevPlayingRef.current) return
      prevPlayingRef.current = isPlaying
      if (source === 'cloudinary' || source === 'local') {
        if (isPlaying) {
          videoRef.current?.play()
        } else {
          videoRef.current?.pause()
        }
      }
    }, [isPlaying, source])

    const handleLoadStart = () => {
      setIsLoaded(true)
    }

    // Um arquivo que o player não consegue abrir não pode travar a fila:
    // as fases de vídeo não têm timer próprio, então sem este avanço o ciclo
    // ficaria parado nessa tela de erro para sempre.
    useEffect(function() {
      if (!error) return
      const timer = setTimeout(function() { onEnd?.(true) }, 3000)
      return function() { clearTimeout(timer) }
    }, [error, onEnd])

    if (error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: '#ef4444', fontSize: '1rem',
          ...style
        }} className={className}>
          {error}
        </div>
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
            ...style
          }}>
            URL do Google Drive inválida
          </div>
        )
      }

      return (
        <iframe
          ref={iframeRef}
          src={getGoogleDriveEmbedUrl(fileId)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out',
            objectFit: 'fill'
          } as React.CSSProperties}
          allow="autoplay"
          allowFullScreen
          title="Google Drive Video"
          onLoad={handleLoadStart}
        />
      )
    }

    /* Cloudinary */
    if (source === 'cloudinary') {
      return (
        <video
          key={url}
          ref={videoRef}
          src={url}
          autoPlay={isPlaying}
          muted={true}
          controls={false}
          loop={true}
          preload="auto"
          onEnded={() => onEnd?.()}
          onError={() => setError('Erro ao carregar o vídeo')}
          onLoadStart={handleLoadStart}
          style={Object.assign({}, FILL_STAGE, { objectFit: 'fill' } as React.CSSProperties, style)}
          className={className}
          playsInline
        />
      )
    }

    /* Local files (Tauri desktop) */
    if (source === 'local') {
      // Imagens: usa <img> com timer externo via onEnd (timeout no TvDisplay)
      if (contentType === 'image') {
        return (
          <img
            key={url}
            src={url}
            alt=""
            onError={(e) => {
              console.warn('[VideoPlayer] erro ao carregar imagem local:', e)
              setError('Erro ao carregar a imagem local')
            }}
            style={Object.assign({}, FILL_STAGE, {
              objectFit: 'contain',
              opacity: isLoaded ? 1 : 0,
              transition: 'opacity 0.2s ease-in-out'
            } as React.CSSProperties, style)}
            className={className}
            onLoad={handleLoadStart}
          />
        )
      }

      // Vídeos: usa <video> com autoPlay e onEnded
      return (
        <video
          key={url}
          ref={videoRef}
          src={url}
          autoPlay={isPlaying}
          muted={true}
          controls={false}
          preload="auto"
          onEnded={() => onEnd?.()}
          onError={(e) => {
            console.warn('[VideoPlayer] erro ao carregar arquivo local:', e)
            setError('Erro ao carregar o arquivo local')
          }}
          onLoadStart={handleLoadStart}
          style={Object.assign({}, FILL_STAGE, { objectFit: 'contain' } as React.CSSProperties, style)}
          className={className}
          playsInline
        />
      )
    }

    return null
  }
)
