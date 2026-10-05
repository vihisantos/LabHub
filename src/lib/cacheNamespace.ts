import { authService } from '../core/auth/service'

/**
 * Chave de coleção namespaced por usuário (#344).
 *
 * O cache local do IndexedDB é um store key→valor sem `keyPath`: a chave é o
 * PRÓPRIO nome da coleção. Uma chave só, `chamados`, significava que a fila
 * operacional de um usuário era legível pelo próximo a logar no mesmo navegador.
 *
 * Com namespace, dois usuários distintos não compartilham chave — e, mais forte,
 * **não existe caminho de leitura que atravesse**: B resolve `chamados:B`, então
 * `getCol('chamados:B')` simplesmente não contém nada de A. A falha de rede de B
 * deixa B com o cache vazio DELE, e não com o de A.
 *
 * Por que `userId` e não outra coisa:
 *
 *   · não é `sessionId` — a sessão do Supabase é persistida
 *     (`persistSession: true`) e muda a cada refresh/F5; namespacear por ela
 *     destruiria o cache no refresh;
 *   · não é `workspace_id` — é fronteira de TENANT, não de pessoa. Dois usuários
 *     autorizados no mesmo workspace passam o filtro indistintivelmente, que
 *     era exatamente o furo;
 *   · não é o `workspace_id` do próprio registro — o registro é o que está
 *     sendo validado; usar o campo dele seria autoatestação;
 *   · não é `ticket.view` — Action do backend não sobrevive a uma falha de rede,
 *     e cache não é lugar para.authorização.
 *
 * O `userId` vem SEMPRE de `authService.getCurrentUser()`, que é o `sub` do JWT
 * validado. Não há parâmetro de identidade em nenhum ponto da API pública: um
 * chamador não consegue pedir o cache de outra pessoa porque a função não aceita
 * dizer de quem é o cache.
 *
 * Um usuário com `ticket.view` grava `chamados:<A>`. O registro foi autorizado
 * pelo backend quando foi gravado, e só o dono o lê. O backend continua sendo a
 * autoridade para tudo que é novo.
 *
 * ── A chave legada `chamados` ───────────────────────────────────────────────
 *
 * Instalações já usadas podem ter a chave antiga, gravada quando a coleção ainda
 * era compartilhada. **Ela não é adotada por ninguém.** Não existe como provar de
 * quem era: nada na linha registra o usuário que a gravou, e as hipóteses ("é do
 * usuário que está entrando", "é do dono do primeiro chamado") são exatamente o
 * tipo de inferência que produz o vazamento original.
 *
 * Então ela fica INERTE no IndexedDB — presente, sem leitor. É o comportamento
 * correto em rollout: a Vercel faz deploy gradual, e uma aba com o JS antigo ainda
 * lê `chamados`. Apagar a chave agora quebraria o offline dessa aba sem
 * necessidade. A remoção é trabalho de limpeza, com sua própria PR.
 *
 * Quem roda o código novo não tem caminho de leitura até ela, porque
 * `currentUserCollectionKey` sempre devolve `chamados:<userId>` — e
 * `isNamespacedKey` (em `db.ts`) distingue as duas formas sem ambiguidade.
 */

/**
 * Chave física de uma coleção para um usuário específico.
 *
 * Exportada para teste e para diagnóstico. NÃO chame em caminho de produção com
 * uma identidade que não seja a sessão — use `currentUserCollectionKey`.
 */
export function namespacedCollectionKey(collection: string, userId: string): string {
  return `${collection}:${userId}`
}

/**
 * Chave da coleção do usuário autenticado, ou `null` se não há sessão.
 *
 * `null` é fail-closed de propósito: sem sessão não há cache — nem leitura, nem
 * escrita. Um cache anônimo seria um cache compartilhado com outro nome.
 *
 * Este é o ÚNICO ponto do projeto que decide de quem é o cache. Tudo o mais
 * recebe a chave pronta daqui.
 */
export function currentUserCollectionKey(collection: string): string | null {
  const userId = authService.getCurrentUser()?.id
  if (!userId) return null
  return namespacedCollectionKey(collection, userId)
}

/** `true` quando há sessão e portanto um namespace de cache bem definido. */
export function hasCacheIdentity(): boolean {
  return currentUserCollectionKey('chamados') !== null
}
