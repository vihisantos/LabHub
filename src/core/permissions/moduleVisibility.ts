import type { User } from '../auth/types'
import { membershipService } from '../memberships/service'
import { isAppDisabled } from '../workspaces/apps'
import type { Workspace } from '../workspaces/types'

/**
 * RBAC 2.0 (F2-D-K) — NOVA FONTE DE VERDADE PARA VISIBILIDADE DE MÓDULOS.
 *
 * ══ POR QUE ISTO EXISTE ══════════════════════════════════════════════════════
 * Até aqui a visibilidade vinha da cadeia legada `Role.appAccess` (coleção local
 * `roles`) + override `profiles.app_access` — origem que a auditoria F2-D-H
 * provou NÃO ser autoridade de segurança (nenhuma policy, função, RPC ou rota a
 * consultava) e que o F2-D-J provou já estar **desalinhada do RBAC 2.0**:
 *   · `opv` (6 Actions de TV) e `est` (9 Actions de estoque) não têm cargo
 *     correspondente no frontend — suas Actions dormem;
 *   · `adm` é convertido em `role-technician` no frontend, então enxerga módulos
 *     que o servidor não autoriza.
 *
 * A cadeia nova é a MESMA que a liderança já usa (`useLeadership`): membership
 * ativa → `role_id` → `public.roles.slug`. É a única fonte que o servidor
 * conhece, então não pode divergir dele.
 *
 * ══ O QUE ESTE MÓDULO NÃO FAZ ══════════════════════════════════════════════
 * Não é autorização. Nenhuma operação é liberada aqui:
 *   visibilidade .... membership ativa → roles.slug → esta matriz
 *   operação ....... role_permissions → Action → RLS / backend
 * Nenhuma Action `*.access`/`*.read` foi criada (decisão do F2-D-J §10: não há
 * necessidade documentada que as justifique) e nenhuma será criada aqui.
 *
 * ══ ESCOPO DEVIDO AOS CONSUMIDORES ══════════════════════════════════════════
 * Estes NÃO passam por aqui e não devem ser migrados para cá (têm mecanismo
 * próprio, já RBAC 2.0):
 *   · `/admin`      → `AdminGuard` (`user.is_super_admin`);
 *   · `/coordenador` → `LeadershipAreaGuard('coordination')` (membership ativa +
 *                      RPC `get_coordinator_units`, migration 047);
 *   · `/lider`      → `LeadershipAreaGuard('team')` (slug da membership ativa +
 *                      RPC `get_leader_team`, migrations 045/046);
 *   · `/pedir-musica`, `/roadmap`, `/chamados-publico/*`, TV Desktop → sem gate
 *     de app por design.
 *
 * ══ MIGRAÇÃO ════════════════════════════════════════════════════════════════
 * Os consumidores (`AppGuard`, `Launcher`, `CommandPalette`, `QuickActions`,
 * `ModuleStats`, `HomePage`, abas do Coordinator, `visibility.ts`,
 * `NotificationRulesTab`, Navbar/Layout/UpcomingPopup do ReservaLab) serão
 * migrados no F2-D-L. Aqui a fonte é criada, testada e deixada como fachada
 * pronta; `resolveAppAccess()` continua existindo e inalterado.
 */

/** Nível de visibilidade de um módulo. `none` = sem acesso. */
export type ModuleLevel = 'dash' | 'read' | 'full' | 'none'

/**
 * `AppAccessLevel` legado ('dash' | 'read' | 'full') + `null` de "sem acesso".
 * `none` é o `null` do legado — declarado separado para o F2-D-L poder
 * mapear sem ambiguidade quando `resolveAppAccess` sair.
 */
export type ModuleVisibility = {
  visible: boolean
  level: ModuleLevel
}

const NONE: ModuleVisibility = { visible: false, level: 'none' }
const FULL: ModuleVisibility = { visible: true, level: 'full' }

/**
 * Módulos do `appRegistry` (`src/appRegistry.ts`), que é a fonte de `appId` do
 * `AppGuard` e do Launcher. `dashboard` e `admin` entram aqui porque o
 * `AppGuard` os consulta — nenhum cargo os declara (ver a matriz), então
 * resolvem `none` para não-super-admin, exatamente como hoje.
 */
export const MODULE_IDS = [
  'dashboard',
  'pc-care',
  'stock',
  'reservalab',
  'tv',
  'chamados',
  'admin',
] as const

export type ModuleId = (typeof MODULE_IDS)[number]

/**
 * MATRIZ DE VISIBILIDADE — política de PRODUTO do RBAC 2.0, indexada pelo `slug`
 * canônico de `public.roles` (036/040/045) e resolvida pela MEMBERSHIP ATIVA.
 *
 * ── ESTA MATRIZ É DADO, NÃO AUTORIZAÇÃO ──────────────────────────────────────
 * Ela decide SÓ se o módulo aparece (AppGuard, Launcher, CommandPalette,
 * QuickActions, ModuleStats, NotificationRulesTab, abas do Coordinator).
 * Quem pode EXECUTAR cada operação é o `role_permissions` → Action, consultado
 * por `useCanAccessAction` na UI e por RLS/`@require_action` no servidor. Os dois
 * eixos são independentes por construção: `full` aqui NÃO abre nenhuma escrita
 * que a Action correspondente não permita, e nenhuma Action é concedida só para
 * que o módulo apareça. Regra estrutural mantida nesta matriz:
 *   · `dashboard` e `admin` não aparecem em nenhum cargo → só super admin entra
 *     (é o comportamento atual: nenhum `DEFAULT_ROLE` declara essas chaves);
 *   · `opv`, `est` e `adm` NÃO aparecem — ver `UNMAPPED_SLUGS` abaixo;
 *   · `lider` é o único cargo fora da regra "5 módulos": escopo de unidade, sem
 *     TV nem ReservaLab. Não é alvo desta tarefa e segue inalterado.
 *
 * ── REGRAS DE PRODUTO QUE ESTA MATRIZ EXPRESSA ───────────────────────────────
 *   · Técnico  → `full` nos 5 módulos disponíveis ao workspace.
 *   · Visualizador e Coordenador → `read` nos 5 módulos. `read` é VISIBILIDADE:
 *     quem tem `read` não ganha escrita. As Actions do papel são decididas em
 *     `role_permissions` e podem ser (e no caso do coordenador, são) mais
 *     amplas que `read` sem que a matriz deixe de ser `read`.
 *
 * ── `dash` NÃO É DECORATIVO ──────────────────────────────────────────────────
 * `'dash'` continua no tipo e nos consumidores (redirect em `ReservaLabLayout`
 * L15-20, filtro de abas no `Navbar` L28-30) porque é o valor que "vê só o
 * dashboard" significa, mas NENHUM cargo da matriz o declara hoje — `vis` e
 * `coordinator` passaram de `'dash'` para `'read'` em reservalab. `'read'` e
 * `'full'` também são distintos e ambos em uso: `UpcomingReservationPopup` só
 * consulta reservas com `full` (L22). Achatar em booleano quebraria essas telas.
 */
export const MODULE_VISIBILITY_BY_SLUG: Readonly<
  Record<string, Readonly<Partial<Record<ModuleId, ModuleLevel>>>>
> = {
  // Técnico: operação nos cinco módulos. `tv` e `reservalab` subiram para `full`.
  // A autorização correspondente é `tv.manage` (migration 086) e
  // `reservelab.tablet.reserve` + `reservelab.tablet.cancel` (036/078).
  tec: {
    'pc-care': 'full',
    stock: 'full',
    reservalab: 'full',
    tv: 'full',
    chamados: 'full',
  },
  // Visualizador: leitura nos cinco módulos. Nenhuma Action de mutação é
  // concedida a `vis` (036 + trava anti-escalada da 086).
  vis: {
    'pc-care': 'read',
    stock: 'read',
    reservalab: 'read',
    tv: 'read',
    chamados: 'read',
  },
  // Líder: sem TV nem ReservaLab; Chamados operacional. Inalterado.
  lider: { 'pc-care': 'read', stock: 'read', chamados: 'full' },
  // Coordenador: leitura nos cinco módulos. `chamados` BAIXOU de `full` para
  // `read` na visibilidade; as Actions de ticket do cargo (040/082) foram
  // PRESERVADAS — a matriz é visibilidade, não autorização, e remover
  // capacidade operacional do coordenador multiunidade é decisão de produto
  // própria. O escopo por unidade (uma membership por workspace) é o que
  // limita o coordenador, e ele não é tocado por esta matriz.
  coordinator: {
    'pc-care': 'read',
    stock: 'read',
    reservalab: 'read',
    tv: 'read',
    chamados: 'read',
  },
}

/**
 * Slugs RBAC 2.0 sem linha na matriz — e o que fazer com eles é a ÚNICA decisão
 * de produto que o F2-D-K encontrou e NÃO resolveu (ver relatório do F2-D-K):
 *
 *   · `opv` / `est` — têM Actions (`tv.*`, `stock.*`) mas nunca tiveram cargo no
 *     frontend. Resolvem `none`: coerente com "não têm cargo", porém significa
 *     que, ao migrar os consumidores no F2-D-L, elas passam a ver módulos que
 *     hoje já não veem (hoje: nenhum) e a NÃO ver os módulos das próprias Actions
 *     (hoje: também nenhum, porque o AppGuard já barra). Net: sem regressão
 *     visível, mas a incoerência permanece — a correção é o F2-D-O.
 *   · `adm` — hoje um usuário com `profiles.role='admin'` vira `role-technician`
 *     no frontend (LEGACY_ROLE_TO_ID) e enxerga os módulos de técnico, embora o
 *     servidor não lhe conceda Action alguma de pcare/stock/chamados. Com a
 *     matriz resolvendo pelo slug da membership, `adm` passa a `none`. Esta é uma
 *     DIFERENÇA REAL de comportamento em relação ao legado, e é o ponto que
 *     precisa de decisão antes do F2-D-L.
 *
 * Nada foi inventado para "corrigir" isso aqui (§15 do F2-D-K).
 */
export const UNMAPPED_SLUGS: readonly string[] = ['opv', 'est', 'adm']

/** Nível de um módulo para um slug. Slug desconhecido/sem cargo ⇒ `none` (fail-closed). */
export function moduleLevelForSlug(
  slug: string | null | undefined,
  appId: string,
): ModuleLevel {
  if (!slug) return 'none'
  const row = MODULE_VISIBILITY_BY_SLUG[slug]
  if (!row) return 'none'
  // Módulo fora do registry (ex.: um id novo, ou `chamados-dashboard`): sem
  // política declarada ⇒ `none`. `plannedApps` não entra no launcher nem tem
  // rota, então isso não afeta navegação.
  return row[appId as ModuleId] ?? 'none'
}

/**
 * Slug do cargo da MEMBERSHIP ATIVA do PRÓPRIO usuário na unidade
 * (`memberships.role_id` já vem pronto no `User`). Puro e síncrono — não
 * consulta o banco.
 *
 * Deliberadamente NÃO usa `profiles.role`/`user.roleId` (dados legados) nem
 * `workspace_ids`: pertencimento é sempre membership ativa (design 9.2 §3.2).
 * O dono da linha (`profile_id === user.id`) é obrigatório: a RLS
 * `memberships_select` é escopada por WORKSPACE, então `user.memberships` pode
 * trazer memberships de OUTROS membros da unidade — sem esse filtro a
 * visibilidade do módulo seria decidida pelo cargo de outra pessoa.
 * `membershipsLoaded !== true` ⇒ sem cargo conhecido, e o guard deve tratar
 * como pendente, não como "sem acesso".
 */
export function activeMembershipRoleId(
  user: User | null | undefined,
  workspaceId: string | null | undefined,
): string | null {
  if (!user || !workspaceId) return null
  if (user.membershipsLoaded !== true) return null
  const active = user.memberships?.find(
    (m) =>
      m.profile_id === user.id &&
      m.workspace_id === workspaceId &&
      m.status === 'active',
  )
  return active?.role_id ?? null
}

/** Slug estável do cargo, resolvido de `role_id` via `public.roles` (RLS `roles_select`). */
export async function resolveActiveSlug(
  user: User | null | undefined,
  workspaceId: string | null | undefined,
): Promise<string | null> {
  const roleId = activeMembershipRoleId(user, workspaceId)
  if (!roleId) return null
  try {
    return await membershipService.resolveRoleSlug(roleId)
  } catch {
    // Falha fechada: sem cargo conhecido, sem visibilidade.
    return null
  }
}

/**
 * Nível de visibilidade, sem I/O — para quando o slug já é conhecido (testes,
 * e o consumidor que já resolveu o slug para outro fim).
 *
 * Bypass de Super Admin preservado: `is_super_admin ⇒ 'full'`, exatamente como
 * `useAppAccess().getLevel()` (usePermissions.ts:67-68) e
 * `permissionService.canWriteApp()` (service.ts:125) fazem hoje.
 */
export function moduleLevelForMembership(params: {
  user: User | null | undefined
  workspaceId: string | null | undefined
  appId: string
  slug: string | null | undefined
}): ModuleLevel {
  if (!params.user) return 'none'
  if (params.user.is_super_admin) return 'full'
  return moduleLevelForSlug(params.slug, params.appId)
}

/**
 * FONTE DE VERDADE (async) da visibilidade de um módulo.
 *
 * Ordem conceitual, conforme o desenho do F2-D-K:
 *
 *   super admin ──yes──► 'full'
 *          │ não
 *          ▼
 *   membership ativa na unidade → role_id → roles.slug
 *          ▼
 *   matriz de visibilidade (MODULE_VISIBILITY_BY_SLUG)
 *          ▼
 *   workspace.disabled_apps  ──desabilitado──► 'none'
 *          ▼
 *      resultado final
 *
 * O eixo `disabled_apps` é por UNIDADE e vem por último: um módulo desligado
 * pela unidade não aparece, ainda que o usuário tenha `full`. Reaproveita
 * `isAppDisabled` (`core/workspaces/apps.ts`) — a mesma função do
 * `isModuleAvailable`, para que os dois eixos não se separem.
 *
 * `slug` é opcional: se o chamador já o tiver, evita a ida ao banco (e mantém
 * o núcleo testável sem mock). Super admin e `disabled_apps` são avaliados
 * ANTES do slug, então nem o super admin vê um app desligado na unidade.
 */
export async function resolveModuleVisibility(params: {
  user: User | null | undefined
  workspaceId: string | null | undefined
  appId: string
  slug?: string | null
  workspace?: Workspace | null
}): Promise<ModuleVisibility> {
  const { user, workspaceId, appId, workspace } = params
  if (!user) return NONE

  // Eixo 1 — módulo desligado na unidade (independe de cargo e de super admin).
  if (isAppDisabled(appId, workspace ?? null)) return NONE

  // Eixo 2 — bypass de plataforma.
  if (user.is_super_admin) return FULL

  const slug = params.slug !== undefined ? params.slug : await resolveActiveSlug(user, workspaceId)
  const level = moduleLevelForMembership({ user, workspaceId, appId, slug })
  if (level === 'none') return NONE
  return { visible: true, level }
}

/** Igual a `resolveModuleVisibility`, mas resolve o slug uma vez para vários módulos. */
export async function resolveModuleVisibilities(params: {
  user: User | null | undefined
  workspaceId: string | null | undefined
  appIds: readonly string[]
  workspace?: Workspace | null
}): Promise<Record<string, ModuleVisibility>> {
  const { user, workspaceId, appIds, workspace } = params
  const out: Record<string, ModuleVisibility> = {}
  if (!user) {
    for (const id of appIds) out[id] = NONE
    return out
  }
  if (user.is_super_admin) {
    for (const id of appIds) {
      out[id] = isAppDisabled(id, workspace ?? null) ? NONE : FULL
    }
    return out
  }
  const slug = await resolveActiveSlug(user, workspaceId)
  for (const id of appIds) {
    if (isAppDisabled(id, workspace ?? null)) {
      out[id] = NONE
      continue
    }
    const level = moduleLevelForSlug(slug, id)
    out[id] = level === 'none' ? NONE : { visible: true, level }
  }
  return out
}
