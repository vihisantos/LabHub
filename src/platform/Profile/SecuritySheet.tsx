import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, ShieldCheck, Plus, Trash2, Pencil, X } from 'lucide-react'
import { securityService, browserSupportsPasskey, type PasskeyItem, type MfaFactor } from '../../core/auth/securityService'

interface SecuritySheetProps {
  open: boolean
  onClose: () => void
}

export function SecuritySheet({ open, onClose }: SecuritySheetProps) {
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([])
  const [webauthnFactors, setWebauthnFactors] = useState<MfaFactor[]>([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const canPasskey = browserSupportsPasskey()

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([securityService.listPasskeys(), securityService.listFactors()])
    setPasskeys(p)
    setWebauthnFactors(f.webauthn)
  }, [])

  useEffect(() => {
    if (open) {
      setFeedback(null)
      load().catch(() => {})
    }
  }, [open, load])

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setFeedback({ type, message: msg })
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleRegisterPasskey() {
    setBusy(true)
    try {
      const res = await securityService.registerPasskey()
      if (!res.ok) {
        flash(res.error || 'Falha ao cadastrar biometria', 'error')
        return
      }
      flash('Biometria cadastrada!')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleEnrollWebauthn() {
    setBusy(true)
    try {
      const res = await securityService.enrollWebauthn('Biometria de verificação')
      if (!res.ok) {
        flash(res.error || 'Falha ao cadastrar verificação biométrica', 'error')
        return
      }
      flash('Verificação biométrica cadastrada!')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleDeletePasskey(id: string) {
    setBusy(true)
    try {
      const res = await securityService.deletePasskey(id)
      if (!res.ok) {
        flash(res.error || 'Falha ao remover', 'error')
        return
      }
      flash('Biometria removida')
      setPasskeys((p) => p.filter((x) => x.id !== id))
    } finally {
      setBusy(false)
    }
  }

  async function handleRenamePasskey(id: string) {
    const name = renameValue.trim()
    if (!name) return
    setBusy(true)
    try {
      const res = await securityService.renamePasskey(id, name)
      if (!res.ok) {
        flash(res.error || 'Falha ao renomear', 'error')
        return
      }
      flash('Nome atualizado')
      setRenamingId(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleUnenrollFactor(id: string) {
    setBusy(true)
    try {
      const res = await securityService.unenrollFactor(id)
      if (!res.ok) {
        flash(res.error || 'Falha ao remover', 'error')
        return
      }
      flash('Verificação removida')
      setWebauthnFactors((f) => f.filter((x) => x.id !== id))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="w-full max-w-md rounded-t-2xl bg-card p-4 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-fg">Segurança</p>
                  <p className="text-[10px] text-fg-dim">Biometria e verificação em duas etapas</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1">
              {feedback && (
                <div
                  className={`rounded-xl p-3 text-xs font-medium ${
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              {/* Passkeys (login com biometria) */}
              <div className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      <Fingerprint size={14} className="text-blue-500" />
                      Biometria para login
                    </p>
                    <p className="text-[10px] text-fg-dim">Entre no app sem digitar a senha</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegisterPasskey}
                    disabled={busy || !canPasskey}
                    className="flex items-center gap-1 rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-400 disabled:opacity-50"
                  >
                    <Plus size={13} />
                    Cadastrar
                  </button>
                </div>

                {!canPasskey && (
                  <p className="text-[10px] text-fg-dim">Seu navegador não suporta WebAuthn.</p>
                )}

                <div className="space-y-1.5">
                  {passkeys.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2"
                    >
                      {renamingId === p.id ? (
                        <>
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            autoFocus
                            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg focus:border-blue-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenamePasskey(p.id)}
                            disabled={busy}
                            className="rounded-lg bg-blue-500 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                          >
                            OK
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                            <Fingerprint size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-fg">{p.friendlyName}</p>
                            <p className="text-[10px] text-fg-dim">
                              {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                              {p.lastUsedAt ? ` · último uso ${new Date(p.lastUsedAt).toLocaleDateString('pt-BR')}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            title="Renomear"
                            onClick={() => {
                              setRenamingId(p.id)
                              setRenameValue(p.friendlyName)
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-input hover:text-fg"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Remover"
                            onClick={() => handleDeletePasskey(p.id)}
                            disabled={busy}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {passkeys.length === 0 && (
                    <p className="py-2 text-center text-[10px] text-fg-dim">Nenhuma biometria cadastrada.</p>
                  )}
                </div>
              </div>

              {/* MFA WebAuthn (segundo fator) */}
              <div className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      <ShieldCheck size={14} className="text-emerald-500" />
                      Verificação em duas etapas
                    </p>
                    <p className="text-[10px] text-fg-dim">Exige biometria após digitar a senha</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnrollWebauthn}
                    disabled={busy || !canPasskey}
                    className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
                  >
                    <Plus size={13} />
                    Ativar
                  </button>
                </div>

                <div className="space-y-1.5">
                  {webauthnFactors.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                        <ShieldCheck size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg">{f.friendlyName || 'Biometria'}</p>
                        <p className="text-[10px] text-fg-dim">{new Date(f.createdAt).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <button
                        type="button"
                        title="Remover"
                        onClick={() => handleUnenrollFactor(f.id)}
                        disabled={busy}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {webauthnFactors.length === 0 && (
                    <p className="py-2 text-center text-[10px] text-fg-dim">Dois fatores desativado.</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
