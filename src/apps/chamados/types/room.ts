export interface Room {
  id: string
  name: string
  location: string
  assetIds: string[]
  workspace_id?: string
  createdAt: string
  updatedAt: string
}

export type RoomFormData = Omit<Room, 'id' | 'createdAt' | 'updatedAt'>
