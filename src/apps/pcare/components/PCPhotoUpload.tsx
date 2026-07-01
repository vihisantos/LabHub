import { useState, useRef } from 'react'
import { Camera, Loader2, X } from 'lucide-react'

interface PCPhotoUploadProps {
  photos: string[]
  onChange: (photos: string[]) => void
}

const CLOUD_NAME = 'horytsxg'
const UPLOAD_PRESET = 'tv_events'
const API_KEY = 'EtKxIwZz6wyLZ9z6Wa-Z58ei6XU'

export function PCPhotoUpload({ photos, onChange }: PCPhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)

    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', UPLOAD_PRESET)
    form.append('api_key', API_KEY)
    form.append('folder', 'pcs')

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (data.secure_url) {
        onChange([...photos, data.secure_url])
      }
    } catch {
      /* silently ignore */
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {photos.map((url, i) => (
            <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-xl bg-input">
              <img
                src={url}
                alt={`Foto ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remover foto"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-input/50 text-fg-muted transition-colors hover:bg-input disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>
            <Camera size={18} />
            <span className="text-[10px] font-medium">Adicionar</span>
          </>
        )}
      </button>
    </div>
  )
}
