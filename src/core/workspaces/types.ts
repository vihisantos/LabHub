export interface Workspace {
  id: string
  name: string
  slug: string
  location: string
  spreadsheet_url: string
  created_at: string
  updated_at: string
}

export type WorkspaceFormData = Omit<Workspace, 'id' | 'created_at' | 'updated_at'>

export const DEFAULT_WORKSPACE: WorkspaceFormData = {
  name: 'Anhembi Piracicaba',
  slug: 'piracicaba',
  location: 'Piracicaba, SP',
  spreadsheet_url: '',
}
