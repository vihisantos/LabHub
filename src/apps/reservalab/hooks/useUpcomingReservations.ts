import { useEffect, useState } from 'react'
import { fetchReservas } from '../services/api'
import { fetchTabletReservas } from '../services/supabase'
import type { LabReservationLike } from '../utils/upcomingReservation'
import type { ReservasAPIResponse, TabletReserva } from '../types'

function collectTodayLabs(res: ReservasAPIResponse | null): LabReservationLike[] {
  if (!res) return []
  const map = res.lab_reservas && Object.keys(res.lab_reservas).length
    ? res.lab_reservas
    : { LAB01: res.lab1_reservas, LAB02: res.lab2_reservas }

  return Object.entries(map).flatMap(([lab, reservas]) =>
    (reservas || []).map((r) => ({
      label: `Lab ${String(lab.replace(/\D/g, '')).padStart(2, '0')}`,
      horario: String(r.horario ?? ''),
      responsavel: r.responsavel,
    })),
  )
}

/**
 * Reservas de hoje (lab + tablet) do campus, com polling leve, para os avisos
 * de "reserva chegando". Passe workspace undefined para não buscar.
 */
export function useUpcomingReservations(workspaceSlug?: string, workspaceId?: string) {
  const [labReservas, setLabReservas] = useState<LabReservationLike[]>([])
  const [tabletReservas, setTabletReservas] = useState<TabletReserva[]>([])

  useEffect(() => {
    if (!workspaceSlug && !workspaceId) return
    let mounted = true

    const load = async () => {
      try {
        const [res, tablets] = await Promise.all([
          fetchReservas(workspaceSlug).catch(() => null),
          fetchTabletReservas(new Date(), new Date(Date.now() + 86400000), workspaceId)
            .catch(() => [] as TabletReserva[]),
        ])
        if (!mounted) return
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        const amanha = new Date(hoje)
        amanha.setDate(amanha.getDate() + 1)
        setLabReservas(collectTodayLabs(res))
        setTabletReservas(
          tablets.filter((r) => {
            const d = new Date(r.horario_inicio)
            return d >= hoje && d < amanha
          }),
        )
      } catch {
        /* silencioso: aviso é complementar */
      }
    }

    load()
    const timer = setInterval(load, 60000)
    return () => { mounted = false; clearInterval(timer) }
  }, [workspaceSlug, workspaceId])

  return { labReservas, tabletReservas }
}
