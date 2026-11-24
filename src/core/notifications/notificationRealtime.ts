import { defaultDb } from '../../lib/supabase'

/** One receive-only private topic per authenticated account, never notification data. */
export function subscribeNotificationInvalidation(
  userId: string,
  onChanged: () => void,
  onConnected: (connected: boolean) => void,
): () => void {
  const db = defaultDb
  if (!db) return () => {}
  let active = true
  let channel: ReturnType<typeof db.channel> | null = null

  async function connect() {
    const { data, error } = await db!.auth.getSession()
    if (!active || error || data.session?.user.id !== userId || !data.session.access_token) return
    // The shared client follows auth token refreshes. setAuth() resolves its
    // current token rather than pinning an earlier session's token.
    await db!.realtime.setAuth()
    if (!active) return
    channel = db!.channel(`labhub:notifications:user:${userId}`, {
      config: { private: true },
    })
    channel.on('broadcast', { event: 'changed' }, () => {
      if (active) onChanged()
    }).subscribe(status => {
      if (!active) return
      onConnected(status === 'SUBSCRIBED')
    })
  }
  void connect().catch(() => { if (active) onConnected(false) })
  return () => {
    active = false
    if (channel) void db.removeChannel(channel)
  }
}
