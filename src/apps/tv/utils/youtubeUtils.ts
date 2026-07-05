export interface YouTubeInfo {
  type: 'video' | 'playlist'
  videoId?: string
  playlistId?: string
}

export function parseYouTubeUrl(url: string): YouTubeInfo | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '')

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const playlistId = u.searchParams.get('list')
      let videoId = u.searchParams.get('v')

      // /shorts/abc123 or /embed/abc123
      if (!videoId) {
        const match = u.pathname.match(/^\/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})/)
        if (match) videoId = match[1]
      }

      if (playlistId && videoId) return { type: 'playlist', videoId, playlistId }
      if (playlistId) return { type: 'playlist', playlistId }
      if (videoId) return { type: 'video', videoId }
    }

    if (host === 'youtu.be') {
      const videoId = u.pathname.slice(1).split('/')[0]
      if (videoId) return { type: 'video', videoId }
    }

    return null
  } catch {
    return null
  }
}
