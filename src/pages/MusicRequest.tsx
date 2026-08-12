import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, ArrowLeft, Send, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, Film, Search, Link2, X, Check } from 'lucide-react'
import { useAuth } from '../core/auth/AuthContext'
import { useMusicRequests } from '../apps/tv/hooks/useMusicRequests'
import { searchYouTube } from '../apps/tv/utils/youtubeApi'
import type { YouTubeSearchResult } from '../apps/tv/types'
import { ToastProvider, useToast } from '../lib/ToastContext'

const STATUS_CONFIG = {
  pending: { label: 'Aguardando verificação', icon: Clock, cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  approved: { label: 'Aprovada', icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'Recusada', icon: XCircle, cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
} as const

export function MusicRequestPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { requests, loading, request } = useMusicRequests()
  const { addToast } = useToast()

  const [mode, setMode] = useState<'search' | 'link'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YouTubeSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<YouTubeSearchResult | null>(null)
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const myRequests = requests.filter((r) => r.requested_by === user?.id)

  /* Busca com debounce de 500ms — só dispara com 2+ caracteres */
  useEffect(() => {
    if (mode !== 'search') return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSelected(null)
      return
    }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const r = await searchYouTube(q)
        if (!cancelled) setResults(r)
      } catch {
        if (!cancelled) {
          setResults([])
          addToast('error', 'Erro ao buscar no YouTube')
        }
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, mode, addToast])

  const handleSelect = (r: YouTubeSearchResult) => {
    setSelected(r)
  }

  const handleSubmitSelected = async () => {
    if (!selected || !user) return
    setSubmitting(true)
    await request({
      url: `https://www.youtube.com/watch?v=${selected.videoId}`,
      requestedBy: user.id,
      requestedByName: user.name,
      track: selected,
    })
    setSubmitting(false)
    setSelected(null)
    setQuery('')
    setResults([])
  }

  const handleSubmitUrl = async () => {
    const value = url.trim()
    if (!value || !user) return
    setSubmitting(true)
    await request({ url: value, requestedBy: user.id, requestedByName: user.name })
    setSubmitting(false)
    setUrl('')
  }

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-xl px-5 pb-16 pt-8">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/launcher')}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
              <Music size={18} />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight">Pedir Música</h1>
              <p className="text-xs text-fg-muted">Sugira uma música para a TV</p>
            </div>
          </div>
        </header>

        {/* Formulário de pedido */}
        <div className="mb-6 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          {/* Alternância: buscar por nome / colar link */}
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-input p-1">
            <button
              type="button"
              onClick={() => { setMode('search'); setSelected(null); setResults([]) }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                mode === 'search' ? 'bg-card text-fg shadow-sm' : 'text-fg-dim hover:text-fg'
              }`}
            >
              <Search size={14} />
              Buscar por nome
            </button>
            <button
              type="button"
              onClick={() => { setMode('link'); setSelected(null) }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                mode === 'link' ? 'bg-card text-fg shadow-sm' : 'text-fg-dim hover:text-fg'
              }`}
            >
              <Link2 size={14} />
              Colar link
            </button>
          </div>

          {mode === 'search' ? (
            <>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Digite o nome da música ou artista..."
                  autoFocus
                  className="w-full rounded-xl border border-line bg-input py-2.5 pl-10 pr-3 text-sm text-fg placeholder-fg-dim outline-none transition-colors focus:border-red-400"
                />
              </div>

              {/* Resultados da busca */}
              {searching && (
                <div className="flex items-center gap-2 py-4 text-xs text-fg-dim">
                  <Loader2 size={14} className="animate-spin" />
                  Buscando no YouTube...
                </div>
              )}

              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Music size={22} className="text-fg-dim" />
                  <p className="text-xs text-fg-muted">Nenhum resultado — tente outro nome</p>
                </div>
              )}

              {!searching && results.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {results.map((r) => {
                    const isSelected = selected?.videoId === r.videoId
                    return (
                      <button
                        key={r.videoId}
                        type="button"
                        onClick={() => handleSelect(r)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                          isSelected
                            ? 'border-red-400 bg-red-500/5'
                            : 'border-line bg-input hover:border-red-300'
                        }`}
                      >
                        {r.thumbnail ? (
                          <img
                            src={r.thumbnail}
                            alt=""
                            className="h-12 w-20 shrink-0 rounded-lg object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-card text-fg-dim">
                            <Music size={16} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{r.title}</p>
                          <p className="truncate text-[11px] text-fg-muted">{r.channel}</p>
                        </div>
                        {isSelected ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                            <Check size={13} />
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-lg bg-card px-2 py-1 text-[10px] font-semibold text-fg-dim">
                            Selecionar
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Música selecionada → opções */}
              {selected && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-300 bg-red-500/5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-fg">{selected.title}</p>
                    <p className="truncate text-[10px] text-fg-muted">Selecionada para o pedido</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmitSelected}
                    disabled={submitting}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-red-500/20 transition-all hover:from-red-500 hover:to-rose-500 active:scale-[0.97] disabled:opacity-40"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {submitting ? 'Enviando...' : 'Enviar pedido'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    disabled={submitting}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg disabled:opacity-40"
                    title="Cancelar seleção"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <p className="mt-3 text-[11px] text-fg-muted">
                Clique em uma música para vê-la selecionada e depois envie o pedido.
              </p>
            </>
          ) : (
            <>
              <label className="mb-2 block text-sm font-semibold">URL do YouTube</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Film size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim" />
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !submitting && handleSubmitUrl()}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full rounded-xl border border-line bg-input py-2.5 pl-10 pr-3 text-sm text-fg placeholder-fg-dim outline-none transition-colors focus:border-red-400"
                  />
                </div>
                <button
                  onClick={handleSubmitUrl}
                  disabled={!url.trim() || submitting}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-500/20 transition-all hover:from-red-500 hover:to-rose-500 active:scale-[0.97] disabled:opacity-40"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {submitting ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </>
          )}
          <p className="mt-2 text-[11px] text-fg-muted">
            Sua sugestão passa por verificação antes de entrar na playlist da TV.
          </p>
        </div>

        {/* Meus pedidos */}
        <div className="mb-3 flex items-center gap-2 px-1">
          <h2 className="text-sm font-semibold">Meus pedidos</h2>
          {myRequests.length > 0 && (
            <span className="rounded-full bg-input px-2 py-0.5 text-[11px] text-fg-muted">{myRequests.length}</span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-card py-12 text-fg-dim">
            <Loader2 size={22} className="animate-spin" />
            <p className="text-xs">Carregando pedidos...</p>
          </div>
        ) : myRequests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line/40 bg-card py-12 text-center">
            <Music size={28} className="text-fg-dim" />
            <p className="text-sm text-fg-muted">Nenhum pedido ainda</p>
            <p className="text-xs text-fg-dim">Busque uma música ou envie uma URL do YouTube acima</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myRequests.map((r) => {
              const cfg = STATUS_CONFIG[r.status]
              const StatusIcon = cfg.icon
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-card)]">
                  {r.youtube_video_id && (
                    <img
                      src={`https://img.youtube.com/vi/${r.youtube_video_id}/mqdefault.jpg`}
                      alt=""
                      className="h-12 w-20 shrink-0 rounded-lg object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{r.title || 'Música'}</p>
                    <p className="truncate text-[11px] text-fg-muted">{r.youtube_url}</p>
                  </div>
                  <span className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${cfg.cls}`}>
                    <StatusIcon size={12} />
                    {cfg.label}
                  </span>
                  <a
                    href={r.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
                    title="Abrir no YouTube"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MusicRequestPageEntry() {
  return (
    <ToastProvider>
      <MusicRequestPage />
    </ToastProvider>
  )
}
