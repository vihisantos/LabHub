import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Monitor, Tv, ListMusic, Calendar, HelpCircle, Disc3, Megaphone, Images } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAllEvents } from '../hooks/useEvents'
import { useAllPlaylists } from '../hooks/usePlaylists'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { useAnnouncements } from '../hooks/useAnnouncements'
import { useGalleries } from '../hooks/useGallery'
import { EventManager } from '../components/EventManager'
import { PlaylistManager } from '../components/PlaylistManager'
import { QueueManager } from '../components/QueueManager'
import { AnnouncementManager } from '../components/AnnouncementManager'
import { GalleryManager } from '../components/GalleryManager'
import { TooltipRoot, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../lib/components/ui'

type TabId = 'events' | 'playlists' | 'music' | 'gallery' | 'announcements' | 'help'

const tabs: { id: TabId; label: string; icon: typeof Calendar }[] = [
  { id: 'events', label: 'Eventos', icon: Calendar },
  { id: 'playlists', label: 'Playlists', icon: Monitor },
  { id: 'music', label: 'Filas de Música', icon: ListMusic },
  { id: 'gallery', label: 'Galeria', icon: Images },
  { id: 'announcements', label: 'Avisos', icon: Megaphone },
  { id: 'help', label: 'Ajuda', icon: HelpCircle },
]

export function AdminView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { events, loading: eventsLoading, add: addEvent, edit: editEvent, remove: deleteEvent } = useAllEvents()
  const { playlists, loading: playlistsLoading, add: addPlaylist, edit: editPlaylist, remove: deletePlaylist } = useAllPlaylists()
  const { nowPlaying } = useNowPlaying()
  const { announcements, add: addAnnouncement, edit: editAnnouncement, remove: removeAnnouncement, moveUp, moveDown } = useAnnouncements()
  const { galleries, loading: galleriesLoading, create: createGallery, remove: removeGallery, toggleActive: toggleGalleryActive } = useGalleries()
  // Read initial state from query params (e.g. from ReservaLab redirect)
  const tabParam = searchParams.get('tab') as TabId | null
  const [activeTab, setActiveTabState] = useState<TabId>(tabParam ?? (() => {
    const saved = localStorage.getItem('tv-admin-tab')
    return (saved && tabs.some(t => t.id === saved) ? saved : 'events') as TabId
  })())

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab)
    localStorage.setItem('tv-admin-tab', tab)
  }, [])

  const initialEventValues = searchParams.get('title')
    ? {
        title: searchParams.get('title') ?? undefined,
        description: searchParams.get('description') ?? undefined,
        start_date: searchParams.get('start_date') ?? undefined,
        end_date: searchParams.get('end_date') ?? undefined,
      }
    : undefined

  // Consume params once so they don't re-trigger
  useEffect(() => {
    if (searchParams.get('title')) {
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const announcementStats = announcements.filter(a => a.is_active).length

  const activeGalleryCount = galleries.filter(g => g.is_active).length
  const stats = useMemo(() => [
    { label: 'Eventos', value: events.length, icon: Calendar, color: 'from-violet-500 to-purple-600', badge: 'info' as const },
    { label: 'Playlists', value: playlists.length, icon: Monitor, color: 'from-emerald-500 to-green-600', badge: 'default' as const },
    { label: 'Galerias', value: `${activeGalleryCount}/${galleries.length}`, icon: Images, color: 'from-pink-500 to-rose-600', badge: 'default' as const },
    { label: 'Avisos', value: announcementStats, icon: Megaphone, color: 'from-amber-500 to-orange-600', badge: 'default' as const },
  ], [events.length, playlists.length, activeGalleryCount, galleries.length, announcementStats])

  const isLoading = eventsLoading || playlistsLoading || galleriesLoading

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        {/* ── Header ── */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/20">
                  <Tv size={14} className="text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold leading-tight text-slate-800">Lab Hub TV</h1>
                  <p className="text-[10px] leading-tight text-slate-400">Painel Administrativo</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Now Playing indicator */}
              {nowPlaying && nowPlaying.isPlaying ? (
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5">
                      <Disc3 size={14} className="animate-spin text-blue-600" style={{ animationDuration: '3s' }} />
                      <div className="max-w-[120px] overflow-hidden">
                        <p className="truncate text-xs font-medium text-blue-700">{nowPlaying.trackTitle}</p>
                        <p className="truncate text-[10px] text-blue-500">{nowPlaying.trackPosition} · {nowPlaying.shuffle ? 'Aleatório' : 'Sequencial'}</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Tocando agora no display: <strong>{nowPlaying.trackTitle}</strong>
                  </TooltipContent>
                </TooltipRoot>
              ) : (
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <div className="size-2 rounded-full bg-slate-300" />
                  <span className="text-[11px] text-slate-400">Sem música</span>
                </div>
              )}
              <button
                onClick={() => navigate('/tv/display')}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-200 hover:text-slate-900 active:scale-[0.97]"
              >
                <Monitor size={14} />
                Modo TV
              </button>
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
          {/* Stats */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition-all hover:bg-slate-50"
              >
                <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${stat.color} opacity-60`} />
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{stat.label}</span>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${stat.color} shadow-lg`}>
                    <stat.icon size={13} className="text-white" />
                  </div>
                </div>
                <span className="text-2xl font-bold tracking-tight text-slate-800">{stat.value}</span>
              </motion.div>
            ))}
          </div>

          {/* ── Tabs ── */}
          <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`relative flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium whitespace-nowrap transition-all sm:text-sm ${
                    activeTab === id
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab Content ── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'help' ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                  <h3 className="mb-4 text-base font-semibold text-slate-800">Como usar o Lab Hub TV</h3>
                  <ol className="space-y-3 text-sm text-slate-500">
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-600">1</span>
                      <span><strong className="text-slate-700">Crie eventos</strong> com título, descrição e imagem (opcional) para exibir no display da TV</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-600">2</span>
                      <span><strong className="text-slate-700">Adicione playlists de vídeo</strong> do YouTube para reprodução automática no display</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600">3</span>
                      <span><strong className="text-slate-700">Crie filas de música</strong> com links do YouTube — as músicas tocam em sequência durante os intervalos</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-600">4</span>
                      <span>Abra <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-violet-600">/tv/display</code> em um PC conectado à TV ou projetor</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-600">5</span>
                      <span>O conteúdo vai rodar em loop automaticamente — vídeos, eventos e música se alternam</span>
                    </li>
                  </ol>
                </div>
              ) : isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200" />
                  ))}
                </div>
              ) : (
                <>
                  {activeTab === 'events' && (
                    <EventManager
                      events={events}
                      onAdd={addEvent}
                      onEdit={editEvent}
                      onDelete={deleteEvent}
                      initialValues={initialEventValues}
                    />
                  )}
                  {activeTab === 'playlists' && (
                    <PlaylistManager
                      playlists={playlists}
                      onAdd={addPlaylist}
                      onEdit={editPlaylist}
                      onDelete={deletePlaylist}
                    />
                  )}
                  {activeTab === 'music' && (
                    <QueueManager />
                  )}
                  {activeTab === 'gallery' && (
                    <GalleryManager
                      galleries={galleries}
                      onCreate={createGallery}
                      onDelete={removeGallery}
                      onToggleActive={toggleGalleryActive}
                    />
                  )}
                  {activeTab === 'announcements' && (
                    <AnnouncementManager
                      announcements={announcements}
                      onAdd={addAnnouncement}
                      onEdit={editAnnouncement}
                      onRemove={removeAnnouncement}
                      onMoveUp={moveUp}
                      onMoveDown={moveDown}
                    />
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </TooltipProvider>
  )
}
