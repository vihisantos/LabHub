import { useCallback, useEffect, useState } from 'react'
import type { HealthMetrics } from './types'
import { healthService } from './service'

export function useHealth() {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = healthService.getMetrics()
    setMetrics(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  return { metrics, loading, reload: load }
}
