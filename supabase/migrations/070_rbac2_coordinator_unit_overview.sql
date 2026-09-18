-- =============================================================================
-- 070_rbac2_coordinator_unit_overview.sql
-- =============================================================================
-- CENTRAL DO COORDENADOR — FASE 1: leitura agregada (READ-ONLY) da unidade de
-- chamados sob coordenação ativa do chamador.
--
-- O que esta migration faz (e somente isso):
--   - Cria UMA RPC nova, `get_coordinator_unit_overview(p_workspace_id)`, que
--     devolve um jsonb com o nome da unidade, os totais de chamados ativos
--     (open / in_progress / unassigned / high_priority / urgent) e os 5
--     chamados mais recentes da unidade.
--   - A autorização é a MESMA das RPCs de coordenação existentes (065): o
--     predicado `is_coordinator_of` (047) — membership ATIVA com cargo
--     `coordinator` na unidade. Sem coordenação ativa (ou sem sessão), a RPC
--     NEGA explicitamente (RAISE, fail-closed) — nunca devolve zeros falsos.
--   - O domínio expõe somente `chamados_tickets` (o domínio coberto por
--     `ticket.view` da classe `ticket` no RBAC; 040). Nenhum dado de outra
--     aplicação é tocado.
--
-- O que esta migration NÃO faz:
--   - Não cria permissão, ação, papel, policy ou RLS nova. É leitura pura do
--     mesmo escopo de coordenação já existente.
--   - Não altera tabelas, índices, triggers, auditoria, `profiles`,
--     `auth.users`, `is_super_admin` nem as demais RPCs (047/065/066/068/069).
--   - Não implementa chamado: NÃO há `ticket.claim`, alteração de status,
--     criação de chamado nem escrita em `chamados_tickets`.
--   - Não substitui o app de chamados: a visão da unidade é um resumo que
--     aponta para o app existente; o fluxo completo continua lá.
--
-- Semântica dos totais (espelha a definição do app de chamados):
--   - ativos      = status IN ('aberto','a_caminho','em_atendimento') E
--                   archived = false (equivalente a isTicketOpen do app);
--   - open        = status = 'aberto';
--   - in_progress = status IN ('a_caminho','em_atendimento');
--   - unassigned  = ativo E btrim(coalesce("assignedToUserId",'')) = '';
--   - high_priority = ativo E priority = 'alta';
--   - urgent      = ativo E priority = 'urgente';
--   - recent      = os 5 chamados mais recentes por "updatedAt" (empatados por
--                   "createdAt"), excluindo archivados. Para exibição — não é
--                   usado para nenhum número.
--
-- O chamado de status 'resolvido' não conta como ativo (o atendimento foi
-- concluído); 'fechado' normalmente vem acompanhado de archived = true.
--
-- Autorização: RAISE ERRCODE '42501' (insufficient_privilege) quando o
-- chamador não coordena ativamente a unidade. A UI pode distinguir "negado"
-- de "unidade vazia" (que devolve zeros honestos).
--
-- IDEMPOTENCIA: unico `CREATE OR REPLACE FUNCTION` + ACL REVOKE/GRANT
-- idempotentes. Replay seguro pelo runner. SECURITY DEFINER com
-- search_path = public. Nenhuma assinatura é alterada (função nova).
--
-- Requer 047 (is_coordinator_of) e 065 aplicadas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_coordinator_unit_overview(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws     jsonb;
  v_counts jsonb;
  v_recent jsonb;
BEGIN
  -- Fail-closed: sem sessão OU sem membership ATIVA de coordenação na unidade
  -- (predicado 047), a RPC NEGA explicitamente. Nunca devolve zeros falsos.
  IF NOT public.is_coordinator_of(p_workspace_id) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can view its overview'
      USING ERRCODE = '42501';
  END IF;

  -- Nome da unidade para exibição. Se a unidade não existir (ou a RLS ocultar),
  -- a estrutura é devolvida com name = null — nunca inventa.
  SELECT jsonb_build_object('id', w.id, 'name', w.name)
    INTO v_ws
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;

  IF v_ws IS NULL THEN
    v_ws := jsonb_build_object('id', p_workspace_id, 'name', null);
  END IF;

  -- Totais de chamados ATIVOS da unidade (status aberto/a_caminho/em_atendimento
  -- e archived = false). Um erro de consulta NUNCA vira zero silencioso: se a
  -- query falhar, a exceção propaga para o chamador (o frontend reapresenta o
  -- erro com "tentar de novo").
  SELECT jsonb_build_object(
    'open',           count(*) FILTER (WHERE t.status = 'aberto'),
    'in_progress',    count(*) FILTER (WHERE t.status IN ('a_caminho', 'em_atendimento')),
    'unassigned',     count(*) FILTER (
                        WHERE t.status IN ('a_caminho', 'em_atendimento', 'aberto')
                          AND btrim(coalesce(t."assignedToUserId", '')) = ''
                      ),
    'high_priority',  count(*) FILTER (
                        WHERE t.status IN ('a_caminho', 'em_atendimento', 'aberto')
                          AND t.priority = 'alta'
                      ),
    'urgent',         count(*) FILTER (
                        WHERE t.status IN ('a_caminho', 'em_atendimento', 'aberto')
                          AND t.priority = 'urgente'
                      )
  )
  INTO v_counts
  FROM public.chamados_tickets t
  WHERE t.workspace_id = p_workspace_id
    AND t.archived = false;

  -- Chamados mais recentes da unidade (exibição). Não alimenta números.
  SELECT coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
    INTO v_recent
  FROM (
    SELECT t.id,
           t."ticketNumber",
           t."roomName",
           t."problemCategory",
           t.status,
           t.priority,
           t."assignedToUserId",
           t."createdAt",
           t."updatedAt"
    FROM public.chamados_tickets t
    WHERE t.workspace_id = p_workspace_id
      AND t.archived = false
    ORDER BY t."updatedAt" DESC NULLS LAST, t."createdAt" DESC
    LIMIT 5
  ) r;

  RETURN jsonb_build_object(
    'workspace', v_ws,
    'tickets',   v_counts,
    'recent',    v_recent
  );
END;
$$;

COMMENT ON FUNCTION public.get_coordinator_unit_overview(uuid) IS
  'CENTRAL DO COORDENADOR (070): leitura READ-ONLY da unidade de chamados — nome da unidade, totais de chamados ativos (open/in_progress/unassigned/high_priority/urgent) e os 5 chamados mais recentes. Autorização = is_coordinator_of (047): membership ativa com cargo coordinator na unidade. Negação é explícita (RAISE 42501), nunca zeros falsos. Nenhuma permissão/policy/RLS nova; o domínio é apenas chamados_tickets (ticket.view). Não altera chamados.';

-- ACL: revoga de PUBLIC/anon (padrão das RPCs de coordenação) e libera apenas
-- para authenticated. `is_coordinator_of` decide o acesso por sessão.
REVOKE ALL ON FUNCTION public.get_coordinator_unit_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coordinator_unit_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coordinator_unit_overview(uuid) TO authenticated;