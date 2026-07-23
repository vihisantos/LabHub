const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

/**
 * Upload a single file to Cloudinary.
 * Falls back to base64 compression if env vars are missing.
 */
export async function uploadToCloudinary(file: File, folder = 'stock'): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary não configurado. Defina VITE_CLOUDINARY_CLOUD_NAME e VITE_CLOUDINARY_UPLOAD_PRESET no .env')
  }

  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', folder)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  })

  const data = await res.json()

  if (data.secure_url) {
    return data.secure_url
  }

  throw new Error(data.error?.message || 'Falha no upload para Cloudinary')
}

/**
 * Upload multiple files to Cloudinary in parallel.
 * Returns an array of secure URLs in the same order as the input files.
 */
export async function uploadMultipleToCloudinary(files: File[], folder = 'stock'): Promise<string[]> {
  const results = await Promise.allSettled(
    Array.from(files).map((file) => uploadToCloudinary(file, folder)),
  )

  const urls: string[] = []
  const errors: string[] = []

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      urls.push(result.value)
    } else {
      errors.push(`${files[i].name}: ${result.reason.message}`)
    }
  })

  if (errors.length > 0) {
    console.warn('[Cloudinary] Uploads com falha:', errors.join('; '))
  }

  if (urls.length === 0 && errors.length > 0) {
    throw new Error(`Nenhuma foto pôde ser enviada: ${errors.join('; ')}`)
  }

  return urls
}
