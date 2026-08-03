import type { ReservasAPIResponse, HealthResponse } from '../types'

const API_BASE = import.meta.env.VITE_RESERVALAB_API_URL || ''

async function fetchAPI<T>(path: string): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export function fetchReservas(workspaceSlug?: string): Promise<ReservasAPIResponse> {
  const query = workspaceSlug ? `?workspace=${encodeURIComponent(workspaceSlug)}` : ''
  return fetchAPI<ReservasAPIResponse>(`/api/reservas${query}`)
}

export function fetchHealth(): Promise<HealthResponse> {
  return fetchAPI<HealthResponse>('/api/health')
}
