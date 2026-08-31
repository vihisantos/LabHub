import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { icons } from '../../../lib/icons'
import { Popover, PopoverTrigger, PopoverContent } from '../../../lib/components/ui'

interface AdminNavTarget {
  to: string
  label: string
  icon?: keyof typeof icons.ui
}

interface AdminNavMenuTab {
  id: string
  label: string
  icon: keyof typeof icons.ui
  routes: string[]
  items: AdminNavTarget[]
}

const INICIO_TO = '/admin'

const PESSOAS: AdminNavMenuTab = {
  id: 'pessoas',
  label: 'Pessoas',
  icon: 'user',
  routes: ['/admin/users', '/admin/requests'],
  items: [
    { to: '/admin/users', label: 'Usuários', icon: 'user' },
    { to: '/admin/requests', label: 'Solicitações', icon: 'inbox' },
  ],
}

const ACESSO_ROUTES = ['/admin/roles']

const ALERTAS: AdminNavMenuTab = {
  id: 'alertas',
  label: 'Alertas',
  icon: 'bellRing',
  routes: ['/admin/notifications', '/admin/logs'],
  items: [
    { to: '/admin/notifications', label: 'Notificações', icon: 'bellRing' },
    { to: '/admin/logs', label: 'Auditoria', icon: 'fileBarChart' },
  ],
}

const MAIS: AdminNavMenuTab = {
  id: 'mais',
  label: 'Mais',
  icon: 'moreHorizontal',
  routes: ['/admin/settings', '/admin/workspaces', '/admin/backups', '/admin/profile'],
  items: [
    { to: '/admin/settings', label: 'Configurações', icon: 'sliders' },
    { to: '/admin/workspaces', label: 'Workspaces', icon: 'mapPin' },
    { to: '/admin/backups', label: 'Backups', icon: 'hardDrive' },
    { to: '/admin/profile', label: 'Perfil', icon: 'user' },
  ],
}

const MENU_TABS: AdminNavMenuTab[] = [PESSOAS, ALERTAS, MAIS]

function matchesRoute(current: string, to: string): boolean {
  if (to === '/admin') return current === '/admin'
  return current === to || current.startsWith(to + '/')
}

export function AdminBottomNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState<string | null>(null)

  const current = location.pathname
  const MoreIcon = icons.nav.more
  const InicioIcon = icons.ui.home

  const inGroup = (routes: string[]) => routes.some((r) => matchesRoute(current, r))
  const activeTabId =
    current === INICIO_TO
      ? 'inicio'
      : inGroup(PESSOAS.routes)
        ? 'pessoas'
        : inGroup(ACESSO_ROUTES)
          ? 'acesso'
          : inGroup(ALERTAS.routes)
            ? 'alertas'
            : 'mais'

  const go = (to: string) => {
    setOpen(null)
    navigate(to)
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.875rem)' }}
      aria-label="Navegação principal"
    >
      <div className="liquid-glass flex max-w-lg flex-1 items-center justify-around rounded-full border border-white/15 bg-surface/60 px-1.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
        <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="absolute -inset-y-1/4 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-[liquid-sheen_6s_ease-in-out_infinite]" />
        </span>

        {/* Início */}
        <button
          type="button"
          onClick={() => go(INICIO_TO)}
          aria-label="Início"
          aria-current={activeTabId === 'inicio' ? 'page' : undefined}
          className={`relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 transition-all ${
            activeTabId === 'inicio' ? 'bg-white/10 text-indigo-500 shadow-inner' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <InicioIcon size={20} />
          <span className="text-[10px] font-medium">Início</span>
        </button>

        {/* Acesso (direto) */}
        <button
          type="button"
          onClick={() => go('/admin/roles')}
          aria-label="Acesso"
          aria-current={activeTabId === 'acesso' ? 'page' : undefined}
          className={`relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 transition-all ${
            activeTabId === 'acesso' ? 'bg-white/10 text-indigo-500 shadow-inner' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <icons.ui.shield size={20} />
          <span className="text-[10px] font-medium">Acesso</span>
        </button>

        {/* Menus (Pessoas, Alertas, Mais) */}
        {MENU_TABS.map((tab) => {
          const isActive = activeTabId === tab.id
          const IconComp = icons.ui[tab.icon]
          const isMore = tab.id === 'mais'
          const showBadge = tab.id === 'alertas' && unreadCount > 0
          return (
            <Popover
              key={tab.id}
              open={open === tab.id}
              onOpenChange={(v) => setOpen(v ? tab.id : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={tab.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 transition-all ${
                    isActive ? 'bg-white/10 text-indigo-500 shadow-inner' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  <span className="relative">
                    {isActive && isMore ? <MoreIcon size={20} /> : <IconComp size={20} />}
                    {showBadge && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-52 border border-line bg-card p-1.5 shadow-xl">
                <p className="px-3 py-2 text-[10px] font-semibold text-fg-muted">{tab.label}</p>
                <div className="flex flex-col">
                  {tab.items.map((item) => {
                    const itemActive = matchesRoute(current, item.to)
                    const Icon = item.icon ? icons.ui[item.icon] : null
                    return (
                      <button
                        key={item.to}
                        type="button"
                        onClick={() => go(item.to)}
                        aria-current={itemActive ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                          itemActive ? 'bg-indigo-500/10 text-indigo-500' : 'text-fg-muted hover:bg-input hover:text-fg'
                        }`}
                      >
                        {Icon && <Icon size={16} />}
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )
        })}
      </div>
    </nav>
  )
}
