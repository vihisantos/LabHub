import { ArrowLeft, Monitor } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAllEvents } from '../hooks/useEvents'
import { useAllPlaylists } from '../hooks/usePlaylists'
import { EventManager } from '../components/EventManager'
import { PlaylistManager } from '../components/PlaylistManager'

export function AdminView() {
  const navigate = useNavigate()
  const { events, loading: eventsLoading, add: addEvent, edit: editEvent, remove: deleteEvent } = useAllEvents()
  const { playlists, loading: playlistsLoading, add: addPlaylist, edit: editPlaylist, remove: deletePlaylist } = useAllPlaylists()

  return (
    <div style={{
      minHeight: '100vh', background: '#f1f5f9',
      color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.5rem', background: '#fff',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6366f1', fontSize: '0.9rem', fontWeight: 500,
            }}
          >
            <ArrowLeft size={18} /> Início
          </button>
          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Lab Hub TV</h1>
        </div>
        <a
          href="/tv/display"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '0.5rem 1rem', borderRadius: '0.5rem',
            border: '1px solid #6366f1', color: '#6366f1',
            fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none',
          }}
        >
          <Monitor size={16} /> Abrir Modo TV
        </a>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem',
        display: 'flex', flexDirection: 'column', gap: '3rem',
      }}>
        {eventsLoading || playlistsLoading ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '3rem' }}>
            Carregando...
          </p>
        ) : (
          <>
            <EventManager
              events={events}
              onAdd={addEvent}
              onEdit={editEvent}
              onDelete={deleteEvent}
            />
            <PlaylistManager
              playlists={playlists}
              onAdd={addPlaylist}
              onEdit={editPlaylist}
              onDelete={deletePlaylist}
            />

            <div style={{
              background: '#fff', borderRadius: '0.75rem',
              padding: '1.5rem', border: '1px solid #e2e8f0',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
                Como usar
              </h3>
              <ol style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 2, paddingLeft: '1.25rem' }}>
                <li>Crie eventos com título, descrição e imagem (opcional)</li>
                <li>Adicione playlists do YouTube (vídeos ou músicas)</li>
                <li>Abra <strong>/tv/display</strong> em um PC conectado à TV</li>
                <li>O conteúdo vai rodar em loop automaticamente</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
