export function parseGoogleDriveUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '')

    if (host === 'drive.google.com') {
      const match = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      if (match) return match[1]
    }

    if (host === 'docs.google.com') {
      const match = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      if (match) return match[1]
    }

    return null
  } catch {
    return null
  }
}

export function getGoogleDriveEmbedUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`
}
