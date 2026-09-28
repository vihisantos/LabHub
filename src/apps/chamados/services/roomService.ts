import type { Room } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<Room>('rooms')

/**
 * Leitura de salas (Chamados público + formulários).
 *
 * F2-D-N2: os métodos de escrita (`create`/`update`/`remove`) foram REMOVIDOS.
 * Eles guardavam escrita com `permissionService.requireWrite('chamados')`, um
 * gate local que decidia por `Role.appAccess` + `profiles.app_access` — cadeia
 * que o RBAC 2.0 substituiu por Action + RLS. O único caminho que os chamava
 * era o hook `useRooms`, que não tinha consumidor de produção.
 *
 * Não foram recriados como Action: a tabela `rooms` é LOCAL_ONLY
 * (lib/sync.ts) e nenhuma tela do produto edita salas. Deixar os métodos
 * existindo sem o gate seria pior — uma escrita sem nenhuma proteção.
 */
export const roomService = {
  getAll: () => service.getAll(),

  getAllUnfiltered: () => service.getAll(true),

  getById: (id: string) => service.getById(id),

  query: (predicate: (item: Room) => boolean) => service.query(predicate),
}
