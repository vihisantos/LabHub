export interface PartUsage {
  id: string
  partId: string
  pcId: string
  partName: string
  quantity: number
  timestamp: { seconds: number; nanoseconds: number }
}
