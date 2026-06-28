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
    id: 'pcare',
    name: 'PCare',
    description: 'Gestão de limpeza e manutenção de PCs',
    icon: icons.nav.pcs,
    route: '/pcare',
    color: '#06b6d4',
  },
  {
    id: 'stock',
    name: 'Estoque',
    description: 'Controle de estoque, movimentações e conferência de kits',
    icon: icons.ui.package,
    route: '/stock',
    color: '#10b981',
  },
]
