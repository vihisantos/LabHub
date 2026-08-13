const WIPE_TOKEN = import.meta.env.VITE_WIPE_TOKEN as string | undefined

export function clearLocalData(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('labhub_')) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)

  if (typeof indexedDB !== 'undefined') {
    const req = indexedDB.deleteDatabase('labhub')
    req.onerror = () => console.warn('[Reset] Falha ao apagar IndexedDB', req.error)
  }
}

export async function wipeAllData(): Promise<void> {
  if (!WIPE_TOKEN) {
    throw new Error('VITE_WIPE_TOKEN não configurado no .env')
  }
  const resp = await fetch('/api/admin/wipe', {
    method: 'POST',
    headers: { 'X-Wipe-Token': WIPE_TOKEN },
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.error || `Falha ao apagar dados no servidor (HTTP ${resp.status})`)
  }
  clearLocalData()
}
