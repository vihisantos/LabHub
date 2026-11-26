// Decorative only: campus names never determine routing or permissions.
export type CampusArtworkKey = 'piracicaba'

export function campusArtworkKey(name?: string): CampusArtworkKey | undefined {
  const normalized = name?.trim().toLowerCase()
  return normalized === 'anhembi piracicaba' || normalized === 'piracicaba'
    ? 'piracicaba'
    : undefined
}

const storageKey = (ticketId: string) => `labhub:campus-artwork:${ticketId}`

// The public ticket projection does not expose its workspace. Keep this visual
// preference in the current tab, scoped to the newly created ticket.
export function rememberTicketCampus(ticketId: string, campus?: CampusArtworkKey): void {
  try {
    if (campus) sessionStorage.setItem(storageKey(ticketId), campus)
    else sessionStorage.removeItem(storageKey(ticketId))
  } catch {
    // Storage is optional; never interrupt ticket creation.
  }
}

export function readTicketCampus(ticketId: string): CampusArtworkKey | undefined {
  try {
    const value = sessionStorage.getItem(storageKey(ticketId))
    return value === 'piracicaba' ? value : undefined
  } catch {
    return undefined
  }
}
