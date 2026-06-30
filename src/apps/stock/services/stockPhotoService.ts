const PHOTOS_KEY = 'labhub_stock_photos'

function getAll(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PHOTOS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, string[]>) {
  localStorage.setItem(PHOTOS_KEY, JSON.stringify(data))
}

/** Compress an image file to a smaller base64 JPEG (max 800px, 70% quality) */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 800
        let w = img.width
        let h = img.height
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export const stockPhotoService = {
  /** Get all photos for an item */
  get(itemId: string): string[] {
    return getAll()[itemId] || []
  },

  /** Check if an item has any photos */
  has(itemId: string): boolean {
    const photos = getAll()[itemId]
    return !!photos && photos.length > 0
  },

  /** Get count of photos for an item */
  count(itemId: string): number {
    return getAll()[itemId]?.length || 0
  },

  /** Add a single photo (compressed base64) */
  add(itemId: string, base64: string): void {
    const all = getAll()
    if (!all[itemId]) all[itemId] = []
    all[itemId].push(base64)
    saveAll(all)
  },

  /** Replace all photos for an item */
  setAll(itemId: string, photos: string[]): void {
    const all = getAll()
    if (photos.length > 0) {
      all[itemId] = photos
    } else {
      delete all[itemId]
    }
    saveAll(all)
  },

  /** Remove a photo by index */
  removeAt(itemId: string, index: number): void {
    const all = getAll()
    if (all[itemId]) {
      all[itemId].splice(index, 1)
      if (all[itemId].length === 0) delete all[itemId]
      saveAll(all)
    }
  },

  /** Delete all photos for an item */
  deleteAll(itemId: string): void {
    const all = getAll()
    delete all[itemId]
    saveAll(all)
  },

  /** Count how many item IDs in the photo store are orphans (item no longer exists) */
  countOrphans(validIds: Set<string>): number {
    const all = getAll()
    return Object.keys(all).filter((id) => !validIds.has(id)).length
  },

  /**
   * Remove all photo entries whose item IDs no longer exist in the given valid set.
   * Returns the number of orphan entries that were removed.
   */
  cleanupOrphans(validIds: Set<string>): number {
    const all = getAll()
    const orphanIds = Object.keys(all).filter((id) => !validIds.has(id))
    if (orphanIds.length === 0) return 0
    for (const id of orphanIds) {
      delete all[id]
    }
    saveAll(all)
    return orphanIds.length
  },
}
