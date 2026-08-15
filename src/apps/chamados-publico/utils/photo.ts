const MAX_SIZE = 900
const QUALITY = 0.65
const MAX_DATA_URL_LENGTH = 600000

export function isPhotoDataUrl(value: string): boolean {
  return value.startsWith('data:image/')
}

export async function readPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem'))
    reader.readAsDataURL(file)
  })

  const compressed = await new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width
      let h = img.height
      if (w > MAX_SIZE || h > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Imagem não suportada'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = () => reject(new Error('Imagem inválida'))
    img.src = dataUrl
  })

  if (compressed.length > MAX_DATA_URL_LENGTH) {
    throw new Error('A foto ficou muito grande. Tente uma imagem menor.')
  }
  return compressed
}
