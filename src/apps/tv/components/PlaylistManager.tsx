import { useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, Monitor, Music, ChevronUp, ChevronDown } from 'lucide-react'
import type { TvPlaylist } from '../types'
import { parseYouTubeUrl } from './youtubeUtils'

interface PlaylistManagerProps {
  playlists: TvPlaylist[]
  onAdd: (values: Omit<TvPlaylist, 'id' | 'created_at'>) => Promise<void>
  onEdit: (id: string, values: Partial<TvPlaylist>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function PlaylistManager({ playlists, onAdd, onEdit, onDelete }: PlaylistManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TvPlaylist | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'video' | 'music'>('video')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [duration, setDuration] = useState('30')
  const [urlError, setUrlError] = useState('')

  const openNew = () => {
    setEditing(null); setName(''); setType('video'); setYoutubeUrl(''); setDuration('30'); setUrlError('')
    setShowForm(true)
  }

  const openEdit = (p: TvPlaylist) => {
    setEditing(p); setName(p.name); setType(p.type); setYoutubeUrl(p.youtube_url); setDuration(String(p.duration_seconds)); setUrlError('')
    setShowForm(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !youtubeUrl.trim()) return
    if (!parseYouTubeUrl(youtubeUrl.trim())) {
      setUrlError('URL do YouTube inválida')
      return
    }
    setUrlError('')
    const payload = {
      name: name.trim(),
      type,
      youtube_url: youtubeUrl.trim(),
      duration_seconds: Math.max(10, parseInt(duration) || 30),
      is_active: true,
      sort_order: editing?.sort_order ?? playlists.length,
    }
    if (editing) {
      await onEdit(editing.id, payload)
    } else {
      await onAdd(payload)
    }
    setShowForm(false); setEditing(null)
  }

  const moveUp = async (idx: number) => {
    if (idx === 0) return
    const a = playlists[idx]; const b = playlists[idx - 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  const moveDown = async (idx: number) => {
    if (idx === playlists.length - 1) return
    const a = playlists[idx]; const b = playlists[idx + 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Playlists</h3>
        <button onClick={openNew} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem',
          borderRadius: '0.5rem', border: 'none', background: '#10b981', color: '#fff',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={16} /> Nova Playlist
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: '#f8fafc', borderRadius: '0.75rem', padding: '1.25rem',
          marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{editing ? 'Editar' : 'Nova'} Playlist</span>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={18} />
            </button>
          </div>
          <input placeholder="Nome" value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
          <input
            placeholder="URL do YouTube (vídeo ou playlist)"
            value={youtubeUrl}
            onChange={e => { setYoutubeUrl(e.target.value); setUrlError('') }}
            required
            style={{ ...inputStyle, borderColor: urlError ? '#ef4444' : '#e2e8f0' }}
          />
          {urlError && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{urlError}</span>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Tipo</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setType('video')} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '0.5rem', borderRadius: '0.5rem', border: type === 'video' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                  background: type === 'video' ? '#eef2ff' : '#fff', cursor: 'pointer', color: type === 'video' ? '#6366f1' : '#64748b',
                  fontWeight: type === 'video' ? 600 : 400, fontSize: '0.875rem',
                }}>
                  <Monitor size={16} /> Vídeo
                </button>
                <button type="button" onClick={() => setType('music')} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '0.5rem', borderRadius: '0.5rem', border: type === 'music' ? '2px solid #a855f7' : '1px solid #e2e8f0',
                  background: type === 'music' ? '#faf5ff' : '#fff', cursor: 'pointer', color: type === 'music' ? '#a855f7' : '#64748b',
                  fontWeight: type === 'music' ? 600 : 400, fontSize: '0.875rem',
                }}>
                  <Music size={16} /> Música
                </button>
              </div>
            </div>
            <div style={{ width: '120px' }}>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Duração (s)</label>
              <input type="number" min="10" value={duration} onChange={e => setDuration(e.target.value)}
                style={inputStyle} />
            </div>
          </div>
          <button type="submit" style={{
            padding: '0.6rem', borderRadius: '0.5rem', border: 'none',
            background: type === 'music' ? '#a855f7' : '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}>
            {editing ? 'Salvar' : 'Criar'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {playlists.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
            Nenhuma playlist cadastrada
          </p>
        )}
        {playlists.map((p, idx) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1rem', background: '#fff', borderRadius: '0.5rem',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button onClick={() => moveUp(idx)} disabled={idx === 0}
                  style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#e2e8f0' : '#94a3b8', padding: 0, lineHeight: 1 }}>
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => moveDown(idx)} disabled={idx === playlists.length - 1}
                  style={{ background: 'none', border: 'none', cursor: idx === playlists.length - 1 ? 'default' : 'pointer', color: idx === playlists.length - 1 ? '#e2e8f0' : '#94a3b8', padding: 0, lineHeight: 1 }}>
                  <ChevronDown size={14} />
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem', display: 'block' }}>{p.name}</span>
                <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {p.type === 'video' ? <Monitor size={12} /> : <Music size={12} />}
                  {p.type === 'video' ? 'Vídeo' : 'Música'} · {p.duration_seconds}s
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1' }}>
                <Pencil size={16} />
              </button>
              <button onClick={() => onDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0',
  fontSize: '0.875rem', width: '100%', boxSizing: 'border-box', outline: 'none',
}
