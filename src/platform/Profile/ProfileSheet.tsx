import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../core/auth/AuthContext'
import { authService } from '../../core/auth/service'
import type { Accent, ThemeVariant } from '../../core/auth/types'
import { themeStore } from '../../core/theme/store'
import { ACCENTS, THEMES, accentColor } from '../../core/theme/constants'
import { uploadAvatarToCloudinary, uploadBannerToCloudinary } from '../../lib/cloudinary'
import { icons } from '../../lib/icons'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { WorkspaceSwitcherSheet } from '../WorkspaceSwitcher/WorkspaceSwitcherSheet'
import { BottomSheet, SheetHeader } from '../ui/BottomSheet'
import { AvatarIcon } from './UserAvatar'
import { SecuritySheet } from './SecuritySheet'
import { usePushNotifications } from '../../lib/usePushNotifications'
import { buildPushUser } from '../../lib/buildPushUser'
import { defaultDb as supabase } from '../../lib/supabase'

interface ProfileSheetProps {
  open: boolean
  onClose: () => void
}

type Feedback = { type: 'success' | 'error'; message: string } | null

/** Só o suficiente para rejeitar o óbvio; o resto o navegador valida também. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{children}</p>
}

export function ProfileSheet({ open, onClose }: ProfileSheetProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [institutionalEmail, setInstitutionalEmail] = useState(user?.institutionalEmail || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const { workspace, assignedWorkspaces } = useWorkspace()
  const pushUser = useMemo(() => (user ? buildPushUser(user) : null), [user])
  const { supported, permission, subscribed, loading: pushLoading, error: pushError, subscribe } = usePushNotifications(
    '/api/push/subscribe',
    pushUser,
  )
  const [testingPush, setTestingPush] = useState(false)
  const [pushTestResult, setPushTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const pushActive = subscribed && permission === 'granted'

  async function handleTestPush() {
    setTestingPush(true)
    setPushTestResult(null)
    try {
      if (!supabase) throw new Error('Supabase não configurado')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada. Faça login novamente.')
      const res = await fetch('/api/chamados/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar a notificação de teste')
      if (data.total === 0) {
        setPushTestResult({ ok: false, message: data.message || 'Nenhuma inscrição encontrada para este usuário' })
      } else if (data.sent > 0) {
        setPushTestResult({ ok: true, message: `Push de teste enviado (${data.sent}/${data.total}) — confira a notificação!` })
      } else {
        setPushTestResult({ ok: false, message: 'O envio falhou. Verifique as permissões do navegador.' })
      }
    } catch (e) {
      setPushTestResult({ ok: false, message: e instanceof Error ? e.message : 'Erro ao testar a notificação' })
    } finally {
      setTestingPush(false)
    }
  }

  if (!user) return null

  const accent = accentColor(user.accent)
  const emailInstitucional = user.institutionalEmail?.trim() || ''

  // Mostrar o @labhub como se fosse o contato real seria a mentira que o campo
  // institucional existe para evitar: ele é provisório, não é onde a pessoa é
  // encontrada. O contato institucional é mostrado quando existe; o da conta
  // fica como segunda linha, menor, para não se perder de onde se entra.
  const contato = emailInstitucional || 'E-mail institucional não informado'
  const mostrarEmailDaConta = emailInstitucional !== user.email

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setFeedback({ type, message: msg })
    setTimeout(() => setFeedback(null), 3000)
  }

  function abrirEdicao() {
    // Sem isto, o rascunho anterior sobrevive a um Cancelar e reaparece na
    // próxima abertura, com a tela já mostrando "editando" e nada editável.
    setName(user?.name || '')
    setInstitutionalEmail(user?.institutionalEmail || '')
    setFeedback(null)
    setEditing(true)
  }

  function fecharEdicao() {
    setName(user?.name || '')
    setInstitutionalEmail(user?.institutionalEmail || '')
    setFeedback(null)
    setEditing(false)
  }

  async function handleBannerUpload(file: File) {
    setUploading('banner')
    try {
      const url = await uploadBannerToCloudinary(file)
      await authService.updateProfile({ banner: url })
      flash('Banner atualizado!')
    } catch {
      flash('Erro ao enviar banner', 'error')
    }
    setUploading(null)
  }

  async function handleAvatarUpload(file: File) {
    setUploading('avatar')
    try {
      const url = await uploadAvatarToCloudinary(file)
      await authService.updateProfile({ avatar: url })
      flash('Foto atualizada!')
    } catch {
      flash('Erro ao enviar foto', 'error')
    }
    setUploading(null)
  }

  const nomeAlterado = name.trim() !== user.name
  const emailAlterado = institutionalEmail.trim() !== emailInstitucional

  async function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      flash('O nome não pode ficar vazio', 'error')
      return
    }
    const trimmedEmail = institutionalEmail.trim()
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      flash('E-mail institucional inválido', 'error')
      return
    }
    setSaving(true)
    try {
      // Vazio vira null, não '': a coluna distingue "não informado" de
      // "informado como string vazia", e só a primeira faz sentido.
      await authService.updateProfile({
        name: trimmedName,
        institutionalEmail: trimmedEmail || null,
      })
      setEditing(false)
      flash('Perfil atualizado!')
    } catch {
      flash('Erro ao salvar', 'error')
    }
    setSaving(false)
  }

  async function handleAccentChange(a: Accent) {
    if (!user) return
    themeStore.apply(user.theme_variant, a)
    await authService.updateProfile({ accent: a })
  }

  async function handleThemeChange(t: ThemeVariant) {
    if (!user) return
    themeStore.apply(t, user.accent)
    await authService.updateProfile({ theme_variant: t })
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function goAdmin() {
    onClose()
    navigate('/admin')
  }

  function rowClass() {
    // min-h-11 é explícito mesmo com o tile de 40px + py-3 já passando de 64px:
    // o alvo mínimo fica no markup, não numa conta de padding.
    return 'flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card-hover'
  }

  function tileClass(tom: 'muted' | 'warn' | 'bad' | 'good') {
    const fundo = {
      muted: 'bg-input text-fg-muted',
      warn: 'bg-amber-500/10 text-amber-500',
      bad: 'bg-red-500/10 text-red-500',
      good: 'bg-emerald-500/10 text-emerald-500',
    }[tom]
    return `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fundo}`
  }

  return (
    <>
      <BottomSheet open={open} onClose={onClose}>
        <SheetHeader onClose={onClose} />

      <div data-testid="perfil-conteudo" className="scrollbar-thin flex-1 overflow-y-auto">
              {/* Banner */}
              <div className="relative mt-2 h-32 w-full overflow-hidden">
                {user.banner ? (
                  <img src={user.banner} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full" style={{ backgroundColor: accent + '20' }} />
                )}
                <input
                  ref={bannerRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleBannerUpload(file)
                    e.target.value = ''
                  }}
                />
                {editing && (
                  <button
                    type="button"
                    onClick={() => bannerRef.current?.click()}
                    disabled={uploading === 'banner'}
                    aria-label="Alterar banner"
                    className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-xl bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-60"
                  >
                    {uploading === 'banner' ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <icons.ui.camera size={18} />
                    )}
                  </button>
                )}
              </div>

              {/* Avatar + identidade */}
              <div className="flex items-end gap-4 px-5 pt-4 pb-4">
                <div className="relative shrink-0">
                  <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-surface">
                    <AvatarIcon user={user} size={80} />
                  </div>
                  <input
                    ref={avatarRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleAvatarUpload(file)
                      e.target.value = ''
                    }}
                  />
                  {editing && (
                    <button
                      type="button"
                      onClick={() => avatarRef.current?.click()}
                      disabled={uploading === 'avatar'}
                      aria-label="Alterar foto"
                      className="absolute -bottom-2 -right-2 flex h-11 w-11 items-center justify-center rounded-full border-2 border-surface bg-card text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
                    >
                      {uploading === 'avatar' ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-muted border-t-transparent" />
                      ) : (
                        <icons.ui.camera size={16} />
                      )}
                    </button>
                  )}
                </div>

                <div className="min-w-0 flex-1 pb-1">
                  {editing ? (
                    <div className="space-y-2">
                      <div>
                        <label htmlFor="perfil-nome" className="mb-1 block text-[11px] font-medium text-fg-muted">
                          Nome
                        </label>
                        <input
                          id="perfil-nome"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-[var(--accent)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="perfil-email" className="mb-1 block text-[11px] font-medium text-fg-muted">
                          E-mail institucional
                        </label>
                        <input
                          id="perfil-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="nome@univ.edu"
                          value={institutionalEmail}
                          onChange={(e) => setInstitutionalEmail(e.target.value)}
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:border-[var(--accent)] focus:outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-base font-bold text-fg">{user.name}</p>
                      <p
                        className={`truncate text-xs ${emailInstitucional ? 'text-fg-dim' : 'text-fg-muted italic'}`}
                      >
                        {contato}
                      </p>
                      {mostrarEmailDaConta && (
                        <p className="truncate text-[10px] text-fg-muted">{user.email}</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Alterar / Salvar */}
              <div className="px-5 pb-4">
                {editing ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || uploading !== null || (!nomeAlterado && !emailAlterado)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                      // --accent-strong, não --accent: branco sobre o accent puro
                      // fica entre 2.43:1 (ciano) e 3.97:1 (roxo) e reprova em
                      // todos os quatro. Sobre --accent-strong fica 4.70:1 a 5.30:1.
                      style={{ backgroundColor: 'var(--accent-strong)' }}
                    >
                      {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      onClick={fecharEdicao}
                      disabled={saving}
                      className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm font-semibold text-fg-dim transition-colors hover:text-fg disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={abrirEdicao}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card text-sm font-semibold text-fg transition-colors hover:bg-card-hover"
                  >
                    <icons.ui.edit size={15} />
                    Alterar perfil
                  </button>
                )}
              </div>

              {feedback && (
                <div
                  role="status"
                  className={`mx-5 mb-4 rounded-xl p-3 text-xs font-medium ${
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <div className="space-y-5 px-5 pb-6">
                {/* Aparência */}
                <section>
                  <SectionTitle>Aparência</SectionTitle>
                  <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                    <p className="mb-2 text-xs font-semibold text-fg-muted">Cor de destaque</p>
                    <div className="mb-4 flex flex-wrap gap-3">
                      {ACCENTS.map((a) => {
                        const ativo = user.accent === a.value
                        return (
                          <button
                            key={a.value}
                            type="button"
                            // O nome vem por aria-label/title porque não há texto
                            // visível: a cor É a amostra, e o texto repetia a cor
                            // duas vezes (no rótulo e no ponto) — malhando.
                            aria-label={a.label}
                            aria-pressed={ativo}
                            title={a.label}
                            onClick={() => handleAccentChange(a.value)}
                            onMouseEnter={() => themeStore.previewAccent(a.value)}
                            onMouseLeave={() => themeStore.resetAccent()}
                            className={`h-11 w-11 shrink-0 rounded-full transition-transform motion-reduce:hover:scale-100 ${
                              ativo
                                ? 'ring-2 ring-fg ring-offset-2 ring-offset-card'
                                : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: a.color }}
                          />
                        )
                      })}
                    </div>

                    <p className="mb-2 text-xs font-semibold text-fg-muted">Tema</p>
                    <div className="flex gap-2">
                      {THEMES.map((t) => {
                        const Icon = t.icon
                        const isActive = user.theme_variant === t.value
                        return (
                          <button
                            key={t.value}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => handleThemeChange(t.value)}
                            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all ${
                              isActive ? 'ring-2 ring-offset-2 ring-offset-card' : 'bg-input text-fg-muted hover:text-fg'
                            }`}
                            style={isActive ? { backgroundColor: accent + '1a', color: accent } : undefined}
                          >
                            <Icon size={15} />
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </section>

                {/* Conta */}
                <section>
                  <SectionTitle>Conta</SectionTitle>
                  <div className="divide-y divide-line overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                    {/* Notificações — estado real, por isso a cor é de estado */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div
                        className={tileClass(
                          pushLoading ? 'muted' : pushActive ? 'good' : permission === 'denied' ? 'bad' : 'warn',
                        )}
                      >
                        {pushLoading ? (
                          <icons.ui.clock size={18} />
                        ) : pushActive ? (
                          <icons.ui.checkCircle size={18} />
                        ) : permission === 'denied' ? (
                          <icons.ui.alertTriangle size={18} />
                        ) : (
                          <icons.ui.bellRing size={18} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg">
                          {pushLoading
                            ? 'Notificações'
                            : !supported
                              ? 'Push não suportado'
                              : pushActive
                                ? 'Push ativo'
                                : permission === 'denied'
                                  ? 'Push bloqueado'
                                  : 'Push desativado'}
                        </p>
                        <p className="text-[11px] text-fg-muted">
                          {pushLoading
                            ? 'Verificando…'
                            : !supported
                              ? 'Este navegador não suporta notificações'
                              : pushActive
                                ? 'Você recebe avisos neste dispositivo'
                                : permission === 'denied'
                                  ? 'Bloqueado pelo navegador — libere nas configurações'
                                  : 'Ative para receber avisos de chamados e estoque'}
                        </p>
                        {pushError && <p className="mt-1 text-[11px] text-red-500">{pushError}</p>}
                        {pushTestResult && (
                          <p className={`mt-1 text-[11px] ${pushTestResult.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                            {pushTestResult.message}
                          </p>
                        )}
                      </div>
                      {!pushLoading && supported && !pushActive && (
                        <button
                          type="button"
                          onClick={subscribe}
                          className="min-h-11 shrink-0 rounded-lg bg-amber-500 px-3 text-xs font-medium text-white transition-colors hover:bg-amber-400"
                        >
                          {permission === 'denied' ? 'Reativar' : 'Ativar'}
                        </button>
                      )}
                      {!pushLoading && supported && pushActive && (
                        <button
                          type="button"
                          onClick={handleTestPush}
                          disabled={testingPush}
                          // O rótulo visível cabe em "Testar"; o nome acessível
                          // continua sendo o completo, que é o que o leitor de
                          // tela anuncia e o que os testes procuram.
                          aria-label={testingPush ? 'Enviando notificação de teste' : 'Testar notificação'}
                          className="min-h-11 shrink-0 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-fg transition-colors hover:bg-input disabled:opacity-60"
                        >
                          {testingPush ? 'Enviando…' : 'Testar'}
                        </button>
                      )}
                    </div>

                    {/* Segurança */}
                    <button type="button" onClick={() => setSecurityOpen(true)} className={rowClass()}>
                      <div className={tileClass('muted')}>
                        <icons.ui.shield size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg">Segurança</p>
                        <p className="text-[11px] text-fg-muted">Biometria para entrar sem senha</p>
                      </div>
                      <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
                    </button>

                    {/* Workspace */}
                    <button type="button" onClick={() => setSwitcherOpen(true)} className={rowClass()}>
                      <div className={tileClass('muted')}>
                        <icons.ui.home size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg">Workspace</p>
                        <p className="text-[11px] text-fg-muted">
                          {workspace?.name || 'Selecionar workspace'}
                          {workspace?.location ? ` · ${workspace.location}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-fg-muted">Trocar</span>
                      <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
                    </button>
                  </div>
                </section>

                {/* Administração */}
                {user.is_super_admin && (
                  <section>
                    <SectionTitle>Administração</SectionTitle>
                    <button type="button" onClick={goAdmin} className={`${rowClass()} rounded-xl bg-card shadow-[var(--shadow-card)]`}>
                      <div className={tileClass('muted')}>
                        <icons.nav.settings size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg">Configurações do Admin</p>
                        <p className="text-[11px] text-fg-muted">Administração, notificações e logs</p>
                      </div>
                      <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
                    </button>
                  </section>
                )}

                {/* Sair — destrutivo, então fica sozinho, no fim, com folga */}
                <button
                  id="btn-logout"
                  type="button"
                  onClick={handleSignOut}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/15"
                >
                  <LogOut size={16} />
                  Sair da conta
                </button>
              </div>
            </div>
      </BottomSheet>

      <WorkspaceSwitcherSheet
        open={switcherOpen}
        workspaces={assignedWorkspaces}
        onClose={() => setSwitcherOpen(false)}
      />

      <SecuritySheet open={securityOpen} onClose={() => setSecurityOpen(false)} />
    </>
  )
}
