import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import {
  resolveActiveSlug,
  moduleLevelForMembership,
  type ModuleLevel,
} from './moduleVisibility'

/**
 * RBAC 2.0 (F2-D-K) — `useModuleLevel(appId)`: o NÍVEL de visibilidade de um
 * módulo resolvido por `membership ativa → public.roles.slug → matriz`.
 *
 * É o par React de `moduleVisibility.ts`, no mesmo formato de `useLeadership`:
 *
 *   · FAIL-CLOSED enquanto carrega — devolve `'none'` e `loading: true`. Um gate
 *     de UI não abre por omissão, e o consumidor pode mostrar loader em vez de
 *     "acesso restrito" (é o que `pcare/Settings.tsx` faz com `pcare.data.clear`).
 *   · `membershipsLoaded !== true` é PENDENTE, não "sem acesso": o slug fica
 *     `null` e `loading` segue `true`, então não nega por falta de informação.
 *   · O super admin não depende do banco: `moduleLevelForMembership` devolve
 *     `full` antes de qualquer consulta.
 *   · Trocar de usuário OU de unidade invalida o slug guardado na mesma
 *     renderização (mesma chave `user|workspace` de `useLeadership`), para não
 *     exibir o nível da unidade anterior enquanto a nova consulta corre.
 *
 * `visible` é só conveniência (`level !== 'none'`); quem precisar do nível
 * compara com `'full'`/`'read'`/`'dash'`.
 */
export function useModuleLevel(appId: string): {
  level: ModuleLevel
  visible: boolean
  loading: boolean
} {
  const { user, loading: authLoading } = useAuth()
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id ?? null

  const resolveKey = `${user?.id ?? ''}|${workspaceId ?? ''}|${appId}`
  const [settled, setSettled] = useState<{
    key: string
    slug: string | null
  } | null>(null)

  const resolve = useCallback(async () => {
    const key = `${user?.id ?? ''}|${workspaceId ?? ''}|${appId}`
    if (!user || !workspaceId) {
      setSettled({ key, slug: null })
      return
    }
    if (user.membershipsLoaded !== true) return
    const slug = await resolveActiveSlug(user, workspaceId)
    setSettled({ key, slug })
  }, [user, workspaceId, appId])

  useEffect(() => {
    if (authLoading) return
    void resolve()
  }, [authLoading, resolve])

  // Enquanto o slug guardado não é da identidade corrente, descarta (fail-closed).
  const pending = settled?.key !== resolveKey
  const slug = pending ? null : settled!.slug
  const loading = authLoading || pending

  if (loading) return { level: 'none', visible: false, loading: true }

  const level = moduleLevelForMembership({ user, workspaceId, appId, slug })
  return { level, visible: level !== 'none', loading: false }
}
