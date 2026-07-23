export interface Workspace {
  id: string
  name: string
  slug: string
  location: string
  createdAt: string
  updatedAt: string
}

export type WorkspaceFormData = Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>

export const DEFAULT_WORKSPACE: WorkspaceFormData = {
  name: 'Anhembi Piracicaba',
  slug: 'piracicaba',
  location: 'Piracicaba, SP',
}
