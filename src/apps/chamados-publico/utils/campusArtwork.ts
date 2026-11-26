// Decorative only: campus names never determine routing or permissions.
export type CampusArtworkKey = 'piracicaba' | 'mooca' | 'sjc'

export function campusArtworkKey(name?: string): CampusArtworkKey | undefined {
  switch (name?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
    case 'anhembi piracicaba':
    case 'piracicaba':
      return 'piracicaba'
    case 'anhembi mooca':
    case 'mooca':
      return 'mooca'
    case 'anhembi sao jose':
    case 'anhembi sao jose dos campos':
    case 'sao jose':
    case 'sao jose dos campos':
    case 'sjc':
      return 'sjc'
    default:
      return undefined
  }
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
    return value === 'piracicaba' || value === 'mooca' || value === 'sjc' ? value : undefined
  } catch {
    return undefined
  }
}
