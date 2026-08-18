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

interface ProfileSheetProps {
  open: boolean
  onClose: () => void
}

type Feedback = { type: 'success' | 'error'; message: string } | null

export function ProfileSheet({ open, onClose }: ProfileSheetProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.name || '')
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

  if (!user) return null

  const accent = accentColor(user.accent)

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setFeedback({ type, message: msg })
    setTimeout(() => setFeedback(null), 3000)
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

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await authService.updateProfile({ name: name.trim() })
      setName(name.trim())
      flash('Nome atualizado!')
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

  return (
    <>
      <BottomSheet open={open} onClose={onClose}>
        <SheetHeader onClose={onClose} />

      <div className="scrollbar-thin flex-1 overflow-y-auto">
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
                <button
                  type="button"
                  onClick={() => bannerRef.current?.click()}
                  disabled={uploading === 'banner'}
                  title="Alterar banner"
                  className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                >
                  {uploading === 'banner' ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <icons.ui.camera size={16} />
                  )}
                </button>
              </div>

              {/* Avatar + name */}
              <div className="flex items-end gap-4 px-5 pt-4 pb-5">
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
                  <button
                    type="button"
                    onClick={() => avatarRef.current?.click()}
                    disabled={uploading === 'avatar'}
                    title="Alterar foto"
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-fg-muted transition-colors hover:text-fg"
                  >
                    {uploading === 'avatar' ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-fg-muted border-t-transparent" />
                    ) : (
                      <icons.ui.camera size={13} />
                    )}
                  </button>
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="truncate text-base font-bold text-fg">{user.name}</p>
                  <p className="truncate text-xs text-fg-muted">{user.email}</p>
                </div>
              </div>

              {feedback && (
                <div className={`mx-5 mb-3 rounded-xl p-3 text-xs font-medium ${
                  feedback.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                  {feedback.message}
                </div>
              )}

              <div className="space-y-3 px-5 pb-5">
                {/* Name */}
                <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                  <p className="mb-2 text-xs font-semibold text-fg-muted">Nome</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || name.trim() === user.name}
                      className="shrink-0 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
                    >
                      {saving ? '...' : 'Salvar'}
                    </button>
                  </div>
                </div>

                {/* Accent */}
                <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                  <p className="mb-2 text-xs font-semibold text-fg-muted">Cor do App</p>
                  <div className="flex flex-wrap gap-2">
                    {ACCENTS.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => handleAccentChange(a.value)}
                        onMouseEnter={() => themeStore.previewAccent(a.value)}
                        onMouseLeave={() => themeStore.resetAccent()}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                          user.accent === a.value
                            ? 'ring-2 ring-offset-2 ring-offset-card'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: a.color + '15', color: a.color }}
                      >
                        <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: a.color }} />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme */}
                <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                  <p className="mb-2 text-xs font-semibold text-fg-muted">Tema</p>
                  <div className="flex gap-2">
                    {THEMES.map((t) => {
                      const Icon = t.icon
                      const isActive = user.theme_variant === t.value
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => handleThemeChange(t.value)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/30'
                              : 'bg-input text-fg-muted hover:text-fg'
                          }`}
                        >
                          <Icon size={15} />
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Admin settings */}
                {user.is_super_admin && (
                  <button
                    type="button"
                    onClick={goAdmin}
                    className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-input"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-500">
                      <icons.nav.settings size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">Configurações do Admin</p>
                      <p className="text-xs text-fg-muted">Administração, notificações e logs</p>
                    </div>
                    <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
                  </button>
                )}

                {/* Security */}
                <button
                  type="button"
                  onClick={() => setSecurityOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-input"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                    <icons.ui.shield size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">Segurança</p>
                    <p className="text-xs text-fg-muted">Biometria para entrar sem senha</p>
                  </div>
                  <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
                </button>

                {/* Push Notifications */}
                <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        subscribed && permission === 'granted'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : permission === 'denied'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-amber-500/10 text-amber-500'
                      }`}
                    >
                      {pushLoading ? (
                        <icons.ui.clock size={18} />
                      ) : subscribed && permission === 'granted' ? (
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
                            : subscribed && permission === 'granted'
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
                            : subscribed && permission === 'granted'
                              ? 'Você recebe avisos neste dispositivo'
                              : permission === 'denied'
                                ? 'Bloqueado pelo navegador — libere nas configurações'
                                : 'Ative para receber avisos de chamados e estoque'}
                      </p>
                    </div>
                    {!pushLoading && supported && !(subscribed && permission === 'granted') && (
                      <button
                        type="button"
                        onClick={subscribe}
                        className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400"
                      >
                        {permission === 'denied' ? 'Reativar' : 'Ativar'}
                      </button>
                    )}
                  </div>
                  {pushError && <p className="mt-2 text-[11px] text-red-500">{pushError}</p>}
                </div>

                {/* Workspace switch */}
                <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                  <p className="mb-2 text-xs font-semibold text-fg-muted">Workspace</p>
                  <button
                    type="button"
                    onClick={() => setSwitcherOpen(true)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-input"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: (workspace?.color || '#6366f1') + '18', color: workspace?.color || '#6366f1' }}
                    >
                      <icons.ui.home size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{workspace?.name || 'Selecionar workspace'}</span>
                      {workspace?.location && <span className="block text-[10px] text-fg-muted">{workspace.location}</span>}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-500">Trocar</span>
                    <icons.ui.chevronRight size={14} className="text-fg-muted" />
                  </button>
                </div>

                {/* Logout */}
                <button
                  id="btn-logout"
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/15"
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
