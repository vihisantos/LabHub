-- =============================================================================
-- 080_decouple_profiles_app_access_from_triggers.sql
-- =============================================================================
-- F2-D-I — DESACOPLA MECANICAMENTE `profiles.app_access` DOS 2 TRIGGERS VIVOS.
--
-- CONTEXTO (auditoria read-only F2-D-H, sobre `fed1f99`):
--   `profiles.app_access` NÃO possui mais autoridade funcional de autorização.
--   Comprovado item a item:
--     · 0 RLS policy lê a coluna (as policies de `profiles` usam
--       `auth.uid()`/`is_super_admin()`/`profile_visible_to_me` — 028/044/067/073);
--     · 0 RPC e 0 função viva lê a coluna. As DUAS leituras que existiram
--       (`user_can_manage_tv` na 059 e `user_can_cancel_tablet_reservation` na
--       050) foram substituídas por `CREATE OR REPLACE` na 077 e na 078;
--     · 0 arquivo Python de runtime referencia `app_access` (só os testes);
--     · o targeting de Push (F2-D-E, `09ecff4`) decide por membership ativa +
--       `role_permissions` (`_module_action_ok`, `reservalab/api/app.py:947`);
--     · nenhuma Action RBAC2 depende da coluna.
--
-- POR QUE ESTA MIGRATION EXISTE (o bloqueio MECÂNICO):
--   Restavam 2 triggers vivos que leem `NEW.app_access`/`OLD.app_access` em
--   corpos plpgsql. O Postgres NÃO valida o corpo de uma função plpgsql no
--   DDL, então um `DROP COLUMN app_access` passaria sem erro e passaria a
--   lançar `record "new" has no field "app_access"` em TODO `UPDATE` de
--   `public.profiles` (troca de nome, tema, accent, `notify_settings`…), em
--   tempo de execução. Esta migration remove essa dependência para que o DROP
--   futuro seja um acto mecânico seguro.
--
-- O QUE É MUDADO (e nada mais):
--   1. `public.audit_profiles_change()` (054) — recriada SEM o ramo
--      `app_access_changed` e SEM a referência `NEW/OLD.app_access`.
--      PRESERVADOS: `role_changed`, `status_changed`, `super_admin_toggled`
--      (com os mesmos `meta`), resolução do workspace por membership ativa,
--      `INSERT` em `app_audit_logs` (mesmas colunas), `RETURN NEW`,
--      `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
--      A trigger `trg_app_audit_profiles` mantém nome, timing (`AFTER UPDATE`),
--      granularidade (`FOR EACH ROW`) e a condição `WHEN` — da qual sai
--      apenas o item `app_access`.
--   2. `public.guard_profile_privileged_columns()` (067) — recriada SEM
--      `app_access` na lista de campos privilegiados.
--      PRESERVADOS: contexto confiável (`auth.uid()` nulo → `RETURN NEW`),
--      `id` imutável, `workspace_ids` imutável (ambos `42501`),
--      atalho de Super Admin, e o bloqueio de usuário comum sobre
--      `is_super_admin`/`role`/`status` (mesma mensagem e mesmo `ERRCODE`).
--      A trigger `trg_profiles_guard_privileged` mantém nome, timing
--      (`BEFORE UPDATE`) e `FOR EACH ROW`.
--
-- IDEMPOTÊNCIA: `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` +
-- `CREATE TRIGGER` — o mesmo padrão de 054/067. Replay apenas substitui o
-- corpo; nenhum dado é apagado, nenhuma policy é tocada.
--
-- ACL: nenhuma das duas funções tem `GRANT`/`REVOKE` explícito em nenhuma
-- migration do repo (verificado). `CREATE OR REPLACE` preserva privilégios de
-- qualquer forma — nada a reaplicar.
--
-- CONDIÇÃO DE USO: as funções passam a NÃO referenciar a coluna. Isto é
-- seguro enquanto a coluna existir (o resto do schema é intocado) e é
-- PRÉ-REQUISITO para removê-la depois.
--
-- ============================================================================
-- CONSCIÊNCIA DE SEGURANÇA — LEIA ANTES DE APLICAR
-- ============================================================================
-- Tirar `app_access` da lista de campos protegidos tem UMA consequência
-- comportamental, declarada aqui e no relatório do F2-D-I:
--
--   A policy `profiles_update` (067:130-140) é `USING (auth.uid() = id OR
--   is_super_admin())` — ou seja, um usuário COMUM pode dar UPDATE na própria
--   linha em QUALQUER coluna. Até aqui, a trigger era o ÚNICO controle de
--   nível de COLUNA: ela bloqueia a autoelevação de `is_super_admin`, `role`,
--   `status` e `app_access`. Removendo `app_access` da lista, um usuário
--   comum passa a poder escrever a própria `app_access`.
--
--   BLAST RADIUS (por que isso NÃO é uma elevação de privilégio real):
--     · `app_access` não concede NADA no servidor — nenhuma policy, nenhuma
--       função, nenhum endpoint, nenhum targeting de push a consulta (F2-D-H);
--     · logo, escrever nela não abre leitura (RLS/escopo de workspace seguem
--       intactos) nem escrita (continuam exigindo Action/RLS/`require_action`);
--     · o único consumidor é o FRONTEND, `resolveAppAccess`, e ele é usado
--       APENAS para VISIBILIDADE (AppGuard, launcher, command palette, badges).
--     · não existe UI que escreva `app_access` (o F2-B removeu o campo da
--       assinatura de `adminService.update`); a escrita exigiria uma chamada
--       direta à API com o token do próprio usuário.
--
--   Ou seja: a consequência é de UX/visibilidade, não de autorização — e é
--   exatamente a dependência de visibilidade que o F2-D-H classificou como
--   `BLOCKER-03` (decisão de produto pendente sobre o destino do App Access).
--   Esta migration NÃO a agrava nem a reduz: apenas deixa de proteger um
--   campo que já não é autoridade.
--
--   MITIGAÇÃO JÁ EXISTENTE (inalterada): `id` e `workspace_ids` seguem
--   imutáveis, e `is_super_admin`/`role`/`status` seguem bloqueados para
--   usuário comum — a autoelevação de PRIVÍLEGIO continua impossível.
--
-- FORA DE ESCOPO (deliberado):
--   · NÃO remove a coluna `app_access` (nem o DEFAULT) — isso é fase posterior;
--   · NÃO altera `User.app_access` (TS), `Role.appAccess`, `DEFAULT_ROLES`,
--     `resolveAppAccess`, `canWriteApp`, `requireWrite`;
--   · NÃO altera nenhuma policy, nenhuma Action, nenhum seed, nenhuma
--     membership, `profiles.role`, `auth.users`, approval, Coordinator, TV,
--     ReservaLab, Chamados ou PC Care;
--   · NÃO mexe em `_target_subs`, `_module_action_ok` nem no targeting de Push;
--   · NÃO mexe em `membership_overrides` (divergência latente já documentada
--     no F2-D-H §G — fica para a fase que decidir essa semântica);
--   · NÃO cria backend para SLA, trigger, view ou RPC nova.
-- =============================================================================


-- ─── 1. Auditoria de `profiles` sem a dependência de `app_access` ───────────
--     Recriação de `audit_profiles_change()` (054:122-163). Idêntica, exceto
--     pelo ramo `app_access_changed` (054:142-143) removido.
CREATE OR REPLACE FUNCTION public.audit_profiles_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id   uuid := auth.uid();
  v_actor_name text := '';
  v_ws         uuid;
  v_action     text;
  v_meta       jsonb := '{}'::jsonb;
BEGIN
  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    v_action := 'role_changed';
    v_meta   := jsonb_build_object('prev_role', OLD.role, 'new_role', NEW.role);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := 'status_changed';
    v_meta   := jsonb_build_object('prev_status', OLD.status, 'new_status', NEW.status);
  ELSIF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    v_action := 'super_admin_toggled';
    v_meta   := jsonb_build_object('prev', OLD.is_super_admin, 'new_val', NEW.is_super_admin);
  ELSE
    RETURN NULL;
  END IF;

  -- Workspace do alvo: membership ativa (RBAC 2.0). Sem membership → sem
  -- workspace_id (fica NULL; ainda visível ao super admin).
  SELECT workspace_id INTO v_ws FROM public.memberships
    WHERE profile_id = NEW.id AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

  INSERT INTO public.app_audit_logs
    (workspace_id, actor_id, actor_name, action, entity, entity_id, entity_label, meta)
  VALUES
    (v_ws, v_actor_id, COALESCE(v_actor_name, ''), v_action, 'user',
     NEW.id::text, NEW.name, v_meta);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.audit_profiles_change() IS
  'Auditoria de UPDATE sensível em public.profiles (F2-D-I, sobre a 054). '
  'Registra role_changed / status_changed / super_admin_toggled em '
  'public.app_audit_logs, resolvendo o workspace do alvo pela membership ATIVA. '
  'F2-D-I removeu o ramo app_access_changed: a coluna profiles.app_access não '
  'possui mais autoridade funcional (auditoria F2-D-H — nenhuma policy, função, '
  'RPC ou rota a consulta) e, enquanto ela existir, o DEFAULT da trigger evita o '
  'erro de runtime "record new has no field app_access" que um DROP futuro '
  'causaria. A coluna em si NÃO é removida aqui. Trigger AFTER UPDATE, nome e '
  'WHEN preservados.';

-- WHEN: mesmos 3 campos da 054:169-172, sem o item `app_access`. Consequência
-- intencional: um UPDATE que mude SÓ `app_access` deixa de disparar a
-- auditoria (a função retornaria NULL de qualquer forma, sem evento gravado).
DROP TRIGGER IF EXISTS trg_app_audit_profiles ON public.profiles;
CREATE TRIGGER trg_app_audit_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role IS DISTINCT FROM OLD.role
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin)
  EXECUTE FUNCTION public.audit_profiles_change();


-- ─── 2. Guarda de campos privilegiados sem `app_access` ─────────────────────
--     Recriação de `guard_profile_privileged_columns()` (067:61-107). Idêntica,
--     exceto pelo item `app_access` da lista (067:100).
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contexto confiavel: service_role/backend ou signup (GoTrue) nao apresentam
  -- `auth.uid()`. Nao e alvo desta guarda (o RLS/service key ja e a autoridade).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Identidade imutavel: `id` nunca muda em UPDATE normal, para ninguem
  -- (nem usuario comum nem Super Admin) - apenas contexto confiavel (acima).
  -- FKs de profiles.id sao ON DELETE CASCADE/SET NULL (sem ON UPDATE CASCADE).
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable in normal UPDATE'
      USING ERRCODE = '42501';
  END IF;

  -- RBAC 2.0: `memberships` e a fonte de autorizacao; `workspace_ids` e apenas
  -- espelho/compatibilidade legado. Imutavel em UPDATE normal, inclusive para
  -- Super Admin; o unico escritor legitimo e a RPC 052 (service_role).
  IF NEW.workspace_ids IS DISTINCT FROM OLD.workspace_ids THEN
    RAISE EXCEPTION 'profiles.workspace_ids is immutable in normal UPDATE'
      USING ERRCODE = '42501';
  END IF;

  -- Super Admin mantem a edicao administrativa dos demais campos
  -- (is_super_admin/role/status) de qualquer perfil.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Usuario comum: proibido mexer em campos de privilegio global.
  -- F2-D-I: `app_access` saiu desta lista. A coluna nao concede autoridade
  -- (F2-D-H) e nao ha UI que a escreva; ver a nota de consciencia de seguranca
  -- no cabecalho desta migration. `is_super_admin`/`role`/`status` seguem
  -- bloqueados — a autoelevacao de privilegio continua impossivel.
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.role         IS DISTINCT FROM OLD.role
     OR NEW.status       IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'alteracao de campo privilegiado do proprio perfil nao e permitida'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profile_privileged_columns() IS
  'Guarda de nivel de COLUNA em public.profiles (F2-D-I, sobre a 067). '
  'Contexto confiavel (auth.uid() nulo) passa intacto; `id` e `workspace_ids` '
  'sao imutaveis; Super Admin edita is_super_admin/role/status; usuario comum '
  'nao edita esses tres campos (42501). F2-D-I removeu `app_access` da lista de '
  'privilegios: a coluna nao concede autoridade funcional (F2-D-H) e nao ha UI '
  'que a escreva — a exposicao resultante e de VISIBILIDADE no frontend, nao de '
  'autorizacao. Trigger BEFORE UPDATE, nome e timing preservados.';

-- Recriada explicitamente (mesmo padrao da 067) para que o desacoplamento nao
-- dependa de a trigger pre-existente: `CREATE OR REPLACE FUNCTION` preserva o
-- OID, entao a trigger existente passaria a usar o corpo novo de qualquer
-- forma — mas DROP+CREATE deixa o estado explicito e auditavel, e cobre um banco
-- onde a 067 nao tenha sido aplicada. Nenhum WHEN clause (a 067 nao tinha) e
-- inalterado, portanto o conjunto de linhas disparadas e o mesmo.
DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();
