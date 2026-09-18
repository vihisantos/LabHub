#!/usr/bin/env python3
"""Validacao COMPORTAMENTAL da migration 067 (Fase 5.1 - Trust Boundary).

Roda TUDO em UMA transacao (um unico request a Management API): fixtures,
mutacoes passo a passo e asserts avaliados em SQL - termina com ROLLBACK: zero
residuo no banco (mesmo padrao de validate_rbac2_coordinator_066_dev.py).

Cenario:
  common : usuario autenticado comum (technician ativo, wsA)
  super  : super admin (is_super_admin=true)
  coord  : coordenador ativo de wsA (fonte RBAC 2.0 - integridade)
  target : tecnico ativo em wsA (alvo de edicao administrativa)

Asserts cobrem:
  A  autoelevacao negada para usuario comum (is_super_admin, role admin/
     coordinator/lider, status, app_access) e imutabilidade de id/workspace_ids;
  B  edicao legitima de perfil pelo proprio usuario segue permitida;
  C  super admin edita is_super_admin/role/status/app_access de terceiros, mas
     NAO altera id nem workspace_ids em UPDATE normal;
  D  primitivo legado `sync_user_memberships`/`trg_sync_user_memberships`
     ausente do catalogo e trigger legado inexistente;
  E  contexto confiavel (auth.uid() NULL: service_role/backend, signup) segue
     permitido, inclusive para `workspace_ids` (espelho/RPC 052);
  F  policy `profiles_update` com USING + WITH CHECK no catalogo real;
  G  integridade RBAC 2.0 (is_coordinator_of e memberships intactos);
  X  integridade final (colunas de privilegio do comum intactas).

Requer migrations 019, 028, 041..053 e 067 aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_trust_boundary_067_dev.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - dotenv é opcional
    load_dotenv = None

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _load_env() -> None:
    if load_dotenv is None:
        return
    for name in (".env", ".env.local"):
        path = PROJECT_ROOT / name
        if path.is_file():
            load_dotenv(path, override=False)


_load_env()

REF = os.environ.get("SUPABASE_PROJECT_REF", "")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

WS_A = "11111111-1111-1111-1111-111111111111"
PFX = "eeeeeeee-0000-0000-0000-0000000000"
P = {k: f"{PFX}{i:02d}" for i, k in enumerate(
    ["common", "super", "coord", "target"], start=1)}

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

T = {
    "__WS_A__": WS_A,
    "__COMMON__": P["common"], "__SUPER__": P["super"],
    "__COORD__": P["coord"], "__TARGET__": P["target"],
}

PROFILE_ROLES = {
    "common": "technician", "super": "admin",
    "coord": "coordinator", "target": "technician",
}

MEMBERSHIP_SEED = [
    ("coord", "coordinator", "active"),
    ("common", "tec", "active"),
    ("target", "tec", "active"),
]

ROLE_SLUG_TO_DB = {
    "coordinator": "coordinator", "adm": "adm", "lider": "lider",
    "tec": "technician", "vis": "viewer",
}

ROLE_UPDATES = "\n".join(
    f"UPDATE public.profiles SET status = 'active', role = '{PROFILE_ROLES[key]}' "
    f"WHERE id = '{P[key]}';"
    for key in PROFILE_ROLES
) + f"\nUPDATE public.profiles SET is_super_admin = true WHERE id = '{P['super']}';"

MEMBERSHIP_ROWS = ",\n".join(
    f"  ('{P[key]}', '{WS_A}', '{ROLE_SLUG_TO_DB[slug]}', '{status}')"
    for key, slug, status in MEMBERSHIP_SEED
)

SQL = r"""
BEGIN;

-- ---------------- helpers
CREATE TEMP TABLE _t(
  id serial PRIMARY KEY, name text, ok boolean,
  expected jsonb, actual jsonb, n_expected int, n_actual int
);
CREATE FUNCTION pg_temp._chk(p_name text, p_ok boolean, p_exp jsonb, p_act jsonb, p_n_exp int, p_n_act int) RETURNS void AS $f$
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES (p_name, p_ok, p_exp, p_act, p_n_exp, p_n_act);
$f$ LANGUAGE sql VOLATILE;
CREATE FUNCTION pg_temp._expect_deny(p_name text, p_sql text, p_like text) RETURNS void AS $f$
BEGIN
  EXECUTE p_sql;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES (p_name, false, to_jsonb(p_like), to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES (p_name, SQLERRM LIKE p_like, to_jsonb(p_like), to_jsonb(SQLERRM), 1, 1);
END;
$f$ LANGUAGE plpgsql;
CREATE FUNCTION pg_temp._expect_ok(p_name text, p_sql text) RETURNS void AS $f$
BEGIN
  EXECUTE p_sql;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES (p_name, true, to_jsonb('ok'::text), to_jsonb('ok'::text), 1, 1);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES (p_name, false, to_jsonb('ok'::text), to_jsonb(SQLERRM), 1, 0);
END;
$f$ LANGUAGE plpgsql;
CREATE FUNCTION pg_temp._login(p_pid uuid) RETURNS void AS $f$
  SELECT set_config('request.jwt.claim.sub', p_pid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_pid, 'role', 'authenticated')::text, true);
$f$ LANGUAGE sql VOLATILE;
CREATE FUNCTION pg_temp._logout() RETURNS void AS $f$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claims', '', true);
$f$ LANGUAGE sql VOLATILE;
CREATE FUNCTION pg_temp._profile_role(p_pid uuid) RETURNS text AS $f$
  SELECT role FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._profile_status(p_pid uuid) RETURNS text AS $f$
  SELECT status FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._profile_name(p_pid uuid) RETURNS text AS $f$
  SELECT name FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._is_super(p_pid uuid) RETURNS boolean AS $f$
  SELECT is_super_admin FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._app_access(p_pid uuid) RETURNS jsonb AS $f$
  SELECT app_access FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._ws_ids(p_pid uuid) RETURNS uuid[] AS $f$
  SELECT workspace_ids FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;

-- ---------------- fixtures
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST', 'ws-alpha-test-067');

INSERT INTO auth.users (id, email) VALUES
  __USERS__;

INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, v.status
FROM (VALUES
__MEMBERSHIP_ROWS__
) AS v(pid, ws, role_slug, status)
JOIN public.roles r ON r.slug = v.role_slug;

__ROLE_UPDATES__

CREATE TEMP TABLE _snap AS
SELECT id, is_super_admin, role, status, app_access, workspace_ids
FROM public.profiles WHERE id::text LIKE '__PFX__%';

CREATE TEMP TABLE _m0 AS
SELECT count(*)::int AS n FROM public.memberships WHERE workspace_id = '__WS_A__';

-- ================= A: autoelevacao negada para usuario comum =================
SELECT pg_temp._login('__COMMON__'::uuid);
SELECT pg_temp._expect_deny(
  'A1 common nao vira super admin',
  $q$UPDATE public.profiles SET is_super_admin = true WHERE id = '__COMMON__'$q$,
  'alteracao de campo privilegiado do proprio perfil nao e permitida%');
SELECT pg_temp._expect_deny(
  'A2 common nao vira admin',
  $q$UPDATE public.profiles SET role = 'admin' WHERE id = '__COMMON__'$q$,
  'alteracao de campo privilegiado do proprio perfil nao e permitida%');
SELECT pg_temp._expect_deny(
  'A3 common nao vira coordinator',
  $q$UPDATE public.profiles SET role = 'coordinator' WHERE id = '__COMMON__'$q$,
  'alteracao de campo privilegiado do proprio perfil nao e permitida%');
SELECT pg_temp._expect_deny(
  'A4 common nao vira lider',
  $q$UPDATE public.profiles SET role = 'lider' WHERE id = '__COMMON__'$q$,
  'alteracao de campo privilegiado do proprio perfil nao e permitida%');
SELECT pg_temp._expect_deny(
  'A5 common nao altera status (autoaprovacao)',
  $q$UPDATE public.profiles SET status = 'suspended' WHERE id = '__COMMON__'$q$,
  'alteracao de campo privilegiado do proprio perfil nao e permitida%');
SELECT pg_temp._expect_deny(
  'A6 common nao altera app_access',
  $q$UPDATE public.profiles SET app_access = '{"tv":"full"}'::jsonb WHERE id = '__COMMON__'$q$,
  'alteracao de campo privilegiado do proprio perfil nao e permitida%');
SELECT pg_temp._expect_deny(
  'A7 common nao altera workspace_ids',
  $q$UPDATE public.profiles SET workspace_ids = ARRAY['__WS_A__']::uuid[] WHERE id = '__COMMON__'$q$,
  'profiles.workspace_ids is immutable in normal UPDATE%');
SELECT pg_temp._expect_deny(
  'A8 common nao troca o proprio id',
  $q$UPDATE public.profiles SET id = '__TARGET__' WHERE id = '__COMMON__'$q$,
  'profiles.id is immutable in normal UPDATE%');

-- ================= B: edicao legitima de perfil segue permitida ==============
SELECT pg_temp._expect_ok(
  'B1 common edita name/banner/avatar/accent/theme_variant',
  $q$UPDATE public.profiles SET name = 'Novo Nome', banner = 'b.png', avatar = 'a.png',
     accent = 'cyan', theme_variant = 'light' WHERE id = '__COMMON__'$q$);
SELECT pg_temp._chk(
  'B2 edicao legitima persistiu',
  pg_temp._profile_name('__COMMON__'::uuid) = 'Novo Nome',
  to_jsonb('Novo Nome'::text), to_jsonb(pg_temp._profile_name('__COMMON__'::uuid)), 1, 1);

-- ================= C: super admin segue editando terceiros ==================
SELECT pg_temp._login('__SUPER__'::uuid);
SELECT pg_temp._expect_ok(
  'C1 super admin promove target a admin',
  $q$UPDATE public.profiles SET role = 'admin', status = 'suspended', is_super_admin = true
     WHERE id = '__TARGET__'$q$);
SELECT pg_temp._chk(
  'C2 mudanca do super admin persistiu',
  pg_temp._profile_role('__TARGET__'::uuid) = 'admin'
    AND pg_temp._profile_status('__TARGET__'::uuid) = 'suspended'
    AND pg_temp._is_super('__TARGET__'::uuid),
  to_jsonb('admin/suspended/true'::text),
  to_jsonb(concat_ws('/',
    pg_temp._profile_role('__TARGET__'::uuid),
    pg_temp._profile_status('__TARGET__'::uuid),
    pg_temp._is_super('__TARGET__'::uuid)::text)), 1, 1);

-- Super Admin NAO altera id/workspace_ids em UPDATE normal (so contexto confiavel).
SELECT pg_temp._expect_deny(
  'C3 super admin NAO troca id',
  $q$UPDATE public.profiles SET id = '__SUPER__' WHERE id = '__TARGET__'$q$,
  'profiles.id is immutable in normal UPDATE%');
SELECT pg_temp._expect_deny(
  'C4 super admin NAO altera workspace_ids',
  $q$UPDATE public.profiles SET workspace_ids = ARRAY['__WS_A__']::uuid[] WHERE id = '__TARGET__'$q$,
  'profiles.workspace_ids is immutable in normal UPDATE%');

-- Super Admin continua alterando app_access.
SELECT pg_temp._expect_ok(
  'C5 super admin altera app_access',
  $q$UPDATE public.profiles SET app_access = '{"tv":"full"}'::jsonb WHERE id = '__TARGET__'$q$);
SELECT pg_temp._chk(
  'C6 app_access do super admin persistiu',
  pg_temp._app_access('__TARGET__'::uuid) = '{"tv":"full"}'::jsonb,
  to_jsonb('{"tv":"full"}'::jsonb), to_jsonb(pg_temp._app_access('__TARGET__'::uuid)), 1, 1);

-- ================= D: primitivo legado removido =================
SELECT pg_temp._chk(
  'D1 sync_user_memberships(uuid) ausente do catalogo',
  to_regprocedure('public.sync_user_memberships(uuid)') IS NULL,
  'null'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'D2 trg_sync_user_memberships() ausente do catalogo',
  to_regprocedure('public.trg_sync_user_memberships()') IS NULL,
  'null'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'D3 trigger legado trg_profiles_sync_memberships inexistente',
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_sync_memberships'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

-- ================= E: contexto confiavel (auth.uid() NULL) permitido ========
SELECT pg_temp._logout();
SELECT pg_temp._expect_ok(
  'E1 service/signup context altera cargo (auth.uid() NULL)',
  $q$UPDATE public.profiles SET role = 'coordinator' WHERE id = '__TARGET__'$q$);
SELECT pg_temp._chk(
  'E2 atualizacao confiavel persistiu',
  pg_temp._profile_role('__TARGET__'::uuid) = 'coordinator',
  to_jsonb('coordinator'::text), to_jsonb(pg_temp._profile_role('__TARGET__'::uuid)), 1, 1);

-- Contexto confiavel tambem grava workspace_ids (espelho/RPC 052).
SELECT pg_temp._expect_ok(
  'E3 service context altera workspace_ids (auth.uid() NULL)',
  $q$UPDATE public.profiles SET workspace_ids = ARRAY['__WS_A__']::uuid[] WHERE id = '__TARGET__'$q$);
SELECT pg_temp._chk(
  'E4 workspace_ids confiavel persistiu',
  pg_temp._ws_ids('__TARGET__'::uuid) = ARRAY['__WS_A__']::uuid[],
  to_jsonb(ARRAY['__WS_A__']::uuid[]), to_jsonb(pg_temp._ws_ids('__TARGET__'::uuid)), 1, 1);

-- ================= F: policy profiles_update com USING + WITH CHECK =========
SELECT pg_temp._chk(
  'F1 profiles_update tem USING com is_super_admin',
  COALESCE((SELECT qual LIKE '%is_super_admin%' FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update'), false),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk(
  'F2 profiles_update tem WITH CHECK com is_super_admin',
  COALESCE((SELECT with_check LIKE '%is_super_admin%' FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update'), false),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- ================= G: integridade RBAC 2.0 =================
SELECT pg_temp._login('__COORD__'::uuid);
SELECT pg_temp._chk(
  'G1 is_coordinator_of(wsA) true para o coordenador',
  public.is_coordinator_of('__WS_A__'::uuid),
  'true'::jsonb, to_jsonb(public.is_coordinator_of('__WS_A__'::uuid)), 1, 1);
SELECT pg_temp._login('__COMMON__'::uuid);
SELECT pg_temp._chk(
  'G2 is_coordinator_of(wsA) false para usuario comum',
  NOT public.is_coordinator_of('__WS_A__'::uuid),
  'false'::jsonb, to_jsonb(public.is_coordinator_of('__WS_A__'::uuid)), 0, 0);
SELECT pg_temp._chk(
  'G3 memberships de wsA intactas (nenhuma apagada/criada)',
  (SELECT count(*)::int FROM public.memberships WHERE workspace_id = '__WS_A__')
    = (SELECT n FROM _m0),
  to_jsonb('intact'::text), to_jsonb('checked'::text), 1, 1);

-- ================= X: integridade final =================
SELECT pg_temp._chk(
  'X1 common sem privilegio algum (is_super/role/status/app_access intactos)',
  pg_temp._is_super('__COMMON__'::uuid) = false
    AND pg_temp._profile_role('__COMMON__'::uuid) = 'technician'
    AND pg_temp._profile_status('__COMMON__'::uuid) = 'active'
    AND pg_temp._app_access('__COMMON__'::uuid) = '{}'::jsonb,
  to_jsonb('false/technician/active/{}'::text),
  to_jsonb(concat_ws('/',
    pg_temp._is_super('__COMMON__'::uuid)::text,
    pg_temp._profile_role('__COMMON__'::uuid),
    pg_temp._profile_status('__COMMON__'::uuid),
    pg_temp._app_access('__COMMON__'::uuid)::text)), 1, 1);

SELECT coalesce(bool_and(ok), false) AS all_ok,
       count(*) FILTER (WHERE NOT ok) AS fails,
       coalesce(jsonb_agg(name ORDER BY id) FILTER (WHERE NOT ok), '[]'::jsonb) AS failed,
       coalesce(jsonb_agg(actual ORDER BY id) FILTER (WHERE NOT ok), '[]'::jsonb) AS failed_actual,
       count(*) AS total_checks
FROM _t;

ROLLBACK;
"""


def main() -> int:
    if not REF or not TOKEN:
        print("[validate-067] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes",
              file=sys.stderr)
        return 2
    body = SQL
    for tok, val in T.items():
        body = body.replace(tok, val)
    body = body.replace("__USERS__", USERS_SQL)
    body = body.replace("__MEMBERSHIP_ROWS__", MEMBERSHIP_ROWS)
    body = body.replace("__ROLE_UPDATES__", ROLE_UPDATES)
    body = body.replace("__PFX__", PFX)
    url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
    resp = requests.post(
        url,
        json={"query": body},
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        timeout=180,
    )
    print("HTTP:", resp.status_code)
    if resp.status_code >= 300:
        print(resp.text[:1200], file=sys.stderr)
        return 2
    verdict = resp.json()
    print(json.dumps(verdict, indent=2, ensure_ascii=False))
    ok = bool(verdict) and verdict[0].get("all_ok") is True
    if ok:
        print(f"\n[OK] VALIDACAO 067 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
