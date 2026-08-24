import type { ComponentType } from 'react'

import type { AppSettingsDefinition, AppSettingsPanelProps } from './core/appSettings/types'
import { icons } from './lib/icons'

export interface AppModule {
  id: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  route: string
  color: string

  /** Pode ser gerenciado por admins dentro de um workspace (WorkspaceAppSheet). */
  configurable?: boolean
  /** Declara intenção de purge de dados por workspace. A ação só é habilitada
   * quando o mecanismo real existir (app_data_backups + endpoint dedicado). */
  clearable?: boolean

  /** Contrato consumido por core/appSettings. Obrigatório antes de qualquer
   * leitura/escrita de configuração deste app via appSettingsService. */
  settings?: AppSettingsDefinition<unknown>

  /** Painel próprio de configuração renderizado pelo shell genérico.
   * A plataforma não gera formulários: cada app traz sua UI. */
  SettingsPanel?: ComponentType<AppSettingsPanelProps>
}

export const appRegistry: AppModule[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Métricas e atividade da plataforma',
    icon: icons.nav.dashboard,
    route: '/dashboard',
    color: '#10b981',
  },
  {
    id: 'pc-care',
    name: 'PC Care',
    description: 'Gestão de limpeza e manutenção de PCs',
    icon: icons.nav.pcs,
    route: '/pc-care',
    color: '#8b5cf6',
  },
  {
    id: 'stock',
    name: 'Estoque',
    description: 'Controle de estoque, movimentações e conferência de kits',
    icon: icons.ui.package,
    route: '/stock',
    color: '#10b981',
  },
  {
    id: 'reservalab',
    name: 'ReservaLab',
    description: 'Reserva de laboratórios, tablets e gestão de inventário',
    icon: icons.ui.flaskConical,
    route: '/reservalab',
    color: '#6366f1',
  },
  {
    id: 'tv',
    name: 'TV',
    description: 'Canal corporativo e murais digitais',
    icon: icons.ui.tv,
    route: '/tv',
    color: '#ef4444',
    configurable: true,
    clearable: true,
  },
  {
    id: 'chamados',
    name: 'Chamados',
    description: 'Abertura e gestão de chamados técnicos',
    icon: icons.ui.alertCircle,
    route: '/chamados',
    color: '#f59e0b',
  },
  {
    id: 'admin',
    name: 'Administração',
    description: 'Configurações do sistema e gestão de usuários',
    icon: icons.nav.settings,
    route: '/admin',
    color: '#64748b',
  },
]

/**
 * Apps planejados que ainda NÃO entram no launcher: não possuem página/route
 * própria e apareceriam como tiles mortos (Launcher.tsx renderiza todo o
 * registry; UsersPage/RolesPage também iterariam a permissão).
 *
 * Quando o PR do Painel de Chamados entregar a página real, basta mover o
 * objeto abaixo para dentro de `appRegistry` — o WorkspaceAppSheet e o
 * core/appSettings já suportam o módulo sem nenhuma alteração adicional.
 *
 * Fonte de dados futura: consulta SOMENTE LEITURA sobre chamados_tickets.
 * Nenhuma cópia/tabela paralela de chamados será criada.
 */
export const plannedApps: AppModule[] = [
  {
    id: 'chamados-dashboard',
    name: 'Painel de Chamados',
    description: 'Dashboard de chamados e indicadores para telas da TI.',
    icon: icons.nav.dashboard,
    route: '/chamados-dashboard',
    color: '#f59e0b',
    configurable: true,
    clearable: false,
  },
]
