import { useState } from 'react'
import { useFastSync } from '../../../lib/useFastSync'
import { icons } from '../../../lib/icons'
import { NotificationInboxTab } from '../components/NotificationInboxTab'
import { NotificationRulesTab } from '../components/NotificationRulesTab'
import { NotificationSendTab } from '../components/NotificationSendTab'

type Tab = 'inbox' | 'rules' | 'send'

const TABS: { id: Tab; label: string; icon: typeof icons.ui.inbox }[] = [
  { id: 'inbox', label: 'Entrada', icon: icons.ui.inbox },
  { id: 'rules', label: 'Regras', icon: icons.ui.sliders },
  { id: 'send', label: 'Enviar', icon: icons.ui.upload },
]

export function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('inbox')
  useFastSync(['notifications'], 10000)

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Gestão de Notificações</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Controle quem recebe o quê por aplicativo e workspace
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-4 flex gap-1.5 bg-surface/80 px-4 py-2 backdrop-blur-xl">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all ${
              tab === t.id
                ? 'bg-indigo-500/15 text-indigo-500 ring-1 ring-indigo-500/30'
                : 'bg-card text-fg-muted hover:text-fg'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inbox' && <NotificationInboxTab />}
      {tab === 'rules' && <NotificationRulesTab />}
      {tab === 'send' && <NotificationSendTab />}
    </div>
  )
}
