-- =============================================================================
-- 038: Chamados — Action `ticket.claim` + Ownership de Atendimento
-- =============================================================================
-- OBJETIVO:
--   Preparar o RBAC 2.0 para o novo fluxo de atribuição de chamados:
--
--   Técnico comum:
--     - Pode COMEÇAR ATENDIMENTO (assumir o chamado para si)          → ticket.claim
--     - NÃO pode escolher/atribuir outro técnico                      → NÃO tem ticket.assign
--
--   Líder / Admin de workspace:
--     - Pode atribuir, reatribuir e remover responsável              → ticket.assign
--
-- O que mudou no RBAC seed (em cima da migration 036):
--   1. Adiciona a Action `ticket.claim` (workspace) ao perfil Técnico (`tec`).
--   2. Remove a Action `ticket.assign` (workspace) do perfil Técnico (`tec`).
--      O `ticket.assign` passa a ser exclusivo de quem administra o workspace
--      (líder via override/role / super admin). Nenhum perfil de sistema atual
--      além de `tec` recebia `ticket.assign`, então a remoção fecha a brecha
--      do técnico comum poder atribuir a outro técnico.
--
-- O *enforcement de ownership* (bloquear técnico de operar chamado de outro,
-- claim atômico) é feito no backend (api/app.py) e NÃO depende desta migração:
-- ele vale com RBAC_2_ENABLED=0 e =1. Esta migração só registra, no catálogo
-- RBAC 2.0, a nova Action e o fechamento da Action de atribuição para o técnico.
--
-- COMPATIBILIDADE / SEGURANÇA:
--   - Idempotente: INSERT ... ON CONFLICT DO NOTHING; DELETE ... que afeta
--     apenas o perfil `tec` de sistema (blueprint global workspace_id IS NULL).
--   - Não cria tabelas novas. Não apaga dados de produção.
--   - Não altera o catálogo documental; reflect o ADR de separação
--     claim/assign decidido para o fluxo de Chamados.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_tec uuid;
BEGIN
  SELECT id INTO v_tec FROM public.roles WHERE slug = 'tec' AND is_system = true;

  IF v_tec IS NULL THEN
    RAISE NOTICE 'rbac ticket.claim: perfil tec nao encontrado; nada a fazer';
    RETURN;
  END IF;

  -- 1. Técnico passa a ter `ticket.claim` (assumir chamado para si).
  INSERT INTO public.role_permissions (role_id, action, scope)
  VALUES (v_tec, 'ticket.claim', 'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- 2. Técnico PERDE `ticket.assign` (não pode atribuir/reatribuir a outro).
  DELETE FROM public.role_permissions
  WHERE role_id = v_tec
    AND action = 'ticket.assign'
    AND scope = 'workspace';
END $$;

COMMIT;
