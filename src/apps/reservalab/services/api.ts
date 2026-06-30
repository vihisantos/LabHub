const API_BASE = import.meta.env.VITE_RESERVALAB_API_URL || ''

import type { ReservasAPIResponse, HealthResponse } from '../types'

async function fetchAPI<T>(path: string): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export function fetchReservas(): Promise<ReservasAPIResponse> {
  return fetchAPI<ReservasAPIResponse>('/api/reservas')
}

export function fetchHealth(): Promise<HealthResponse> {
  return fetchAPI<HealthResponse>('/api/health')
}
