import { useState, useEffect, useCallback } from 'react'
import { fetchDevices, updateDevice, deleteDevice } from '../services/supabase'
import { useToast } from '../../../lib/ToastContext'
import type { TvDevice } from '../types'

export function useDevices() {
  const [devices, setDevices] = useState<TvDevice[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true)
      const data = await fetchDevices()
      setDevices(data)
    } catch {
      if (!silent) addToast('error', 'Erro ao carregar dispositivos')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const rename = async (id: string, name: string) => {
    try {
      await updateDevice(id, { name })
      await load(true)
      addToast('success', 'Dispositivo renomeado')
    } catch {
      addToast('error', 'Erro ao renomear dispositivo')
    }
  }

  const moveWorkspace = async (id: string, workspaceId: string | null) => {
    try {
      await updateDevice(id, { workspace_id: workspaceId })
      await load(true)
      addToast('success', 'Workspace atualizado')
    } catch {
      addToast('error', 'Erro ao mover dispositivo')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteDevice(id)
      await load(true)
      addToast('success', 'Dispositivo removido')
    } catch {
      addToast('error', 'Erro ao remover dispositivo')
    }
  }

  return { devices, loading, refresh: load, rename, moveWorkspace, remove }
}
