import YouTube, { type YouTubeProps } from 'react-youtube'
import { parseYouTubeUrl } from '../utils/youtubeUtils'

interface YouTubePlayerProps {
  url: string
  onEnd?: () => void
  className?: string
}

export function YouTubePlayer({ url, onEnd, className }: YouTubePlayerProps) {
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
      style={{ height: '100%' }}
      className={className}
      iframeClassName={className}
    />
  )
}
