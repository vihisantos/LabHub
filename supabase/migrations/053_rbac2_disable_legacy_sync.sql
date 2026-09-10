-- =============================================================================
-- 053: RBAC 2.0 — Fase 9.3-C: desliga a sincronização legada profiles → memberships
--
-- A partir daqui, `memberships` é escrita SOMENTE por caminhos explícitos
-- (RPC 052, RPCs 047 de gestão, DDL direta com privilégio). A coluna
-- `profiles.workspace_ids` continua existindo (compat/espelho via 052) mas
-- NADA mais a lê para decidir, e NADA mais a usa para produzir memberships.
--
-- O QUE ESTA MIGRATION FAZ (e o que NÃO faz):
--   1. REMOVE o trigger trg_profiles_sync_memberships (evento que derivava
--      memberships da coluna a cada UPDATE de status/role/workspace_ids/
--      is_super_admin). NÃO executa sync_user_memberships() como reconcile —
--      isso reescreveria memberships granular a partir do legado (regressão
--      arquitetural; gate 9.3-C). Auditoria pré-DROP: zero divergências
--      inesperadas (DEV 1/0 + PROD 10/2-super, 2026-09-10).
--   2. MANTÉM a função sync_user_memberships(uuid) para rollback operacional
--      (reativar o trigger = reexecutar a 041, idempotente).
--   3. REESCREVE handle_new_user() sem a coluna (usa DEFAULT '{}'); signup
--      continua criando perfil pendente sem memberships (approve cria via 052).
--   4. NÃO toca no espelho 052, na coluna, em RLS, na 046/047 nem em roles.
--
-- IDEMPOTÊNCIA: DROP IF EXISTS + CREATE OR REPLACE; replay seguro.
-- =============================================================================

-- 1. Desliga o evento (a função permanece para rollback/auditoria manual).
DROP TRIGGER IF EXISTS trg_profiles_sync_memberships ON public.profiles;

-- 2. Signup sem dependência funcional da coluna (DEFAULT '{}' a mantém
--    preenchida como compat até a 9.3-F; memberships vêm do approve via 052).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, status, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'viewer',
    'pending',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    status = 'pending',
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.sync_user_memberships(uuid) IS
  'RBAC 2.0 (041, DESLIGADA na 053/9.3-C): sincronização legada profiles.workspace_ids → memberships. Trigger removida; função mantida SOMENTE para rollback operacional (reativar = reexecutar a 041). NÃO usar como reconcile — direção arquiteturalmente proibida desde 9.3-C.';
