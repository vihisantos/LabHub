import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { tvApi } from '../apps/tv/utils/apiBase'

type Phase =
  | 'loading'
  | 'ready'
  | 'expired'
  | 'full'
  | 'limited'
  | 'invalid'
  | 'success'

export function PublicMusicRequestPage() {
  const { token } = useParams<{ token?: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [workspaceName, setWorkspaceName] = useState<string>('')
  const [issued, setIssued] = useState<string>('')
  const [url, setUrl] = useState('')
  const [nickname, setNickname] = useState('')
  const [hp, setHp] = useState('') // honeypot
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token) { setPhase('expired'); return }
      try {
        const res = await fetch(tvApi('/api/tv/public/request/context?token=' + encodeURIComponent(token)))
        if (!res.ok) {
          setPhase(res.status === 403 ? 'expired' : 'invalid')
          return
        }
        const data = await res.json()
        if (cancelled) return
        setWorkspaceName(String(data.workspace_name || 'Unidade'))
        setIssued(String(data.form_issued_at_signed || ''))
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('invalid')
      }
    }
    load()
    return () => { cancelled = true }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || phase !== 'ready') return
    setSubmitting(true)
    setMessage('')
    try {
      const res = await fetch(tvApi('/api/tv/public/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          youtube_url: url,
          nickname: nickname || undefined,
          honeypot: hp,
          form_issued_at_signed: issued,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setPhase('success')
        setMessage(String(data.message || 'Pedido enviado. Aguarde aprovação.'))
        return
      }
      if (res.status === 429) {
        setPhase('full')
        setMessage(String(data.error || 'Fila cheia. Tente novamente mais tarde.'))
        return
      }
      if (res.status === 409) {
        setPhase('limited')
        setMessage(String(data.error || 'Este vídeo já foi solicitado.'))
        return
      }
      setPhase('invalid')
      setMessage(String(data.error || 'Não foi possível registrar o pedido.'))
    } catch {
      setPhase('invalid')
      setMessage('Falha de rede. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-900 px-4 py-6 text-white">
      <div className="mx-auto max-w-sm">
        <h1 className="text-xl font-bold">Peça sua música</h1>
        {workspaceName ? <p className="mt-1 text-sm text-slate-300">{workspaceName}</p> : null}

        {phase === 'loading' && <p className="mt-6 text-sm">Carregando…</p>}

        {phase === 'expired' && (
          <p className="mt-6 text-sm text-amber-300">
            O QR expirou. Escaneie novamente na TV.
          </p>
        )}

        {phase === 'invalid' && (
          <p className="mt-6 text-sm text-red-300">
            {message || 'Link inválido. Escaneie o QR na TV.'}
          </p>
        )}

        {phase === 'full' && (
          <p className="mt-6 text-sm text-amber-300">{message || 'Fila cheia. Tente novamente mais tarde.'}</p>
        )}

        {phase === 'limited' && (
          <p className="mt-6 text-sm text-amber-300">{message || 'Limite de pedidos atingido.'}</p>
        )}

        {phase === 'success' && (
          <div className="mt-6 rounded-xl bg-emerald-900/40 p-4 text-sm text-emerald-200">
            {message || 'Pedido enviado. Aguarde aprovação.'}
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block text-xs text-slate-300">
              Link do YouTube
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs text-slate-300">
              Apelido (opcional)
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={30}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              />
            </label>
            {/* honeypot acessível mas oculto */}
            <div className="sr-only" aria-hidden="true">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={hp}
                  onChange={(e) => setHp(e.target.value)}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default PublicMusicRequestPageEntry
function PublicMusicRequestPageEntry() {
  return <PublicMusicRequestPage />
}