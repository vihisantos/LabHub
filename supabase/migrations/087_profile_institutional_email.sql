-- =============================================================================
-- 087_profile_institutional_email.sql
-- =============================================================================
-- E-mail institucional do usuário, como campo PRÓPRIO.
--
-- NOTA DE NUMERAÇÃO (2026-10-06): este arquivo nasceu como
-- 079_profile_institutional_email.sql (commit 5d1b41a, 2026-09-29), reusing o
-- slot 079 que havia sido liberado pela renumeração de
-- 079_rbac2_checklist_sla_actions.sql -> 082_rbac2_checklist_sla_actions.sql.
-- A linha `079 -> 079_rbac2_checklist_sla_actions.sql` já existia em
-- public.schema_migrations de produção, então o runner via a versão 079 como já
-- aplicada e NUNCA aplicou esta migration: a coluna
-- public.profiles.institutionalEmail não existia em produção.
-- A auditoria de identidade (#350) detectou a divergência e abortou o dry-run.
-- Renumerado para 087 (número livre) para resolver sem tocar no histórico.
--
-- Contexto:
--   Hoje `public.profiles.email` é o e-mail da CONTA — aquele com que a pessoa
--   entrou. Ele é usado como identidade de exibição em ~25 pontos do produto
--   (listas de admin, blocos de liderança/coordenação, destinatário de
--   relatórios) e é o campo pelo qual o admin acha a conta.
--
--   O e-mail de login NÃO é este campo: o sign-in usa
--   `supabase.auth.signInWithPassword({ email: credentials.email })`
--   (core/auth/service.ts:143), ou seja, o e-mail do `auth.users`. Portanto
--   `profiles.email` pode ser reescrito sem quebrar o login — e ainda assim não
--   deve ser.
--
-- Por que um campo novo em vez de reaproveitar `email`:
--   1. Identidade da conta. O admin precisa continuar achando a conta pelo
--      e-mail com que a pessoa loga. Sobrescrever `email` desincroniza o
--      profile do `auth.users` e a busca por e-mail (UsersPage:107) passa a
--      procurar por um endereço que não é o de acesso.
--   2. O e-mail @labhub é provisório. Ele existe para a conta ter um endereço
--      válido desde o primeiro acesso, não por ser o contato real da pessoa.
--      O contato real (institucional) é informação a mais, que pode não existir
--      — por isso a coluna é NULLABLE e sem default.
--   3. E-mail de acesso e e-mail institucional são dados de naturezas
--      diferentes: um autentica, o outro identifica. Misturá-los obriga a
--      decidir, para cada consumidor, qual dos dois está olhando.
--
-- Decisões:
--   1. Coluna nova `institutionalEmail TEXT`, nullable, sem default. Nenhuma
--      linha existente muda de valor — a migration não altera dado nenhum.
--   2. NENHUM CHECK de formato no banco. A aplicação valida antes de gravar
--      (ProfileSheet); um constraint aqui rejeitaria também o estado
--      intermediário de "campo em edição ainda não validado" e complicaria
--      correções de digitação. Formato é apresentação, não integridade.
--   3. Sem índice. A coluna não participates de filtro, ordenação ou busca —
--      a busca de usuários continua em `email`, que é a identidade da conta.
--   4. Sem backfill. Preencher `@labhub` como institucional seria inventar
--      dado; a coluna nasce vazia e quem a preencher é a pessoa.
--
-- LINHAS VERMELHAS (esta migration NAO altera):
--   `profiles.email`, `auth.users`, o sign-in, policies/RLS, o gatilho
--   `trg_app_audit_profiles`, `memberships`, e os consumidores atuais de
--   `email` (admin, liderança, coordenação, relatórios).
--
-- IDEMPOTENCIA: `ADD COLUMN IF NOT EXISTS`. Replay seguro pelo runner.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institutionalEmail TEXT;

COMMENT ON COLUMN public.profiles.institutionalEmail IS
  'E-mail institucional de contato (ex.: nome@univ.edu). NAO e o e-mail de '
  'login: o login usa auth.users.email. Coluna nullable e sem backfill de '
  'proposito — o e-mail @labhub da conta e provisorio, e o contato real e '
  'informacao adicional que pode nao existir.';
