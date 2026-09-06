#!/usr/bin/env python3
"""Validação SQL da trigger RBAC 2.0 (migration 041) contra o DEV.

Roda TUDO em UMA transação (um único request à Management API): fixtures,
mutações passo a passo e asserts avaliados em SQL (sem roundtrips entre
statements — cada request tem sessão própria, então transações multi-request
NÃO funcionam). Termina com ROLLBACK: zero resíduo no banco.

Fiel ao fluxo real:
  - fixtures entram por INSERT em auth.users, disparando o trigger real de
    signup (handle_new_user), que cria profiles PENDENTES;
  - "aprovação" = UPDATE em profiles (mesmo caminho do adminService e do
    /api/push/action), disparando a trigger da 041.

Requer: migrations 040 (cargo coordinator) e 042 (profiles_role_check
alinhado) aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_trigger_dev.py
"""
from __future__ import annotations

import json
import os
import sys

import requests

REF = os.environ.get("SUPABASE_PROJECT_REF", "")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
WS_X = "99999999-9999-9999-9999-999999999999"  # inexistente
PFX = "aaaaaaaa-0000-0000-0000-0000000000"
P = {k: f"{PFX}{i:02d}" for i, k in enumerate(
    ["pend", "tec", "vis", "adm", "coord", "super", "roleleg", "inat"], start=1)}


def exp(wss: list[str], role: str) -> str:
    return json.dumps(
        [{"ws": w, "role": role, "st": "active"} for w in wss],
        separators=(",", ":"),
    )


# U = fluxo real de signup: INSERT em auth.users → handle_new_user cria
# profiles pending/viewer/{}/false via trigger.
USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

SQL = f"""
BEGIN;

CREATE TEMP TABLE _t(
  id serial PRIMARY KEY, name text, ok boolean,
  expected jsonb, actual jsonb, n_expected int, n_actual int
);
CREATE FUNCTION pg_temp._ms(p uuid) RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ws', m.workspace_id, 'role', r.slug, 'st', m.status) ORDER BY m.workspace_id), '[]'::jsonb)
  FROM public.memberships m JOIN public.roles r ON r.id = m.role_id
  WHERE m.profile_id = p;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._cnt(p uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.memberships m WHERE m.profile_id = p;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._chk(name text, ok boolean, exp jsonb, act jsonb, n_exp int, n_act int) RETURNS void AS $f$
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual) VALUES (name, ok, exp, act, n_exp, n_act);
$f$ LANGUAGE sql VOLATILE;

INSERT INTO public.workspaces (id, name, slug) VALUES
  ('{WS_A}', 'WS Alpha TEST', 'ws-alpha-test'),
  ('{WS_B}', 'WS Beta TEST',  'ws-beta-test');

INSERT INTO auth.users (id, email) VALUES
{USERS_SQL};

-- "Aprovação" dos fixtures (mesmo caminho do adminService): UPDATE em profiles
UPDATE public.profiles SET status='active', role='technician',   workspace_ids=ARRAY['{WS_A}','{WS_B}']::uuid[] WHERE id='{P["tec"]}';
UPDATE public.profiles SET status='active', role='viewer',       workspace_ids=ARRAY['{WS_A}']::uuid[]          WHERE id='{P["vis"]}';
UPDATE public.profiles SET status='active', role='admin',        workspace_ids=ARRAY['{WS_B}']::uuid[]          WHERE id='{P["adm"]}';
UPDATE public.profiles SET status='active', role='coordinator',  workspace_ids=ARRAY['{WS_A}','{WS_B}']::uuid[] WHERE id='{P["coord"]}';
UPDATE public.profiles SET status='active', role='admin',        workspace_ids=ARRAY['{WS_A}']::uuid[], is_super_admin=true WHERE id='{P["super"]}';
UPDATE public.profiles SET status='active', role='role-viewer',  workspace_ids=ARRAY['{WS_A}','{WS_B}']::uuid[] WHERE id='{P["roleleg"]}';
UPDATE public.profiles SET status='suspended', role='technician', workspace_ids=ARRAY['{WS_A}']::uuid[]          WHERE id='{P["inat"]}';

-- ---------------- A: fluxo real (signup pendente + aprovação)
SELECT pg_temp._chk('A1 signup pendente -> 0 memberships', true, '[]'::jsonb, pg_temp._ms('{P["pend"]}'), 0, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '[]'::jsonb;
SELECT pg_temp._chk('A2 aprovação technician -> tec x2', true, '{exp([WS_A, WS_B], "tec")}'::jsonb, pg_temp._ms('{P["tec"]}'), 2, pg_temp._cnt('{P["tec"]}'))
WHERE pg_temp._ms('{P["tec"]}') = '{exp([WS_A, WS_B], "tec")}'::jsonb;
SELECT pg_temp._chk('A3 aprovação viewer -> vis x1', true, '{exp([WS_A], "vis")}'::jsonb, pg_temp._ms('{P["vis"]}'), 1, pg_temp._cnt('{P["vis"]}'))
WHERE pg_temp._ms('{P["vis"]}') = '{exp([WS_A], "vis")}'::jsonb;
SELECT pg_temp._chk('A4 aprovação admin -> adm x1', true, '{exp([WS_B], "adm")}'::jsonb, pg_temp._ms('{P["adm"]}'), 1, pg_temp._cnt('{P["adm"]}'))
WHERE pg_temp._ms('{P["adm"]}') = '{exp([WS_B], "adm")}'::jsonb;
SELECT pg_temp._chk('A5 aprovação coordinator (042) -> x2', true, '{exp([WS_A, WS_B], "coordinator")}'::jsonb, pg_temp._ms('{P["coord"]}'), 2, pg_temp._cnt('{P["coord"]}'))
WHERE pg_temp._ms('{P["coord"]}') = '{exp([WS_A, WS_B], "coordinator")}'::jsonb;
SELECT pg_temp._chk('A6 super admin aprovado -> 0', true, '[]'::jsonb, pg_temp._ms('{P["super"]}'), 0, pg_temp._cnt('{P["super"]}'))
WHERE pg_temp._ms('{P["super"]}') = '[]'::jsonb;
SELECT pg_temp._chk('A7 formato legado role-viewer -> vis x2', true, '{exp([WS_A, WS_B], "vis")}'::jsonb, pg_temp._ms('{P["roleleg"]}'), 2, pg_temp._cnt('{P["roleleg"]}'))
WHERE pg_temp._ms('{P["roleleg"]}') = '{exp([WS_A, WS_B], "vis")}'::jsonb;
SELECT pg_temp._chk('A8 suspenso aprovado -> 0', true, '[]'::jsonb, pg_temp._ms('{P["inat"]}'), 0, pg_temp._cnt('{P["inat"]}'))
WHERE pg_temp._ms('{P["inat"]}') = '[]'::jsonb;

-- ---------------- ADV1: role fora do CHECK deve ser rejeitada (23514)
DO $d$
BEGIN
  UPDATE public.profiles SET status='active', role='role-bogus', workspace_ids=ARRAY['{WS_A}']::uuid[] WHERE id='{P["pend"]}';
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('ADV1 role-bogus rejeitada pelo CHECK', false, 'true'::jsonb, 'false'::jsonb, 1, 0);
EXCEPTION WHEN check_violation THEN
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('ADV1 role-bogus rejeitada pelo CHECK', true, 'true'::jsonb, 'true'::jsonb, 1, 1);
END $d$;

-- ---------------- M: mutações na mesma profile (P1, ainda pendente)
UPDATE public.profiles SET status='active', role='technician', workspace_ids=ARRAY['{WS_A}']::uuid[] WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M1 aprovação pendente -> tec x1', true, '{exp([WS_A], "tec")}'::jsonb, pg_temp._ms('{P["pend"]}'), 1, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '{exp([WS_A], "tec")}'::jsonb;

UPDATE public.profiles SET role='viewer' WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M2 troca role -> vis (upsert, 1 linha)', true, '{exp([WS_A], "vis")}'::jsonb, pg_temp._ms('{P["pend"]}'), 1, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '{exp([WS_A], "vis")}'::jsonb AND pg_temp._cnt('{P["pend"]}') = 1;

UPDATE public.profiles SET workspace_ids=ARRAY[]::uuid[] WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M3 workspace_ids vazio -> 0 (CASO 3)', true, '[]'::jsonb, pg_temp._ms('{P["pend"]}'), 0, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '[]'::jsonb;

UPDATE public.profiles SET workspace_ids=ARRAY['{WS_A}','{WS_B}']::uuid[] WHERE id='{P["pend"]}';
UPDATE public.profiles SET workspace_ids=ARRAY['{WS_A}','{WS_B}']::uuid[] WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M4 reativa + upsert idempotente x2', true, '{exp([WS_A, WS_B], "vis")}'::jsonb, pg_temp._ms('{P["pend"]}'), 2, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '{exp([WS_A, WS_B], "vis")}'::jsonb AND pg_temp._cnt('{P["pend"]}') = 2;

UPDATE public.profiles SET status='suspended' WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M4b suspensão -> 0', true, '[]'::jsonb, pg_temp._ms('{P["pend"]}'), 0, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '[]'::jsonb;
UPDATE public.profiles SET status='active' WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M4c reativação -> recria x2', true, '{exp([WS_A, WS_B], "vis")}'::jsonb, pg_temp._ms('{P["pend"]}'), 2, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '{exp([WS_A, WS_B], "vis")}'::jsonb;

UPDATE public.profiles SET is_super_admin=true WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M5 promoção super admin -> 0', true, '[]'::jsonb, pg_temp._ms('{P["pend"]}'), 0, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '[]'::jsonb;
UPDATE public.profiles SET is_super_admin=false WHERE id='{P["pend"]}';
SELECT pg_temp._chk('M5b reversão -> recria x2', true, '{exp([WS_A, WS_B], "vis")}'::jsonb, pg_temp._ms('{P["pend"]}'), 2, pg_temp._cnt('{P["pend"]}'))
WHERE pg_temp._ms('{P["pend"]}') = '{exp([WS_A, WS_B], "vis")}'::jsonb;

UPDATE public.profiles SET role='role-viewer' WHERE id='{P["tec"]}';
SELECT pg_temp._chk('M6 technician->legado role-viewer -> vis x2', true, '{exp([WS_A, WS_B], "vis")}'::jsonb, pg_temp._ms('{P["tec"]}'), 2, pg_temp._cnt('{P["tec"]}'))
WHERE pg_temp._ms('{P["tec"]}') = '{exp([WS_A, WS_B], "vis")}'::jsonb;

UPDATE public.profiles SET role='coordinator' WHERE id='{P["vis"]}';
SELECT pg_temp._chk('M7 viewer->coordinator (só wsA)', true, '{exp([WS_A], "coordinator")}'::jsonb, pg_temp._ms('{P["vis"]}'), 1, pg_temp._cnt('{P["vis"]}'))
WHERE pg_temp._ms('{P["vis"]}') = '{exp([WS_A], "coordinator")}'::jsonb;

-- ---------------- ADV2: workspace inexistente é ignorado sem abortar
UPDATE public.profiles SET workspace_ids=ARRAY['{WS_A}','{WS_X}']::uuid[] WHERE id='{P["adm"]}';
SELECT pg_temp._chk('ADV2 ws inexistente ignorado -> só wsA', true, '{exp([WS_A], "adm")}'::jsonb, pg_temp._ms('{P["adm"]}'), 1, pg_temp._cnt('{P["adm"]}'))
WHERE pg_temp._ms('{P["adm"]}') = '{exp([WS_A], "adm")}'::jsonb;

SELECT coalesce(bool_and(ok), false) AS all_ok,
       count(*) FILTER (WHERE NOT ok) AS fails,
       coalesce(jsonb_agg(name ORDER BY id) FILTER (WHERE NOT ok), '[]'::jsonb) AS failed,
       count(*) AS total_checks
FROM _t;

ROLLBACK;
"""


def main() -> int:
    if not REF or not TOKEN:
        print("[validate] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes", file=sys.stderr)
        return 2
    url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
    resp = requests.post(
        url,
        json={"query": SQL},
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        timeout=120,
    )
    print("HTTP:", resp.status_code)
    if resp.status_code >= 300:
        print(resp.text[:900], file=sys.stderr)
        return 2
    verdict = resp.json()
    print(json.dumps(verdict, indent=2, ensure_ascii=False))
    ok = bool(verdict) and verdict[0].get("all_ok") is True
    if ok:
        print(f"\n[OK] VALIDACAO COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
