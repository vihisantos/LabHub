export interface AppModule {
  id: string
  name: string
  description: string
  icon: string
  route: string
  color: string
}

export const appRegistry: AppModule[] = [
  {
    id: 'pcare',
    name: 'PCare',
    description: 'Gestão de limpeza e manutenção de PCs',
    icon: '🖥️',
    route: '/pcare',
    color: '#06b6d4',
  },
  {
    id: 'general-stock',
    name: 'Estoque Geral',
    description: 'Controle de materiais e suprimentos do laboratório',
    icon: '📦',
    route: '/general-stock',
    color: '#10b981',
  },
]
