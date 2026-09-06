-- =============================================================================
-- 041_rbac2_sync_memberships.sql
-- =============================================================================
-- RBAC 2.0 — SINCRONIZAÇÃO CONTÍNUA `memberships` ⇐ `profiles` (fonte da
-- verdade determinística: status + role + workspace_ids + is_super_admin).
--
-- Contexto:
--   O schéma RBAC 2.0 (036) define membros via `memberships`
--   (profile × workspace × role) E o motor de enforcement
--   (`src/apps/reservalab/api/rbac.py`) resolve Actions por contribuição de
--   membership ATIVA (status = 'active'). Porém a APROVAÇÃO/EDIÇÃO de
--   usuários grava APENAS `profiles` — via `adminService.approveUser`
--   (frontend, super admin + RLS) e via `POST /api/push/action` (backend,
--   service_role → PATCH profiles) — e NENHUM desses caminhos insere em
--   `memberships`. Consequência real: usuário novo aprovado (role + workspaces
--   no profile) fica SEM memberships e o motor RBAC nega tudo (fail-closed),
--   travando o fluxo de entrada no app mesmo com a vaga de espera liberada.
--
-- Esta migration adiciona um TRIGGER (nova migration, compatível com o
-- runner) que mantém `memberships` sempre em sincronia com `profiles`,
-- cobrindo os dois caminhos de aprovação de uma vez. O mapeamento
-- determinístico role→slug reaproveita o mesmo da 036/040:
--   'technician'|'role-technician'     → 'tec'   (Técnico)
--   'viewer'|'role-viewer'             → 'vis'   (Visualizador)
--   'admin'|'role-admin'               → 'adm'   (Admin de Workspace)
--   'coordinator'|'role-coordinator'   → 'coordinator' (Coordenador Multiunidade)
--
-- Regras (espelho da spec §8 e §10):
--   - status <> 'active'        → sem memberships (exclui pendentes/inativos).
--   - is_super_admin true       → sem memberships (Super Admin NÃO é cargo;
--                                 bypass global no motor).
--   - role desconhecida/null    → sem memberships (determinístico).
--   - workspace_ids vazio       → sem memberships (CASO 3: usuário aprovado
--                                 sem workspace = estado seguro/bloqueado).
--   - workspace nao existente   → ignorado (FK garantiria; aqui evitamos
--                                 aborto da trigger).
--   - membership_overrides      → preservados: ao DELETAR a membership a FK
--                                 (ON DELETE CASCADE) remove os overrides —
--                                 comportamento esperado e documentado (fonte
--                                 da verdade = profiles).
--
-- IDEMPOTÊNCIA/TÉCNICA:
--   - FUNCTION SECURITY DEFINER SET search_path = public (mesmo padrão de
--     handle_new_user()); RLS de memberships é write-only super admin, então
--     a trigger (owner da migration = postgres) precisa ignorar RLS para o
--     fluxo real, sem abrir porta ao anon.
--   - Trigger + função re-criáveis (DROP IF EXISTS). Reconcile inicial roda
--     o mesmo algoritmo para todas as profiles existentes (repara qualquer
--     drift acumulado pós-036/040).
--   - REVOKE de EXECUTE de PUBLIC/anon e GRANT a authenticated (lição da
--     039/040): a trigger roda sob o usuário autenticado que faz o UPDATE —
--     sem EXECUTE para authenticated a trigger não dispararia.
--   - Nenhuma tabela linha de migrations anteriores é alterada (apenas
--     INSERT/UPDATE/DELETE orquestrados em memberships).

-- =============================================================================
-- 1. Função de sincronização (idempotente)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_user_memberships(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_raw    text;
  v_role_slug   text;
  v_is_super    boolean;
  v_status      text;
  v_ws          uuid[];
BEGIN
  SELECT role, is_super_admin, status, COALESCE(workspace_ids, ARRAY[]::uuid[])
  INTO v_role_raw, v_is_super, v_status, v_ws
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Mapeamento determinístico (legado + formato roleId), mesmo da 036/040.
  -- CASE pesquisado: CASE simples não aceita lista de valores por WHEN
  -- ("WHEN 'a', 'b'" => syntax error at or near ",").
  v_role_slug := CASE
    WHEN v_role_raw IN ('technician', 'role-technician')   THEN 'tec'
    WHEN v_role_raw IN ('viewer', 'role-viewer')           THEN 'vis'
    WHEN v_role_raw IN ('admin', 'role-admin')             THEN 'adm'
    WHEN v_role_raw IN ('coordinator', 'role-coordinator') THEN 'coordinator'
    ELSE NULL
  END;

  -- Remove memberships fora do conjunto-alvo (entra quando o usuário é
  -- suspenso/inativo, vira super admin, tem role desconhecida ou perde o
  -- acesso ao workspace).
  DELETE FROM public.memberships m
  WHERE m.profile_id = p_profile_id
    AND NOT (
      v_status = 'active'
      AND NOT v_is_super
      AND v_role_slug IS NOT NULL
      AND m.workspace_id = ANY (v_ws)
    );

  -- (Re)cria / ajusta memberships do conjunto-alvo: active × não-super ×
  -- role conhecida × workspaces atribuídos.
  IF v_status = 'active' AND NOT v_is_super AND v_role_slug IS NOT NULL
     AND array_length(v_ws, 1) IS NOT NULL THEN
    INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
    SELECT p_profile_id, ws, r.id, 'active'
    FROM unnest(v_ws) AS ws
    JOIN public.roles r ON r.slug = v_role_slug
    WHERE EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = ws)
    ON CONFLICT (profile_id, workspace_id) DO UPDATE SET
      role_id     = EXCLUDED.role_id,
      status      = 'active',
      updated_at  = now();
  END IF;
END $$;

-- =============================================================================
-- 2. Trigger — depois de INSERT ou UPDATE de (status, role, workspace_ids,
--    is_super_admin) em profiles.
--
--    Argumentos de CREATE TRIGGER aceitam apenas literais, identifiers ou
--    números — NÃO expressões como NEW.id (Postgres: syntax error at or
--    near "."). Por isso a trigger dispara um wrapper RETURNS trigger que
--    lê NEW.id e delega para a função parametrizada
--    sync_user_memberships(uuid) — a mesma usada pelo reconcile inicial
--    (seção 4).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_sync_user_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_user_memberships(NEW.id);
  RETURN NULL; -- AFTER ROW trigger: valor de retorno é ignorado
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_memberships ON public.profiles;
CREATE TRIGGER trg_profiles_sync_memberships
  AFTER INSERT OR UPDATE OF status, role, workspace_ids, is_super_admin
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_user_memberships();

-- =============================================================================
-- 3. Permissões — a trigger roda no contexto do usuário que executou o DML,
--    então authenticated precisa de EXECUTE; anon/PUBLIC não podem invocar.
-- =============================================================================

REVOKE ALL ON FUNCTION public.sync_user_memberships(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_user_memberships(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.trg_sync_user_memberships() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_sync_user_memberships() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_user_memberships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_sync_user_memberships() TO authenticated;

-- =============================================================================
-- 4. Reconcile inicial — repara qualquer drift pós-036/040 já existente.
--    Executa o mesmo algoritmo linha a linha (sem depender da trigger).
-- =============================================================================

DO $$
DECLARE
  r record;
  v_rows bigint := 0;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.sync_user_memberships(r.id);
    v_rows := v_rows + 1;
  END LOOP;
  RAISE NOTICE 'rbac2 sync memberships: reconcile applied to % profiles', v_rows;
END $$;

COMMENT ON FUNCTION public.sync_user_memberships(uuid) IS
  'RBAC 2.0 (041): sincroniza memberships com profiles (status, role, workspace_ids, is_super_admin). SECURITY DEFINER; invocada pelo wrapper da trigger e pelo reconcile inicial.';

COMMENT ON FUNCTION public.trg_sync_user_memberships() IS
  'RBAC 2.0 (041): wrapper da trigger trg_profiles_sync_memberships — lê NEW.id e delega para sync_user_memberships(uuid).';