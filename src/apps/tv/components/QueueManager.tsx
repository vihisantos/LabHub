import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Shuffle, ArrowUp, ArrowDown, Music, Loader2, ExternalLink } from 'lucide-react'
import { useMusicQueues, type QueueWithTracks } from '../hooks/useMusicQueues'

export function QueueManager() {
  const { queues, loading, add, edit, remove, addTracksFromUrl, removeTrack, reorder } = useMusicQueues()
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [fetching, setFetching] = useState(false)

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await add(name)
    setNewName('')
  }

  const handleAddTracks = async (queueId: string) => {
    const url = urlInput.trim()
    if (!url) return
    setFetching(true)
    await addTracksFromUrl(queueId, url)
    setFetching(false)
    setUrlInput('')
  }

  const handleMoveUp = (qId: string, idx: number) => {
    if (idx === 0) return
    const q = queues.find(q => q.id === qId)
    if (!q) return
    const ids = q.tracks.map(t => t.id)
    ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
    reorder(qId, ids)
  }

  const handleMoveDown = (qId: string, idx: number) => {
    const q = queues.find(q => q.id === qId)
    if (!q || idx >= q.tracks.length - 1) return
    const ids = q.tracks.map(t => t.id)
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    reorder(qId, ids)
  }

  const toggleShuffle = async (q: QueueWithTracks) => {
    await edit(q.id, { shuffle: !q.shuffle } as any)
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
        Carregando filas...
      </div>
    )
  }

  return (
    <div style={{
      background: '#fff', borderRadius: '0.75rem',
      padding: '1.5rem', border: '1px solid #e2e8f0',
    }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
        Filas de Música
      </h3>

      {/* Create queue */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Nome da nova fila..."
          style={{
            flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
            border: '1px solid #e2e8f0', fontSize: '0.875rem', outline: 'none',
          }}
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0.5rem 1rem', borderRadius: '0.5rem',
            border: 'none', background: '#6366f1', color: '#fff',
            fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
            opacity: newName.trim() ? 1 : 0.5,
          }}
        >
          <Plus size={16} /> Criar
        </button>
      </div>

      {/* Queue list */}
      {queues.length === 0 && (
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
          Nenhuma fila criada
        </p>
      )}

      {queues.map((q) => (
        <div key={q.id} style={{
          border: '1px solid #e2e8f0', borderRadius: '0.5rem',
          marginBottom: '0.5rem', overflow: 'hidden',
        }}>
          {/* Queue header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 0.75rem', background: '#f8fafc',
            cursor: 'pointer',
          }}
            onClick={() => setExpanded(expanded === q.id ? null : q.id)}
          >
            {expanded === q.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Music size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>{q.name}</span>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
              {q.tracks.length} track{q.tracks.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); toggleShuffle(q) }}
              title={q.shuffle ? 'Modo aleatório' : 'Modo sequencial'}
              style={{
                background: q.shuffle ? 'rgba(99,102,241,0.1)' : 'none',
                border: 'none', cursor: 'pointer', padding: '0.3rem',
                borderRadius: '0.375rem', color: q.shuffle ? '#6366f1' : '#94a3b8',
              }}
            >
              <Shuffle size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); remove(q.id) }}
              title="Excluir fila"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.3rem', borderRadius: '0.375rem', color: '#ef4444',
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Expanded content */}
          {expanded === q.id && (
            <div style={{ padding: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
              {/* Add tracks from URL */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !fetching && handleAddTracks(q.id)}
                  placeholder="URL do YouTube (vídeo ou playlist)..."
                  style={{
                    flex: 1, padding: '0.4rem 0.6rem', borderRadius: '0.375rem',
                    border: '1px solid #e2e8f0', fontSize: '0.8rem', outline: 'none',
                  }}
                />
                <button
                  onClick={() => handleAddTracks(q.id)}
                  disabled={fetching || !urlInput.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '0.4rem 0.75rem', borderRadius: '0.375rem',
                    border: 'none', background: '#6366f1', color: '#fff',
                    fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                    opacity: (fetching || !urlInput.trim()) ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fetching ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                  {fetching ? 'Buscando...' : 'Adicionar'}
                </button>
              </div>

              {/* Track list */}
              {q.tracks.length === 0 && (
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
                  Nenhum track. Adicione uma URL do YouTube.
                </p>
              )}

              {q.tracks.map((track, idx) => (
                <div key={track.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.35rem 0.5rem', borderRadius: '0.375rem',
                  background: idx % 2 === 0 ? '#fafafa' : 'transparent',
                  fontSize: '0.85rem',
                }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', width: '1.5rem', textAlign: 'right' }}>
                    {idx + 1}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {track.title}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                    {track.duration_seconds > 0
                      ? `${Math.floor(track.duration_seconds / 60)}:${String(track.duration_seconds % 60).padStart(2, '0')}`
                      : ''}
                  </span>
                  <a
                    href={`https://youtube.com/watch?v=${track.youtube_video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#94a3b8', display: 'flex', padding: '0.2rem' }}
                    title="Abrir no YouTube"
                  >
                    <ExternalLink size={12} />
                  </a>
                  <button
                    onClick={() => handleMoveUp(q.id, idx)}
                    disabled={idx === 0}
                    style={{
                      background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                      padding: '0.2rem', color: idx === 0 ? '#e2e8f0' : '#94a3b8', display: 'flex',
                    }}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => handleMoveDown(q.id, idx)}
                    disabled={idx >= q.tracks.length - 1}
                    style={{
                      background: 'none', border: 'none', cursor: idx >= q.tracks.length - 1 ? 'default' : 'pointer',
                      padding: '0.2rem', color: idx >= q.tracks.length - 1 ? '#e2e8f0' : '#94a3b8', display: 'flex',
                    }}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    onClick={() => removeTrack(track.id)}
                    title="Remover"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0.2rem', color: '#ef4444', display: 'flex',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
