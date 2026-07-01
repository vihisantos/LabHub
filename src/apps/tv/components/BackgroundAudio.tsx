import { useEffect, useState, useRef } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { parseYouTubeUrl } from '../utils/youtubeUtils'
import type { TvPlaylist } from '../types'

interface BackgroundAudioProps {
  playlists: TvPlaylist[]
  volume: number
}

export function BackgroundAudio({ playlists, volume }: BackgroundAudioProps) {
  const [index, setIndex] = useState(0)
  const playerRef = useRef<any>(null)
  const currentVolRef = useRef(100)
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setIndex(0)
  }, [playlists.length])

  useEffect(() => {
    if (!playerRef.current) return
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
    const target = Math.max(0, Math.min(100, volume))
    const step = currentVolRef.current < target ? 5 : -5
    const interval = 60

    fadeTimerRef.current = setInterval(() => {
      const current = currentVolRef.current
      if (Math.abs(current - target) < 5) {
        playerRef.current?.setVolume(target)
        currentVolRef.current = target
        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
        fadeTimerRef.current = null
        return
      }
      const next = current + step
      playerRef.current?.setVolume(next)
      currentVolRef.current = next
    }, interval)

    return () => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
    }
  }, [volume])

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
        onReady={(e) => {
          playerRef.current = e.target
          e.target.setVolume(currentVolRef.current)
          e.target.playVideo()
        }}
        onEnd={advance}
      />
    </div>
  )
}
