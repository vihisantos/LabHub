import { useEffect, useState } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { parseYouTubeUrl } from '../utils/youtubeUtils'
import type { TvPlaylist } from '../types'

interface BackgroundAudioProps {
  playlists: TvPlaylist[]
}

export function BackgroundAudio({ playlists }: BackgroundAudioProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [playlists.length])

  if (playlists.length === 0) return null

  const current = playlists[index]
  if (!current) return null

  const info = parseYouTubeUrl(current.youtube_url)
  if (!info) return null

  const opts: YouTubeProps['opts'] = {
    height: '0',
    width: '0',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      rel: 0,
      loop: 0,
      origin: window.location.origin,
      ...(info.type === 'playlist' && info.playlistId
        ? { list: info.playlistId, listType: 'playlist' as const, index: 0 }
        : {}),
    },
  }

  const advance = () => {
    if (playlists.length > 1) {
      setIndex((i) => (i + 1) % playlists.length)
    }
  }

  return (
    <div style={{ display: 'none' }}>
      <YouTube
        videoId={info.videoId}
        opts={opts}
        onEnd={advance}
      />
    </div>
  )
}
