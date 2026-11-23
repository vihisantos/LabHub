import { useEffect, useRef } from 'react'
import { defaultDb } from '../../../lib/supabase'

/**
 * Invalidação leve da fila por campus. Nunca recebe o registro do chamado:
 * a leitura de conteúdo continua exclusivamente via GET /api/chamados (JWT/RBAC).
 *
 * O banco publica apenas um sinal no canal privado. Sem token, permissão de
 * campus ou conexão, a tela continua com seu fallback de leitura periódica.
 */
export function useTicketInvalidationBroadcast(
  workspaceId: string | null,
  onInvalidate: () => void,
  onConnected: (connected: boolean) => void,
): void {
  const invalidateRef = useRef(onInvalidate)
  const connectedRef = useRef(onConnected)
  invalidateRef.current = onInvalidate
  connectedRef.current = onConnected

  useEffect(() => {
    const db = defaultDb
    if (!db || !workspaceId) {
      connectedRef.current(false)
      return
    }

    let active = true
    let channel: ReturnType<typeof db.channel> | null = null

    async function subscribe() {
      const { data } = await db!.auth.getSession()
      const token = data.session?.access_token
      if (!token || !active) {
        if (active) connectedRef.current(false)
        return
      }

      // Realtime Authorization avalia realtime.messages com o JWT do usuário.
      await db!.realtime.setAuth(token)
      if (!active) return

      channel = db!.channel(`labhub:chamados:workspace:${workspaceId}`, {
        config: { private: true },
      })
      channel
        .on('broadcast', { event: 'changed' }, () => {
          if (active) invalidateRef.current()
        })
        .subscribe((status) => {
          if (!active) return
          const connected = status === 'SUBSCRIBED'
          connectedRef.current(connected)
          // Cobrir alterações durante login/reconexão antes do canal estar pronto.
          if (connected) invalidateRef.current()
        })
    }

    void subscribe().catch(() => {
      if (active) connectedRef.current(false)
    })

    return () => {
      active = false
      connectedRef.current(false)
      if (channel) void db.removeChannel(channel)
    }
  }, [workspaceId])
}
