import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../workspaces/WorkspaceContext'
import { isAppDisabled } from '../workspaces/apps'
import {
  resolveActiveSlug,
  moduleLevelForSlug,
  moduleLevelForMembership,
  type ModuleLevel,
} from './moduleVisibility'

/**
 * RBAC 2.0 (F2-D-K) — hooks da visibilidade de módulos resolvida por
 * `membership ativa → public.roles.slug → matriz` (F2-D-J/L).
 *
 * Pareados com `useLeadership`:
 *   · FAIL-CLOSED enquanto carrega — `'none'` + `loading: true`; o gate não abre
 *     por omissão;
 *   · `membershipsLoaded !== true` é PENDENTE, não "sem acesso";
 *   · super admin não depende do banco (`full` antes de qualquer consulta);
 *   · trocar de usuário/unidade/módulo invalida o slug guardado na mesma
 *     renderização (chave `user|workspace|appId`), nunca exibindo o nível da
 *     unidade anterior.
 *
 * ── `ignoreDisabledApps` ─────────────────────────────────────────────────────
 * O eixo `workspace.disabled_apps` é aplicado por DEFAULT, como em
 * `isModuleAvailable`. Mas alguns consumidores legados NÃO o usavam (o
 * `AppGuard` trata desabilitado em tela própria; `HomePage` e as abas do
 * Coordinator chamavam `canAccessApp` puro). Para ser uma migração de FONTE e
 * não de política, cada consumidor declara o que já fazia:
 *   · default (ambos os eixos) — Launcher, QuickActions, ModuleStats,
 *     CommandPalette (todos usavam `isModuleAvailable`/`filterAppsByWorkspace`);
 *   · `ignoreDisabledApps: true` — AppGuard, HomePage, abas do Coordinator,
 *     `visibility.ts`, NotificationRulesTab, ReservaLab (usavam `canAccessApp`
 *     ou `getLevel` puros).
 */

/** Slug do cargo da membership ativa da unidade corrente + estado de pendência. */
function useActiveSlug(appKey: string): { slug: string | null; loading: boolean } {
  const { user, loading: authLoading } = useAuth()
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id ?? null

  const resolveKey = `${user?.id ?? ''}|${workspaceId ?? ''}|${appKey}`
  const [settled, setSettled] = useState<{ key: string; slug: string | null } | null>(null)

  const resolve = useCallback(async () => {
    const key = `${user?.id ?? ''}|${workspaceId ?? ''}|${appKey}`
    if (!user || !workspaceId) {
      setSettled({ key, slug: null })
      return
    }
    if (user.membershipsLoaded !== true) return
    const slug = await resolveActiveSlug(user, workspaceId)
    setSettled({ key, slug })
  }, [user, workspaceId, appKey])

  useEffect(() => {
    if (authLoading) return
    void resolve()
  }, [authLoading, resolve])

  const pending = settled?.key !== resolveKey
  return { slug: pending ? null : settled!.slug, loading: authLoading || pending }
}

export type ModuleLevelOptions = { ignoreDisabledApps?: boolean }

/**
 * Nível de visibilidade de UM módulo.
 *
 * `level` é `'none'` enquanto pendente e para quem não tem acesso; `visible` é
 * conveniência (`level !== 'none'`). Quem precisar de `'full'`/`'read'`/`'dash'`
 * compara o nível — não existe achatar em booleano (o ReservaLab depende dos três).
 */
export function useModuleLevel(
  appId: string,
  options?: ModuleLevelOptions,
): { level: ModuleLevel; visible: boolean; loading: boolean } {
  const { user, loading: authLoading } = useAuth()
  const { workspace } = useWorkspace()
  const ignoreDisabled = options?.ignoreDisabledApps === true
  const { slug, loading } = useActiveSlug(appId)
  const workspaceId = workspace?.id ?? null

  if (authLoading || loading) return { level: 'none', visible: false, loading: true }

  // Eixo por unidade: um módulo desligado não aparece (nem para super admin).
  if (!ignoreDisabled && isAppDisabled(appId, workspace ?? null)) {
    return { level: 'none', visible: false, loading: false }
  }

  const level = moduleLevelForMembership({ user, workspaceId, appId, slug })
  return { level, visible: level !== 'none', loading: false }
}

/**
 * Níveis de visibilidade de VÁRIOS módulos com UMA resolução de cargo.
 *
 * Para os consumidores que iteram o registry (`Launcher`, `ModuleStats`,
 * `CommandPalette`, `QuickActions`): sem isso seriam N consultas a
 * `public.roles` por render.
 *
 * `levelOf(appId)` devolve `'none'` para ids fora do registry — o mesmo
 * resultado de `canAccessApp(undefined)` no legado (comando sem módulo
 * mapeado não aparece), exceto para super admin, que no legado também via
 * `getLevel` antes de consultar o cargo.
 */
export function useModuleVisibilities(
  appIds: readonly string[],
  options?: ModuleLevelOptions,
): {
  levelOf: (appId: string | undefined) => ModuleLevel
  isVisible: (appId: string | undefined) => boolean
  loading: boolean
} {
  const { user, loading: authLoading } = useAuth()
  const { workspace } = useWorkspace()
  const ignoreDisabled = options?.ignoreDisabledApps === true
  // Chave estável: evita refetch quando o chamador passa um array literal.
  const appKey = appIds.join(',')
  const { slug, loading } = useActiveSlug(appKey)

  const levelOf = (appId: string | undefined): ModuleLevel => {
    if (authLoading || loading) return 'none'
    if (!appId) return 'none'
    if (!ignoreDisabled && isAppDisabled(appId, workspace ?? null)) return 'none'
    if (user?.is_super_admin) return 'full'
    return moduleLevelForSlug(slug, appId)
  }

  return {
    levelOf,
    isVisible: (appId) => levelOf(appId) !== 'none',
    loading: authLoading || loading,
  }
}
