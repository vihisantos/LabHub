import { useState, useRef } from 'react'
import { Upload, Loader2, Check } from 'lucide-react'

interface CloudinaryUploadProps {
  onUpload: (url: string) => void
}

const CLOUD_NAME = 'horytsxg'
const UPLOAD_PRESET = 'tv_events'
const API_KEY = 'EtKxIwZz6wyLZ9z6Wa-Z58ei6XU'

export function CloudinaryUpload({ onUpload }: CloudinaryUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setDone(false)

    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', UPLOAD_PRESET)
    form.append('api_key', API_KEY)
    form.append('folder', 'tv')

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (data.secure_url) {
        onUpload(data.secure_url)
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      }
    } catch {
      /* silently ignore */
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
          border: '1px solid #e2e8f0',
          background: uploading ? '#f1f5f9' : '#fff',
          color: uploading ? '#94a3b8' : '#6366f1',
          fontSize: '0.875rem', fontWeight: 500,
          cursor: uploading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {uploading ? <Loader2 size={16} className="spin" /> : done ? <Check size={16} /> : <Upload size={16} />}
        {uploading ? 'Enviando...' : done ? 'Enviado' : 'Upload'}
      </button>
    </>
  )
}
