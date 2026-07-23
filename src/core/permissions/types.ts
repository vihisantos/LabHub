export type Permission =
  | 'assets.view' | 'assets.create' | 'assets.edit' | 'assets.delete'
  | 'tickets.view' | 'tickets.create' | 'tickets.edit' | 'tickets.assign'
  | 'stock.view' | 'stock.create' | 'stock.edit' | 'stock.delete'
  | 'rooms.view' | 'rooms.create' | 'rooms.edit' | 'rooms.delete'
  | 'users.view' | 'users.manage'
  | 'logs.view'
  | 'settings.manage'
  | 'workspaces.manage'

export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  isDefault: boolean
}

export const DEFAULT_ROLES: Omit<Role, 'id'>[] = [
  {
    name: 'Administrador',
    description: 'Acesso total ao sistema',
    permissions: [
      'assets.view', 'assets.create', 'assets.edit', 'assets.delete',
      'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.assign',
      'stock.view', 'stock.create', 'stock.edit', 'stock.delete',
      'rooms.view', 'rooms.create', 'rooms.edit', 'rooms.delete',
      'users.view', 'users.manage',
      'logs.view',
      'settings.manage',
      'workspaces.manage',
    ],
    isDefault: false,
  },
  {
    name: 'Técnico',
    description: 'Pode gerenciar chamados e ativos',
    permissions: [
      'assets.view', 'assets.create', 'assets.edit',
      'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.assign',
      'stock.view', 'stock.create', 'stock.edit',
      'rooms.view', 'rooms.create', 'rooms.edit',
      'users.view',
      'logs.view',
    ],
    isDefault: false,
  },
  {
    name: 'Visualizador',
    description: 'Somente visualização',
    permissions: [
      'assets.view',
      'tickets.view', 'tickets.create',
      'stock.view',
      'rooms.view',
    ],
    isDefault: true,
  },
]

export const PERMISSION_LABELS: Record<Permission, string> = {
  'assets.view': 'Ver ativos',
  'assets.create': 'Criar ativos',
  'assets.edit': 'Editar ativos',
  'assets.delete': 'Excluir ativos',
  'tickets.view': 'Ver chamados',
  'tickets.create': 'Criar chamados',
  'tickets.edit': 'Editar chamados',
  'tickets.assign': 'Atribuir chamados',
  'stock.view': 'Ver estoque',
  'stock.create': 'Criar itens',
  'stock.edit': 'Editar itens',
  'stock.delete': 'Excluir itens',
  'rooms.view': 'Ver salas',
  'rooms.create': 'Criar salas',
  'rooms.edit': 'Editar salas',
  'rooms.delete': 'Excluir salas',
  'users.view': 'Ver usuários',
  'users.manage': 'Gerenciar usuários',
  'logs.view': 'Ver logs',
  'settings.manage': 'Gerenciar configurações',
  'workspaces.manage': 'Gerenciar workspaces',
}

export const PERMISSION_GROUPS = [
  { name: 'Ativos', permissions: ['assets.view', 'assets.create', 'assets.edit', 'assets.delete'] as Permission[] },
  { name: 'Chamados', permissions: ['tickets.view', 'tickets.create', 'tickets.edit', 'tickets.assign'] as Permission[] },
  { name: 'Estoque', permissions: ['stock.view', 'stock.create', 'stock.edit', 'stock.delete'] as Permission[] },
  { name: 'Salas', permissions: ['rooms.view', 'rooms.create', 'rooms.edit', 'rooms.delete'] as Permission[] },
  { name: 'Usuários', permissions: ['users.view', 'users.manage'] as Permission[] },
  { name: 'Sistema', permissions: ['logs.view', 'settings.manage', 'workspaces.manage'] as Permission[] },
]
