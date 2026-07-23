import type { UserRole } from '../auth/types'

export interface UserProfile {
  id: string
  userId: string
  displayName: string
  department: string
  role: UserRole
  avatar?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type UserProfileFormData = Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>

export const DEPARTMENT_OPTIONS = [
  'TI',
  'Administração',
  'Docência',
  'Manutenção',
  'Coordenação',
  'Outro',
]
