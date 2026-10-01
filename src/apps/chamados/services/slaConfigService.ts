import type { SlaConfig, TicketPriority } from '../types'
import { createSyncService } from '../../../lib/sync'
import { getCol } from '../../../lib/db'
import { DEFAULT_SLA_HOURS, TICKET_PRIORITIES } from '../types'
import { authService } from '../../../core/auth/service'
import { membershipService } from '../../../core/memberships/service'

const service = createSyncService<SlaConfig>('sla_configs')

/**
 * Action RBAC 2.0 que autoriza a ADMINISTRAÇÃO das configurações de Chamados
 * (hoje: SLA). Semeada em `tec`/`lider`/`coordinator` na migration 082 —
 * exatamente os cargos que tinham `chamados = full` em `DEFAULT_ROLES`
 * (types.ts), que é o que o `requireWrite('chamados')` legado consultava.
 */
const MANAGE_SETTINGS_ACTION = 'chamados.settings.manage'

/**
 * Config padrão EFÊMERA — nunca persistida.
 *
 * F2-D-G §8: uma LEITURA não pode criar configuração. `getFor`/`getHours`
 * devolvem este objeto quando a unidade ainda não tem SLA salvo, e o cálculo
 * continua idêntico porque `getSlaHours` (services/sla.ts:16-24) cai em
 * `DEFAULT_SLA_HOURS` quando não há config — ou seja, os prazos
 * near/overdue não mudam, só deixa de haver escrita silenciosa.
 */
function makeConfig(workspaceId: string): SlaConfig {
  const now = new Date().toISOString()
  return {
    id: workspaceId,
    workspace_id: workspaceId,
    hours: { ...DEFAULT_SLA_HOURS },
    createdAt: now,
    updatedAt: now,
  }
}

/** Config já persistida da unidade, ou `undefined`. NUNCA escreve. */
function findPersisted(workspaceId: string): SlaConfig | undefined {
  if (!workspaceId) return undefined
  return getCol<SlaConfig>('sla_configs').find((c) => c.workspace_id === workspaceId)
}

/**
 * RESOLUÇÃO (leitura, sem escrita).
 *
 * Antes esta função era `ensureConfig` e CRIAVA a config quando faltava — e
 * como `getFor`/`getHours` a chamavam, uma mera leitura abria espaço de escrita
 * sem nenhuma autorização. Agora uma leitura só lê: devolve a config
 * persistida ou o padrão efêmero. Criar é responsabilidade do `update`, que é
 * o caminho autorizado (Action + super admin).
 */
function resolveConfig(workspaceId: string): SlaConfig {
  if (!workspaceId) return makeConfig('__default__')
  return findPersisted(workspaceId) ?? makeConfig(workspaceId)
}

/** Normaliza e persiste. Só é chamado de `update`, depois do gate por Action. */
function persistHours(workspaceId: string, hours: Record<TicketPriority, number>): SlaConfig {
  const clean: Record<TicketPriority, number> = { ...DEFAULT_SLA_HOURS }
  for (const p of TICKET_PRIORITIES) {
    const value = hours[p]
    clean[p] = value !== undefined && Number.isFinite(value) ? Math.max(0, Math.round(value)) : DEFAULT_SLA_HOURS[p]
  }

  const existing = findPersisted(workspaceId)
  if (existing) {
    return service.update(existing.id, { hours: clean, updatedAt: new Date().toISOString() }) ?? existing
  }
  // Primeira configuração da unidade — criação no MESMO caminho autorizado.
  return service.create({ ...makeConfig(workspaceId), hours: clean })
}

export const slaConfigService = {
  /** Leitura. Não escreve (F2-D-G §8). */
  getFor(workspaceId: string): SlaConfig {
    return resolveConfig(workspaceId)
  },

  /** Leitura. Não escreve (F2-D-G §8). */
  getHours(workspaceId: string): Record<TicketPriority, number> {
    return { ...resolveConfig(workspaceId).hours }
  },

  /**
   * Leitura agregada por unidade. Só contém unidades que TÊM SLA salvo — antes
   * a lista crescia sozinha porque a leitura materializava defaults. Todo
   * consumidor já passa o resultado por `getSlaHours`, que usa
   * `DEFAULT_SLA_HOURS` no lugar de uma unidade ausente, então o cálculo de
   * prazo permanece igual.
   */
  getHoursForTickets(): Record<string, Record<TicketPriority, number>> {
    const map: Record<string, Record<TicketPriority, number>> = {}
    for (const config of getCol<SlaConfig>('sla_configs')) {
      const hours: Record<TicketPriority, number> = { ...DEFAULT_SLA_HOURS }
      for (const p of TICKET_PRIORITIES) {
        if (config.hours[p] !== undefined) hours[p] = config.hours[p]
      }
      map[config.workspace_id] = hours
    }
    return map
  },

  /**
   * ESCRITA — única operação que cria/persiste SLA, e a única autorizada.
   *
   * RBAC 2.0 (F2-D-G): a Action `chamados.settings.manage` substitui o
   * `requireWrite('chamados')`, que decidia por `Role.appAccess` /
   * `profiles.app_access`. A verificação usa `membershipService.can` — a MESMA
   * cadeia `memberships → role_permissions → Action` que o `useCanAccessAction`
   * da UI resolve e que `public.user_has_action` implementa no banco — em vez
   * de um gate novo (nenhum segundo motor de RBAC).
   *
   * O gate fica NO SERVICE (e não só na UI) porque o SLA é persistido numa
   * coleção LOCAL do dispositivo (`sla_configs` está em `LOCAL_ONLY_COLLECTIONS`,
   * lib/sync.ts:120-128): não existe tabela, rota Flask nem RLS para o banco
   * decidir. Ou seja, aqui a Autoridade é o próprio app — o que torna o gate
   * do service obrigatório, não redundante. Limitação real e conhecida: quem
   * tiver acesso ao aparelho e ao localStorage do navegador consegue alterar o
   * valor; a Action governa a OPERAÇÃO DA APLICAÇÃO, não o storage. Um backend
   * de configurações é a correção de raiz (fase futura).
   *
   * `workspaceId` é o alvo da verificação — a membership é resolvida NAQUELA
   * unidade, então uma Action da unidade A não autoriza a unidade B, e
   * membership inativa/inexistente nega (fail-closed em `membershipService.can`).
   */
  async update(workspaceId: string, hours: Record<TicketPriority, number>): Promise<SlaConfig> {
    const user = authService.getCurrentUser()
    const allowed = await membershipService.can(user, MANAGE_SETTINGS_ACTION, workspaceId)
    if (!allowed) {
      throw new Error('Permissão insuficiente: seu acesso não permite gerenciar as configurações de Chamados.')
    }
    if (!workspaceId) {
      throw new Error('Selecione uma unidade para configurar o SLA.')
    }
    return persistHours(workspaceId, hours)
  },
}
