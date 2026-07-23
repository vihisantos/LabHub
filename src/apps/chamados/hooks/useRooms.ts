import { useCallback, useEffect, useState } from 'react'
import type { Room, RoomFormData } from '../types'
import { roomService } from '../services/roomService'

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = roomService.getAll()
    setRooms(data.sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: RoomFormData) => {
    const room = roomService.create(data)
    setRooms((prev) => [...prev, room].sort((a, b) => a.name.localeCompare(b.name)))
    return room
  }, [])

  const update = useCallback((id: string, data: Partial<Room>) => {
    const room = roomService.update(id, data)
    if (room) {
      setRooms((prev) => prev.map((r) => (r.id === id ? room : r)).sort((a, b) => a.name.localeCompare(b.name)))
    }
    return room
  }, [])

  const remove = useCallback((id: string) => {
    const ok = roomService.remove(id)
    if (ok) {
      setRooms((prev) => prev.filter((r) => r.id !== id))
    }
    return ok
  }, [])

  return { rooms, loading, create, update, remove, reload: load }
}
