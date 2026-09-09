/**
 * RBAC 2.0 — Fase 9.2: fonte de leitura única de memberships no frontend.
 *
 * Reaproveita `Membership`/`MembershipStatus` (espelho da tabela `public.memberships`,
 * migration 036) e expõe `UserMembership` + `isActive`.
 *
 * Semântica de carregamento explícita (design 9.2, seção 3.3):
 *   - `membershipsLoaded === true` ⇒ `memberships` é SEMPRE um array (pode ser `[]`);
 *   - `membershipsLoaded !== true` (incluindo `undefined`, query pendente/falhou)
 *     ⇒ NENHUMA decisão de visibilidade/escopo é tomada; `undefined` nunca vira `[]`
 *     nem cai em fallback de `profiles.workspace_ids` (coluna é compat de dados, nunca
 *     decide acesso).
 */
export type { Membership, MembershipStatus, UserMembership } from '../permissions/membership'
export { isActive } from '../permissions/membership'