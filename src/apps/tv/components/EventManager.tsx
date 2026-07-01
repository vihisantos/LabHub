import { useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, ChevronUp, ChevronDown } from 'lucide-react'
import type { TvEvent } from '../types'
import { CloudinaryUpload } from './CloudinaryUpload'

interface EventManagerProps {
  events: TvEvent[]
  onAdd: (values: Omit<TvEvent, 'id' | 'created_at'>) => Promise<void>
  onEdit: (id: string, values: Partial<TvEvent>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function EventManager({ events, onAdd, onEdit, onDelete }: EventManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TvEvent | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const openNew = () => {
    setEditing(null)
    setTitle(''); setDescription(''); setImageUrl(''); setStartDate(''); setEndDate('')
    setShowForm(true)
  }

  const openEdit = (e: TvEvent) => {
    setEditing(e)
    setTitle(e.title)
    setDescription(e.description || '')
    setImageUrl(e.image_url || '')
    setStartDate(e.start_date ? e.start_date.slice(0, 16) : '')
    setEndDate(e.end_date ? e.end_date.slice(0, 16) : '')
    setShowForm(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(endDate).toISOString() : null,
      is_active: true,
      sort_order: editing?.sort_order ?? events.length,
    }
    if (editing) {
      await onEdit(editing.id, payload)
    } else {
      await onAdd(payload)
    }
    setShowForm(false)
    setEditing(null)
  }

  const moveUp = async (idx: number) => {
    if (idx === 0) return
    const a = events[idx]; const b = events[idx - 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  const moveDown = async (idx: number) => {
    if (idx === events.length - 1) return
    const a = events[idx]; const b = events[idx + 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Eventos</h3>
        <button onClick={openNew} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem',
          borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={16} /> Novo Evento
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: '#f8fafc', borderRadius: '0.75rem', padding: '1.25rem',
          marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{editing ? 'Editar' : 'Novo'} Evento</span>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={18} />
            </button>
          </div>
          <input placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} required
            style={inputStyle} />
          <textarea placeholder="Descrição (opcional)" value={description} onChange={e => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input placeholder="URL da imagem (opcional)" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              style={{ ...inputStyle, flex: 1 }} />
            <CloudinaryUpload onUpload={(url) => setImageUrl(url)} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input type="datetime-local" placeholder="Início" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={inputStyle} />
            <input type="datetime-local" placeholder="Fim" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={inputStyle} />
          </div>
          <button type="submit" style={{
            padding: '0.6rem', borderRadius: '0.5rem', border: 'none',
            background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}>
            {editing ? 'Salvar' : 'Criar'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {events.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
            Nenhum evento cadastrado
          </p>
        )}
        {events.map((e, idx) => (
          <div key={e.id} style={{
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
                <button onClick={() => moveDown(idx)} disabled={idx === events.length - 1}
                  style={{ background: 'none', border: 'none', cursor: idx === events.length - 1 ? 'default' : 'pointer', color: idx === events.length - 1 ? '#e2e8f0' : '#94a3b8', padding: 0, lineHeight: 1 }}>
                  <ChevronDown size={14} />
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem', display: 'block' }}>{e.title}</span>
                {e.description && (
                  <span style={{ color: '#64748b', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{e.description}</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button onClick={() => openEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1' }}>
                <Pencil size={16} />
              </button>
              <button onClick={() => onDelete(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
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
