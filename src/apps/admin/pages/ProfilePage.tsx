import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../core/auth/AuthContext'
import { authService } from '../../../core/auth/service'
import type { Accent, ThemeVariant } from '../../../core/auth/types'
import { themeStore } from '../../../core/theme/store'
import { icons } from '../../../lib/icons'
import { uploadAvatarToCloudinary } from '../../../lib/cloudinary'

const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { value: 'cyan', label: 'Ciano', color: '#06b6d4' },
  { value: 'blue', label: 'Azul', color: '#3b82f6' },
  { value: 'purple', label: 'Roxo', color: '#a855f7' },
]

const THEMES: { value: ThemeVariant; label: string; icon: typeof icons.ui.sun }[] = [
  { value: 'dark', label: 'Escuro', icon: icons.ui.moon },
  { value: 'dim', label: 'Sutil', icon: icons.ui.sun },
  { value: 'light', label: 'Claro', icon: icons.ui.sun },
]

export function ProfilePage() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  async function handleAvatarUpload(file: File) {
    setUploading(true)
    try {
      const url = await uploadAvatarToCloudinary(file)
      await authService.updateProfile({ avatar: url })
      setFeedback({ type: 'success', message: 'Foto atualizada!' })
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao enviar foto' })
    }
    setUploading(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await authService.updateProfile({ name: name.trim() })
      setFeedback({ type: 'success', message: 'Nome atualizado!' })
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao salvar' })
    }
    setSaving(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleAccentChange(accent: Accent) {
    if (!user) return
    themeStore.apply(user.theme_variant, accent)
    await authService.updateProfile({ accent })
    setFeedback({ type: 'success', message: 'Cor alterada!' })
    setTimeout(() => setFeedback(null), 2000)
  }

  async function handleThemeChange(theme_variant: ThemeVariant) {
    if (!user) return
    themeStore.apply(theme_variant, user.accent)
    await authService.updateProfile({ theme_variant })
    setFeedback({ type: 'success', message: 'Tema alterado!' })
    setTimeout(() => setFeedback(null), 2000)
  }

  const accentColor = ACCENTS.find((a) => a.value === user.accent)?.color || '#10b981'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Meu Perfil</h2>
        <p className="mt-1 text-sm text-fg-muted">Suas configurações pessoais</p>
      </div>

      {feedback && (
        <div className={`rounded-xl p-3 text-xs font-medium ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Avatar */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold text-fg-muted mb-4">Foto do Perfil</p>
        <div className="flex items-center gap-5">
          <div className="relative group">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleAvatarUpload(file)
              }}
            />
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden"
              style={{ backgroundColor: accentColor + '15' }}
            >
              {user.avatar ? (
                <img src={user.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <icons.ui.user size={32} style={{ color: accentColor }} />
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {uploading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <icons.ui.camera size={18} className="text-white" />
              )}
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-fg">{user.name}</p>
            <p className="text-xs text-fg-muted">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold text-fg-muted mb-3">Nome</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || name === user.name}
            className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? '...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Accent */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold text-fg-muted mb-3">Cor do App</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => handleAccentChange(a.value)}
              onMouseEnter={() => themeStore.previewAccent(a.value)}
              onMouseLeave={() => themeStore.resetAccent()}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                user.accent === a.value
                  ? 'ring-2 ring-offset-2 ring-offset-card'
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={{ backgroundColor: a.color + '15', color: a.color }}
            >
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: a.color }} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold text-fg-muted mb-3">Tema</p>
        <div className="flex gap-2">
          {THEMES.map((t) => {
            const Icon = t.icon
            const isActive = user.theme_variant === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => handleThemeChange(t.value)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/30'
                    : 'bg-input text-fg-muted hover:text-fg'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Info */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold text-fg-muted mb-3">Informações da Conta</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">Email</span>
            <span className="text-fg font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Role</span>
            <span className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-purple-500">
              Administrador
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Membro desde</span>
            <span className="text-fg">
              {new Date(user.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
