#!/usr/bin/env python3
"""Validação COMPORTAMENTAL da migration 066 (membros inativos pelo Coordenador).

Roda TUDO em UMA transação (um único request à Management API): fixtures,
mutações passo a passo e asserts avaliados em SQL — termina com ROLLBACK: zero
resíduo no banco (mesmo padrão de validate_rbac2_coordinator_065_dev.py).

Cenário (Fase 10 — matriz adversarial):
  coord_a   : coordenador só wsA (ator principal)
  coord_b   : coordenador só wsB (fora do escopo de wsA)
  coord_c   : coordenador PAR de coord_a em wsA (ativo)
  coord_z   : coordenador SEM unidade
  adm_a     : admin de workspace (role adm) ativo em wsA
  liderS    : liderança wsA (gestora de tecS), suspensa pela RPC
  tecS      : técnico wsA na equipe de liderS (managed_by)
  tecA1     : técnico wsA ativo (ciclo vida)
  susA      : técnico wsA SUSPENSO (restaurável)
  remA      : técnico wsA REMOVIDO (informativo, NÃO restaurável)
  susCoord  : membership de coordenação SUSPENSA em wsA (não restaurável)
  susAdm    : admin de workspace SUSPENSO em wsA (não restaurável)
  pend1     : solicitação PENDING em wsA
  user_pln  : técnico wsA sem coordenação

Asserts cobrem:
  A  leitura escopada de inativos: só suspended/removed da unidade, com perfil
     projetado; fora do escopo/não-coordenador vazio; ativos ausentes;
  B  projeção de perfil em get_requests (correção da RLS 044);
  C  restauração: suspended→active; removed negado; coordenação/admin negados;
     fora do escopo/não-coordenador negados; managed_by NÃO recriado;
  D  hardening de cargo em suspend/remove (adm/coordinator negados);
  E  auditoria: restauração vira membership_changed suspended→active; nenhuma
     action nova;
  F  ACL real no catálogo (anon NÃO executa; authenticated executa);
  X  integridade final.

Requer migrations 036..047, 054, 065 e 066 aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_coordinator_066_dev.py
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
WS_B = "22222222-2222-2222-2222-222222222222"
PFX = "dddddddd-0000-0000-0000-0000000000"
P = {k: f"{PFX}{i:02d}" for i, k in enumerate(
    ["coord_a", "coord_b", "coord_c", "coord_z", "adm_a", "liderS", "tecS",
     "tecA1", "susA", "remA", "susCoord", "susAdm", "pend1", "user_pln"], start=1)}

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

T = {
    "__WS_A__": WS_A, "__WS_B__": WS_B,
    "__COORD_A__": P["coord_a"], "__COORD_B__": P["coord_b"],
    "__COORD_C__": P["coord_c"], "__COORD_Z__": P["coord_z"],
    "__ADM_A__": P["adm_a"],
    "__LIDERS__": P["liderS"], "__TECS__": P["tecS"],
    "__TECA1__": P["tecA1"], "__SUSA__": P["susA"], "__REMA__": P["remA"],
    "__SUSCOORD__": P["susCoord"], "__SUSADM__": P["susAdm"],
    "__PEND1__": P["pend1"], "__USER_PLN__": P["user_pln"],
}

PROFILE_ROLES = {
    "coord_a": "coordinator", "coord_b": "coordinator", "coord_c": "coordinator",
    "coord_z": "coordinator", "adm_a": "admin", "liderS": "lider",
    "tecS": "technician", "tecA1": "technician", "susA": "technician",
    "remA": "technician", "susCoord": "coordinator", "susAdm": "admin",
    "pend1": "technician", "user_pln": "technician",
}

# (key, ws, slug, status)
MEMBERSHIP_SEED = [
    ("coord_a", "A", "coordinator", "active"),
    ("coord_b", "B", "coordinator", "active"),
    ("coord_c", "A", "coordinator", "active"),
    ("adm_a", "A", "adm", "active"),
    ("liderS", "A", "lider", "active"),
    ("tecS", "A", "tec", "active"),
    ("tecA1", "A", "tec", "active"),
    ("susA", "A", "tec", "suspended"),
    ("remA", "A", "tec", "removed"),
    ("susCoord", "A", "coordinator", "suspended"),
    ("susAdm", "A", "adm", "suspended"),
    ("user_pln", "A", "tec", "active"),
    ("pend1", "A", "tec", "pending"),
]

ROLE_SLUG_TO_DB = {
    "coordinator": "coordinator", "adm": "adm", "lider": "lider",
    "tec": "technician", "vis": "viewer", "est": "est", "opv": "opv",
}

# profiles.status='active' + profiles.role fixado por usuário (o trigger
# handle_new_user não define o cargo; sem isto o assert de role seria vazio).
ROLE_UPDATES = "\n".join(
    f"UPDATE public.profiles SET status = 'active', role = '{PROFILE_ROLES[key]}' "
    f"WHERE id = '{P[key]}';"
    for key in PROFILE_ROLES
)

MEMBERSHIP_ROWS = "\n".join(
    f"  ('{P[key]}', '{(WS_B if ws == 'B' else WS_A)}', '{ROLE_SLUG_TO_DB[slug]}', '{status}'),"
    for key, ws, slug, status in MEMBERSHIP_SEED
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
CREATE TEMP TABLE _m(key text PRIMARY KEY, mid uuid, pid uuid);
CREATE FUNCTION pg_temp._mid(p_key text) RETURNS uuid AS $f$
  SELECT mid FROM _m WHERE key = p_key;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._pid(p_key text) RETURNS uuid AS $f$
  SELECT pid FROM _m WHERE key = p_key;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._status(p_mid uuid) RETURNS text AS $f$
  SELECT status FROM public.memberships WHERE id = p_mid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._managed(p_mid uuid) RETURNS uuid AS $f$
  SELECT managed_by FROM public.memberships WHERE id = p_mid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._profile_role(p_pid uuid) RETURNS text AS $f$
  SELECT role FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._inactive_n(p_ws uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.coordinator_get_inactive_members(p_ws);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._inactive_has(p_ws uuid, p_pid uuid) RETURNS boolean AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.coordinator_get_inactive_members(p_ws) WHERE profile_id = p_pid);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._inactive_name(p_ws uuid, p_pid uuid) RETURNS text AS $f$
  SELECT profile_name FROM public.coordinator_get_inactive_members(p_ws) WHERE profile_id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._req_name(p_ws uuid, p_pid uuid) RETURNS text AS $f$
  SELECT profile_name FROM public.coordinator_get_requests(p_ws) WHERE profile_id = p_pid;
$f$ LANGUAGE sql STABLE;

-- ---------------- fixtures
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST', 'ws-alpha-test-066'),
  ('__WS_B__', 'WS Beta TEST',  'ws-beta-test-066');

INSERT INTO auth.users (id, email) VALUES
  __USERS__;

INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, v.status
FROM (VALUES
__MEMBERSHIP_ROWS__
) AS v(pid, ws, role_slug, status)
JOIN public.roles r ON r.slug = v.role_slug;

__ROLE_UPDATES__

-- Snapshot dos cargos globais ANTES de qualquer RPC (X1: RPCs não tocam profiles.role).
CREATE TEMP TABLE _role0 AS
SELECT id, role FROM public.profiles WHERE id::text LIKE '__PFX__%';

INSERT INTO _m(key, mid, pid)
SELECT s.key, m.id, m.profile_id
FROM (VALUES
  ('coord_a.wsA', '__COORD_A__', '__WS_A__'),
  ('coord_b.wsB', '__COORD_B__', '__WS_B__'),
  ('coord_c.wsA', '__COORD_C__', '__WS_A__'),
  ('adm_a.wsA',   '__ADM_A__',   '__WS_A__'),
  ('liderS.wsA',  '__LIDERS__',  '__WS_A__'),
  ('tecS.wsA',    '__TECS__',    '__WS_A__'),
  ('tecA1.wsA',   '__TECA1__',   '__WS_A__'),
  ('susA.wsA',    '__SUSA__',    '__WS_A__'),
  ('remA.wsA',    '__REMA__',    '__WS_A__'),
  ('susCoord.wsA','__SUSCOORD__','__WS_A__'),
  ('susAdm.wsA',  '__SUSADM__',  '__WS_A__'),
  ('pend1.wsA',   '__PEND1__',   '__WS_A__'),
  ('user_pln.wsA','__USER_PLN__','__WS_A__')
) s(key, pid, ws)
JOIN public.memberships m ON m.profile_id = s.pid::uuid AND m.workspace_id = s.ws::uuid;

-- Árvore montada pelo CAMINHO REAL (RPC 047) como coord_a: liderS -> tecS.
SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT public.coordinator_set_manager(pg_temp._mid('liderS.wsA'), pg_temp._mid('coord_a.wsA'));
SELECT public.coordinator_set_manager(pg_temp._mid('tecS.wsA'),   pg_temp._mid('liderS.wsA'));

-- ================= A: leitura escopada de inativos (como coord_a) =================
SELECT pg_temp._chk(
  'A0 inativos(wsA) = 4 (susA, remA, susCoord, susAdm)',
  pg_temp._inactive_n('__WS_A__'::uuid) = 4,
  '4'::jsonb, to_jsonb(pg_temp._inactive_n('__WS_A__'::uuid)), 4, pg_temp._inactive_n('__WS_A__'::uuid));

SELECT pg_temp._chk(
  'A1 inativos NÃO incluem ativos (tecA1 ausente)',
  NOT pg_temp._inactive_has('__WS_A__'::uuid, '__TECA1__'::uuid),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

SELECT pg_temp._chk(
  'A2 inativos incluem suspenso e removido',
  pg_temp._inactive_has('__WS_A__'::uuid, '__SUSA__'::uuid)
    AND pg_temp._inactive_has('__WS_A__'::uuid, '__REMA__'::uuid),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'A3 projeção traz profile_name do suspenso (não vazio)',
  pg_temp._inactive_name('__WS_A__'::uuid, '__SUSA__'::uuid) LIKE '%susA%',
  to_jsonb('test.susA'::text), to_jsonb(pg_temp._inactive_name('__WS_A__'::uuid, '__SUSA__'::uuid)), 1, 1);

SELECT pg_temp._chk(
  'A4 inativos(wsB) vazio para coord_a (fora do escopo)',
  pg_temp._inactive_n('__WS_B__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._inactive_n('__WS_B__'::uuid)), 0, pg_temp._inactive_n('__WS_B__'::uuid));

-- ================= B: projeção de perfil em get_requests (fix RLS 044) ===========
SELECT pg_temp._chk(
  'B1 get_requests projeta profile_name da PENDING (não vazio)',
  pg_temp._req_name('__WS_A__'::uuid, '__PEND1__'::uuid) LIKE '%pend1%',
  to_jsonb('test.pend1'::text), to_jsonb(pg_temp._req_name('__WS_A__'::uuid, '__PEND1__'::uuid)), 1, 1);

-- ================= C: restauração =================
SELECT pg_temp._expect_ok(
  'C1 restaurar susA (suspended→active)',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('susA.wsA'))$q$);
SELECT pg_temp._chk(
  'C2 susA ACTIVE e profiles.role intocado',
  pg_temp._status(pg_temp._mid('susA.wsA')) = 'active'
    AND pg_temp._profile_role('__SUSA__'::uuid) = 'technician',
  to_jsonb('active'::text), to_jsonb(pg_temp._status(pg_temp._mid('susA.wsA'))), 1, 1);
SELECT pg_temp._chk(
  'C3 susA saiu da lista de inativos',
  NOT pg_temp._inactive_has('__WS_A__'::uuid, '__SUSA__'::uuid),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

SELECT pg_temp._expect_deny(
  'C4 restaurar REMOVIDO é negado',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('remA.wsA'))$q$,
  'only suspended memberships can be restored%');

SELECT pg_temp._expect_deny(
  'C5 restaurar coordenação PAR suspensa é negado',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('susCoord.wsA'))$q$,
  'administrative or coordination memberships cannot be restored%');

SELECT pg_temp._expect_deny(
  'C6 restaurar admin de workspace suspenso é negado',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('susAdm.wsA'))$q$,
  'administrative or coordination memberships cannot be restored%');

-- coord_b (só wsB) tentando restaurar em wsA.
SELECT pg_temp._login('__COORD_B__'::uuid);
SELECT pg_temp._expect_deny(
  'C7 coord_b não restaura em wsA (fora do escopo)',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('remA.wsA'))$q$,
  'only an active coordinator of this unit can restore%');

-- não-coordenador.
SELECT pg_temp._login('__USER_PLN__'::uuid);
SELECT pg_temp._expect_deny(
  'C8 técnico comum não restaura',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('susAdm.wsA'))$q$,
  'only an active coordinator of this unit can restore%');
SELECT pg_temp._chk(
  'C9 não-coordenador não lê inativos',
  pg_temp._inactive_n('__WS_A__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._inactive_n('__WS_A__'::uuid)), 0, pg_temp._inactive_n('__WS_A__'::uuid));

-- ================= C': managed_by não recriado =================
SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT pg_temp._expect_ok(
  "C'1 suspender liderS (gestor de tecS)",
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('liderS.wsA'))$q$);
SELECT pg_temp._chk(
  "C'2 tecS neutralizado (managed_by NULL)",
  pg_temp._managed(pg_temp._mid('tecS.wsA')) IS NULL,
  'null'::jsonb, to_jsonb(pg_temp._managed(pg_temp._mid('tecS.wsA'))), 0, (pg_temp._managed(pg_temp._mid('tecS.wsA')) IS NULL)::int);
SELECT pg_temp._expect_ok(
  "C'3 restaurar liderS",
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('liderS.wsA'))$q$);
SELECT pg_temp._chk(
  "C'4 restauração NÃO recria managed_by de tecS",
  pg_temp._managed(pg_temp._mid('tecS.wsA')) IS NULL,
  'null'::jsonb, to_jsonb(pg_temp._managed(pg_temp._mid('tecS.wsA'))), 0, (pg_temp._managed(pg_temp._mid('tecS.wsA')) IS NULL)::int);

-- ================= D: hardening de cargo em suspend/remove =================
SELECT pg_temp._expect_deny(
  'D1 suspender coordenação PAR é negado',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('coord_c.wsA'))$q$,
  'administrative or coordination memberships cannot be suspended%');

SELECT pg_temp._expect_deny(
  'D2 remover coordenação PAR é negado',
  $q$SELECT public.coordinator_remove_membership(pg_temp._mid('coord_c.wsA'))$q$,
  'administrative or coordination memberships cannot be removed%');

SELECT pg_temp._expect_deny(
  'D3 suspender admin de workspace é negado',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('adm_a.wsA'))$q$,
  'administrative or coordination memberships cannot be suspended%');

SELECT pg_temp._expect_deny(
  'D4 remover admin de workspace é negado',
  $q$SELECT public.coordinator_remove_membership(pg_temp._mid('adm_a.wsA'))$q$,
  'administrative or coordination memberships cannot be removed%');

SELECT pg_temp._expect_ok(
  'D5 suspender tecA1 (membro comum) segue permitido',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('tecA1.wsA'))$q$);
SELECT pg_temp._expect_ok(
  'D6 restaurar tecA1',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('tecA1.wsA'))$q$);
SELECT pg_temp._expect_ok(
  'D7 remover tecA1 (membro comum) segue permitido',
  $q$SELECT public.coordinator_remove_membership(pg_temp._mid('tecA1.wsA'))$q$);

-- ================= E: auditoria =================
SELECT pg_temp._chk(
  'E1 restauração auditada (membership_changed suspended->active)',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__SUSA__'
      AND meta->>'prev_status' = 'suspended' AND meta->>'new_status' = 'active'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'E2 nenhuma action nova de status/role',
  NOT EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action IN ('membership_approved', 'membership_rejected',
                     'membership_suspended', 'membership_restored',
                     'membership_role_changed', 'membership_manager_changed')),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- ================= F: ACL no catálogo REAL =================
SELECT pg_temp._chk(
  'F1 anon NÃO executa coordinator_get_inactive_members',
  NOT has_function_privilege('anon', 'public.coordinator_get_inactive_members(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'F2 authenticated EXECUTA coordinator_get_inactive_members',
  has_function_privilege('authenticated', 'public.coordinator_get_inactive_members(uuid)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk(
  'F3 authenticated EXECUTA coordinator_get_requests',
  has_function_privilege('authenticated', 'public.coordinator_get_requests(uuid)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk(
  'F4 anon NÃO executa coordinator_restore_membership',
  NOT has_function_privilege('anon', 'public.coordinator_restore_membership(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

-- ================= X: integridade final =================
SELECT pg_temp._chk(
  'X1 nenhum profiles.role tocado pelas RPCs',
  (SELECT count(*) FROM public.profiles p
     JOIN _role0 r ON r.id = p.id
    WHERE p.role IS DISTINCT FROM r.role) = 0,
  '0'::jsonb, to_jsonb('checked'::text), 0, 0);

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
        print("[validate-066] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes",
              file=sys.stderr)
        return 2
    body = SQL
    for tok, val in T.items():
        body = body.replace(tok, val)
    body = body.replace("__USERS__", USERS_SQL)
    body = body.replace("__ROLE_UPDATES__", ROLE_UPDATES)
    body = body.replace("__MEMBERSHIP_ROWS__", MEMBERSHIP_ROWS)
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
        print(f"\n[OK] VALIDACAO 066 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
