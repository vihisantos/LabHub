import { useState, useRef } from 'react'
import { Loader2, Check, Film, Image } from 'lucide-react'

interface CloudinaryUploadProps {
  onUpload: (url: string) => void
  resourceType?: 'image' | 'video'
}

const CLOUD_NAME = 'horytsxg'
const UPLOAD_PRESET = 'tv_events'

export function CloudinaryUpload({ onUpload, resourceType = 'image' }: CloudinaryUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setDone(false)

    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', UPLOAD_PRESET)
    form.append('folder', 'tv')

    try {
      const endpoint = resourceType === 'video' ? 'video' : 'image'
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}/upload`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (data.secure_url) {
        onUpload(data.secure_url)
        setDone(true)
        setError(null)
        setTimeout(() => setDone(false), 2000)
      } else {
        setError(data.error?.message || 'Falha no upload')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const dismissError = () => setError(null)

  const Icon = resourceType === 'video' ? Film : Image

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={resourceType === 'video' ? 'video/*' : 'image/*'}
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {error && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '4px',
            padding: '0.4rem 0.6rem', borderRadius: '0.375rem',
            background: '#fef2f2', border: '1px solid #fecaca',
            color: '#dc2626', fontSize: '0.75rem', fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
            {error}
            <button type="button" onClick={dismissError} style={{
              marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626',
              fontSize: '0.8rem', lineHeight: 1, padding: 0,
            }}>
              ✕
            </button>
          </div>
        )}
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
            whiteSpace: 'nowrap',
          }}
        >
          {uploading ? <Loader2 size={16} className="spin" /> : done ? <Check size={16} /> : <Icon size={16} />}
          {uploading ? 'Enviando...' : done ? 'Enviado' : resourceType === 'video' ? 'Upload Vídeo' : 'Upload'}
        </button>
      </div>
    </>
  )
}
