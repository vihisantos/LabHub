import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Download, KeyRound, Copy, Check, Monitor, Clock, ExternalLink } from 'lucide-react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { authService } from '../../../core/auth/service'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { tvApi } from '../utils/apiBase'

const INSTALLER_URL =
  (import.meta.env.VITE_TV_INSTALLER_URL as string | undefined) ||
  'https://github.com/vihisantos/LabHub/releases/latest/download/LabHub-TV-1.0.0-setup.exe'

interface ActivationResult {
  code: string
  expires_at: string
  workspace_id: string
  device_name: string | null
}

function formatExpiry(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function TvDesktopInstall() {
  const user = authService.getCurrentUser()
  const { workspaces } = useWorkspace()
  const [workspaceId, setWorkspaceId] = useState(
    () => user?.is_super_admin ? (workspaces[0]?.id ?? '') : (user?.workspace_ids?.[0] ?? ''),
  )
  const [deviceName, setDeviceName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ActivationResult | null>(null)
  const [copied, setCopied] = useState(false)

  const isSuperAdmin = !!user?.is_super_admin

  const generate = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setError('Supabase não configurado')
      return
    }
    setGenerating(true)
    setError(null)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Sessão expirada. Faça login novamente.')
      }
      const res = await fetch(tvApi('/api/tv/activation/create'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          device_name: deviceName.trim() || null,
          workspace_id: workspaceId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao gerar o código')
      }
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o código')
    } finally {
      setGenerating(false)
    }
  }

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard indisponível */
    }
  }

  const targetWorkspace = workspaces.find((w) => w.id === workspaceId)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Baixar o app ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500">
            <Download size={15} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Baixar o app da TV</h3>
            <p className="text-[11px] text-slate-400">Lab Hub TV Desktop · Windows</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-slate-600">
            <Monitor size={15} className="text-red-500" />
            <p className="text-sm font-medium">Instale em qualquer PC conectado à TV do campus</p>
          </div>
          <ol className="mb-4 space-y-1 text-xs text-slate-500">
            <li>1. Baixe o instalador abaixo no computador da TV</li>
            <li>2. Instale e abra o app — ele roda em tela cheia (kiosk)</li>
            <li>3. Use um código de ativação (ao lado) ou o login do usuário da TV</li>
          </ol>
          <a
            href={INSTALLER_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-500 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition-opacity hover:opacity-90"
          >
            <Download size={15} />
            Baixar instalador (88 MB)
          </a>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Feito para a TV do campus — use esta página em um computador.
          </p>
        </div>
      </motion.div>

      {/* ── Código de ativação ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <KeyRound size={15} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Código de ativação</h3>
            <p className="text-[11px] text-slate-400">Validade de 24h · uso único</p>
          </div>
        </div>

        <form onSubmit={generate} className="space-y-3">
          {isSuperAdmin ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Workspace da TV</label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              O código será vinculado ao workspace <strong className="text-slate-700">{targetWorkspace?.name ?? 'padrão'}</strong>.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Nome da TV (opcional)
            </label>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Ex: TV Recepção, TV Lab 2..."
              maxLength={60}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

          {!result ? (
            <button
              type="submit"
              disabled={generating || (isSuperAdmin && !workspaceId)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              <KeyRound size={15} />
              {generating ? 'Gerando...' : 'Gerar código de ativação'}
            </button>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-600">
                Digite este código no app da TV
              </p>
              <p className="my-2 font-mono text-3xl font-extrabold tracking-[0.35em] text-slate-900">
                {result.code}
              </p>
              <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock size={11} /> expira em {formatExpiry(result.expires_at)}
                </span>
                <span className="flex items-center gap-1">
                  <Monitor size={11} /> {targetWorkspace?.name ?? result.workspace_id.slice(0, 8)}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setResult(null); setDeviceName('') }}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Gerar outro
                </button>
              </div>
            </div>
          )}
        </form>
      </motion.div>

      <div className="lg:col-span-2">
        <a
          href={INSTALLER_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        >
          <ExternalLink size={12} />
          Abrir a página de download em nova aba
        </a>
      </div>
    </div>
  )
}
