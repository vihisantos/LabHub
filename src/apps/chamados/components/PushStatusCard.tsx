import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../core/auth/useAuth'
import { usePushNotifications } from '../../../lib/usePushNotifications'
import { buildPushUser } from '../../../lib/buildPushUser'
import { icons } from '../../../lib/icons'

export function PushStatusCard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const pushUser = useMemo(() => (user ? buildPushUser(user) : null), [user])

  const { supported, permission, subscribed, loading, error, subscribe } = usePushNotifications(
    '/api/push/subscribe',
    pushUser,
  )

  const active = subscribed && permission === 'granted'
  const denied = permission === 'denied'

  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            active
              ? 'bg-emerald-500/10 text-emerald-500'
              : denied
                ? 'bg-red-500/10 text-red-500'
                : 'bg-amber-500/10 text-amber-500'
          }`}
        >
          {loading ? (
            <icons.ui.clock size={18} />
          ) : active ? (
            <icons.ui.checkCircle size={18} />
          ) : denied ? (
            <icons.ui.alertTriangle size={18} />
          ) : (
            <icons.ui.bellRing size={18} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">
            {loading
              ? 'Notificações'
              : !supported
                ? '🔔 Não suportadas'
                : active
                  ? '✅ Push ativo'
                  : denied
                    ? '⚠️ Push bloqueado'
                    : '🔔 Push desativado'}
          </p>
          <p className="text-[11px] text-fg-muted">
            {loading
              ? 'Verificando…'
              : !supported
                ? 'Este navegador não suporta notificações'
                : active
                  ? 'Você recebe avisos de chamados neste dispositivo'
                  : denied
                    ? 'Bloqueado pelo navegador — libere nas Configurações'
                    : 'Ative para receber avisos de chamados'}
          </p>
        </div>

        {!loading && supported && !active && (
          <button
            type="button"
            onClick={subscribe}
            disabled={loading}
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400 disabled:opacity-60"
          >
            {denied ? 'Reativar' : 'Ativar'}
          </button>
        )}

        <button
          type="button"
          onClick={() => navigate('/chamados/settings')}
          aria-label="Configurar notificações"
          className="shrink-0 rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
        >
          <icons.ui.sliders size={16} />
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
