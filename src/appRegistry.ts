import type { ComponentType } from 'react'

export interface AppModule {
  id: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  route: string
  color: string
}

import { icons } from './lib/icons'

export const appRegistry: AppModule[] = [
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
  },
  {
    id: 'chamados',
    name: 'Chamados',
    description: 'Abertura e gestão de chamados técnicos',
    icon: icons.ui.alertCircle,
    route: '/chamados',
    color: '#f59e0b',
  },
]
