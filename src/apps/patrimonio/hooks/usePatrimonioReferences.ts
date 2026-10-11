import { useCallback, useEffect, useRef, useState } from 'react'
import {
  locationsRepository,
  responsiblesRepository,
  toPatrimonioError,
  type PatrimonioError,
  type PatrimonioLocation,
  type PatrimonioResponsible,
} from '../../../core/patrimonio'

export interface PatrimonioReferences {
  locations: PatrimonioLocation[]
  responsibles: PatrimonioResponsible[]
  loading: boolean
  error: PatrimonioError | null
  locationLabel: (id: string | null) => string | null
  responsibleLabel: (id: string | null) => string | null
  reload: () => void
}

/**
 * Diretórios de referência da unidade: locais e responsáveis.
 *
 * O bem guarda apenas `location_id`/`responsible_id`; os nomes legíveis vêm
 * destes dois repositórios. Uma carga resolve os mapas usados tanto pelos
 * filtros quanto pelos rótulos das listas/detalhe.
 */
export function usePatrimonioReferences(enabled: boolean): PatrimonioReferences {
  const [locations, setLocations] = useState<PatrimonioLocation[]>([])
  const [responsibles, setResponsibles] = useState<PatrimonioResponsible[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<PatrimonioError | null>(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!enabled) return
    const req = ++seq.current
    setLoading(true)
    try {
      const [locs, resps] = await Promise.all([
        locationsRepository.list(),
        responsiblesRepository.list(),
      ])
      if (req !== seq.current) return
      setLocations(locs)
      setResponsibles(resps)
      setError(null)
    } catch (err) {
      if (req !== seq.current) return
      setError(toPatrimonioError(err))
      setLocations([])
      setResponsibles([])
    } finally {
      if (req === seq.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setLocations([])
      setResponsibles([])
      setError(null)
      setLoading(false)
      return
    }
    void load()
  }, [enabled, load])

  const locationLabel = useCallback(
    (id: string | null) => (id ? locations.find((l) => l.id === id)?.nome ?? null : null),
    [locations],
  )
  const responsibleLabel = useCallback(
    (id: string | null) => (id ? responsibles.find((r) => r.id === id)?.nome ?? null : null),
    [responsibles],
  )

  return { locations, responsibles, loading, error, locationLabel, responsibleLabel, reload: load }
}
