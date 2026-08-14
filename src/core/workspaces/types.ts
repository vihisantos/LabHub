export interface Workspace {
  id: string
  name: string
  slug: string
  location: string
  spreadsheet_url: string
  color?: string
  disabled_apps?: string[]
  created_at: string
  updated_at: string
}

export type WorkspaceFormData = Omit<Workspace, 'id' | 'created_at' | 'updated_at'>
