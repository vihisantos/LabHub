import { useCallback, useEffect, useState } from 'react'

export interface PublicWorkspace {
  id: string
  name: string
}

/**
 * Lista os campi para o formulário público de chamados.
 *
 * Navegador sem login (role anon) não consegue ler `workspaces` direto no
 * Supabase (RLS bloqueia o SELECT), então este hook usa o endpoint público da
 * API (`/api/chamados/workspaces`), que roda com service role e foi criado
 * justamente para o formulário público. Ordenado por nome no servidor.
 *
 * Em caso de falha expõe `error` para a UI mostrar uma mensagem amigável e
 * `reload` para o usuário tentar de novo.
 */
export function usePublicWorkspaces() {
  const [workspaces, setWorkspaces] = useState<PublicWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/chamados/workspaces', {
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(body?.workspaces)) {
        setWorkspaces([])
        setError(true)
        return
      }
      setWorkspaces(body.workspaces as PublicWorkspace[])
    } catch {
      setWorkspaces([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { workspaces, loading, error, reload: load }
}
