#!/usr/bin/env python3
"""Validacao COMPORTAMENTAL da migration 070 (Central do Coordenador - Fase 1).

Roda TUDO em UMA transacao (um unico request a Management API): fixtures,
chamadas a `get_coordinator_unit_overview` e asserts avaliados em SQL -
termina com ROLLBACK: zero residuo no banco (mesmo padrao de
validate_rbac2_coordinator_065/069_dev.py).

Escopo: a RPC nova de leitura agregada da unidade de chamados deve
  1. permitir o coordenador ATIVO da unidade (caminho feliz) e devolver a
     estrutura esperada com os numeros CORRETOS:
       wsA: open=2, in_progress=3, unassigned=4, high_priority=2, urgent=1,
            recent = [t3,t1,t2,t4,t5] (5 por updatedAt desc, sem arquivados);
  2. NEGAR explicitamente (RAISE) coordenador de outra unidade;
  3. NEGAR usuario sem coordenacao (tecnico comum);
  4. NEGAR usuario sem membership ATIVA (coordinator suspenso);
  5. NEGAR super admin SEM membership de coordenacao (is_coordinator_of e a
     autoridade; segue o padrao das RPCs 047 - is_super_admin NAO da bypass);
  6. devolver zeros honenos para unidade coordenada VAZIA (wsC: tudo 0, recent []);
  7. NAO contar chamados de outras unidades (b1/b2 de wsB);
  8. NAO contar status fora do escopo (resolvido/fechado) nem arquivados
     (t8 archived=true);
  9. diferenciar por status (open vs in_progress);
 10. diferenciar por prioridade (high_priority vs urgent);
 11. PROPAGAR erro de consulta (DROP da tabela dentro da transacao), nunca
     virar zero silencioso;
 12. devolver shape valido (object com workspace/tickets/recent; recent array).

Cenario:
  coord_a   : coordenador ATIVO de wsA (ator principal)
  coord_b   : coordenador ATIVO de wsB (outro escopo)
  coord_z   : coordenador SEM unidade (sem memberships)
  user_pln  : tecnico ATIVO de wsA (nao-coordenador)
  sus_coord : coordinator SUSPENSO de wsA (membership nao ativa)
  sup_adm   : super admin por profiles.role SEM membership de coordenacao
  wsA/wsB/wsC: unidades (wsC coordenada por coord_a, sem chamados)

Requer migrations 036..047 e 070 aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_coordinator_070_dev.py
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
WS_C = "33333333-3333-3333-3333-333333333333"

PFX = "ffffffff-0000-0000-0000-0000000000"
P = {k: f"{PFX}{i:02d}" for i, k in enumerate(
    ["coord_a", "coord_b", "coord_z", "user_pln", "sus_coord", "sup_adm"],
    start=1)}

# Chamados com ids deterministicos (para asserts de recent por id).
TK = {
    "t1": "a1000000-0000-4000-8000-000000000001",
    "t2": "a2000000-0000-4000-8000-000000000002",
    "t3": "a3000000-0000-4000-8000-000000000003",
    "t4": "a4000000-0000-4000-8000-000000000004",
    "t5": "a5000000-0000-4000-8000-000000000005",
    "t6": "a6000000-0000-4000-8000-000000000006",
    "t7": "a7000000-0000-4000-8000-000000000007",
    "t8": "a8000000-0000-4000-8000-000000000008",
    "b1": "b1000000-0000-4000-8000-000000000001",
    "b2": "b2000000-0000-4000-8000-000000000002",
}

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.070.{key}@example.com')" for key, pid in P.items()
)

# profiles.role (coluna global; NAO e usada como autorizacao de escopo).
PROFILE_ROLES = {
    "coord_a": "coordinator", "coord_b": "coordinator", "coord_z": "coordinator",
    "user_pln": "technician", "sus_coord": "coordinator", "sup_adm": "superadmin",
}

# memberships: (key, workspace, slug, status) — sup_adm fica SEM membership.
MEMBERSHIP_ROWS = [
    ("coord_a", "__WS_A__", "coordinator", "active"),
    ("coord_b", "__WS_B__", "coordinator", "active"),
    ("user_pln", "__WS_A__", "tec", "active"),
    ("sus_coord", "__WS_A__", "coordinator", "suspended"),
    ("coord_a", "__WS_C__", "coordinator", "active"),
]

_WS = {"__WS_A__": WS_A, "__WS_B__": WS_B, "__WS_C__": WS_C}

MEMBERSHIP_SQL = ",\n".join(
    f"  ('{P[key]}', '{_WS[ws]}', '{slug}', '{status}')"
    for key, ws, slug, status in MEMBERSHIP_ROWS
)

# (key, ws, status, priority, assignedToUserId, createdAt, updatedAt, archived)
TICKET_ROWS = [
    ("t1", "__WS_A__", "aberto",        "normal",  "",     "2026-01-01T09:00:00Z", "2026-01-10T10:00:00Z", "false"),
    ("t2", "__WS_A__", "a_caminho",     "normal",  "",     "2026-01-02T09:00:00Z", "2026-01-09T10:00:00Z", "false"),
    ("t3", "__WS_A__", "em_atendimento","alta",    "u-3",  "2026-01-03T09:00:00Z", "2026-01-11T10:00:00Z", "false"),
    ("t4", "__WS_A__", "em_atendimento","urgente", "",     "2026-01-04T09:00:00Z", "2026-01-08T10:00:00Z", "false"),
    ("t5", "__WS_A__", "aberto",        "alta",    "",     "2026-01-05T09:00:00Z", "2026-01-07T10:00:00Z", "false"),
    ("t6", "__WS_A__", "resolvido",     "urgente", "u-6",  "2026-01-06T09:00:00Z", "2026-01-06T10:00:00Z", "false"),
    ("t7", "__WS_A__", "fechado",       "normal",  "u-7",  "2026-01-07T09:00:00Z", "2026-01-05T10:00:00Z", "false"),
    ("t8", "__WS_A__", "aberto",        "normal",  "",     "2026-01-08T09:00:00Z", "2026-01-12T10:00:00Z", "true"),
    ("b1", "__WS_B__", "aberto",        "urgente", "",     "2026-01-01T09:00:00Z", "2026-01-06T10:00:00Z", "false"),
    ("b2", "__WS_B__", "em_atendimento","alta",    "",     "2026-01-01T09:00:00Z", "2026-01-05T10:00:00Z", "false"),
]
TICKET_SQL = ",\n".join(
    f"  ('{TK[key]}', '{_WS[ws]}', '{status}', '{priority}', '{assigned}',"
    f" '{created}', '{updated}', {archived})"
    for key, ws, status, priority, assigned, created, updated, archived in TICKET_ROWS
)

T = {
    "__WS_A__": WS_A, "__WS_B__": WS_B, "__WS_C__": WS_C,
    "__COORD_A__": P["coord_a"], "__COORD_B__": P["coord_b"],
    "__COORD_Z__": P["coord_z"], "__USER_PLN__": P["user_pln"],
    "__SUS_COORD__": P["sus_coord"], "__SUP_ADM__": P["sup_adm"],
    "__T1__": TK["t1"], "__T2__": TK["t2"], "__T3__": TK["t3"],
    "__T4__": TK["t4"], "__T5__": TK["t5"], "__T6__": TK["t6"],
    "__T7__": TK["t7"], "__T8__": TK["t8"], "__B1__": TK["b1"],
    "__B2__": TK["b2"],
}

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
-- _expect_error: exige UMA excecao qualquer (nao so negacao de autorizacao) -
-- usada para provar que erro de consulta PROPAGA em vez de virar zero.
CREATE FUNCTION pg_temp._expect_error(p_name text, p_sql text, p_like text) RETURNS void AS $f$
BEGIN
  EXECUTE p_sql;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES (p_name, false, to_jsonb(p_like), to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES (p_name, SQLERRM LIKE p_like, to_jsonb(p_like), to_jsonb(SQLERRM), 1, 1);
END;
$f$ LANGUAGE plpgsql;
CREATE FUNCTION pg_temp._login(p_pid uuid) RETURNS void AS $f$
  SELECT set_config('request.jwt.claim.sub', p_pid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_pid, 'role', 'authenticated')::text, true);
$f$ LANGUAGE sql VOLATILE;
CREATE FUNCTION pg_temp._logout() RETURNS void AS $f$
  SELECT set_config('request.jwt.claim.sub', NULL::text, true),
         set_config('request.jwt.claims', NULL::text, true);
$f$ LANGUAGE sql VOLATILE;
CREATE FUNCTION pg_temp._ov(p_ws uuid) RETURNS jsonb AS $f$
  SELECT public.get_coordinator_unit_overview(p_ws);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._num(p_ws text, p_key text) RETURNS int AS $f$
  SELECT (pg_temp._ov(p_ws::uuid) #>> ARRAY['tickets', p_key])::int;
$f$ LANGUAGE sql STABLE;

-- ---------------- fixtures
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST 070', 'ws-alpha-test-070'),
  ('__WS_B__', 'WS Beta TEST 070',  'ws-beta-test-070'),
  ('__WS_C__', 'WS Gamma TEST 070', 'ws-gamma-test-070');

INSERT INTO auth.users (id, email) VALUES
  __USERS__;

__PROFILE_UPDATES__

INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, v.status
FROM (VALUES
__MEMBERSHIP_ROWS__
) AS v(pid, ws, slug, status)
JOIN public.roles r ON r.slug = v.slug;

INSERT INTO public.chamados_tickets
  (id, "workspace_id", "roomName", "problemCategory", status, "priority",
   "assignedToUserId", "createdAt", "updatedAt", "archived")
VALUES
__TICKET_ROWS__;

-- ================= 1: caminho feliz - coordenador ATIVO de wsA =================
SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT pg_temp._chk(
  '1a shape do retorno (objeto com workspace/tickets/recent)',
  jsonb_typeof(pg_temp._ov('__WS_A__'::uuid)) = 'object'
    AND jsonb_typeof(pg_temp._ov('__WS_A__'::uuid) -> 'workspace') = 'object'
    AND jsonb_typeof(pg_temp._ov('__WS_A__'::uuid) -> 'tickets') = 'object'
    AND jsonb_typeof(pg_temp._ov('__WS_A__'::uuid) -> 'recent') = 'array',
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk(
  '1b unit_name de wsA devolvido',
  pg_temp._ov('__WS_A__'::uuid) #>> ARRAY['workspace', 'name'] = 'WS Alpha TEST 070',
  'WS Alpha TEST 070'::jsonb,
  to_jsonb(pg_temp._ov('__WS_A__'::uuid) #>> ARRAY['workspace', 'name']), 1, 1);

-- ================= 9/10: totalizacao por status e prioridade =================
SELECT pg_temp._chk('9a open = 2',  pg_temp._num('__WS_A__', 'open') = 2,          '2'::jsonb, to_jsonb(pg_temp._num('__WS_A__', 'open')), 1, 1);
SELECT pg_temp._chk('9b in_progress = 3', pg_temp._num('__WS_A__', 'in_progress') = 3, '3'::jsonb, to_jsonb(pg_temp._num('__WS_A__', 'in_progress')), 1, 1);
SELECT pg_temp._chk('8a resolvido/fechado nao contam (open+in_progress = 5)',
  pg_temp._num('__WS_A__', 'open') + pg_temp._num('__WS_A__', 'in_progress') = 5,
  '5'::jsonb,
  to_jsonb(pg_temp._num('__WS_A__', 'open') + pg_temp._num('__WS_A__', 'in_progress')), 1, 1);
SELECT pg_temp._chk('10a high_priority = 2', pg_temp._num('__WS_A__', 'high_priority') = 2, '2'::jsonb, to_jsonb(pg_temp._num('__WS_A__', 'high_priority')), 1, 1);
SELECT pg_temp._chk('10b urgent = 1',  pg_temp._num('__WS_A__', 'urgent') = 1,      '1'::jsonb, to_jsonb(pg_temp._num('__WS_A__', 'urgent')), 1, 1);

-- ================= 8c: archived nao conta (t8 aberto+archived) =================
SELECT pg_temp._chk('8b aberto arquivado nao conta no open',
  pg_temp._num('__WS_A__', 'open') = 2,
  '2'::jsonb, to_jsonb(pg_temp._num('__WS_A__', 'open')), 1, 1);

-- ================= unassigned: prioridade de atendimento sem dono =================
SELECT pg_temp._chk('unassigned = 4 (t1,t2,t4,t5)',
  pg_temp._num('__WS_A__', 'unassigned') = 4,
  '4'::jsonb, to_jsonb(pg_temp._num('__WS_A__', 'unassigned')), 1, 1);

-- ================= 7: cross-unit =================
SELECT pg_temp._chk('7a chamados de wsB nao contam em wsA',
  pg_temp._num('__WS_A__', 'open') = 2 AND pg_temp._num('__WS_A__', 'urgent') = 1,
  '2/1'::jsonb,
  to_jsonb(concat_ws('/', pg_temp._num('__WS_A__', 'open'), pg_temp._num('__WS_A__', 'urgent'))), 1, 1);

-- ================= recent (exibicao) =================
SELECT pg_temp._chk('12a recent tem 5 itens (t3,t1,t2,t4,t5)',
  (SELECT jsonb_array_length(pg_temp._ov('__WS_A__'::uuid) -> 'recent')) = 5
    AND (pg_temp._ov('__WS_A__'::uuid) -> 'recent' -> 0 ->> 'id') = '__T3__'
    AND (pg_temp._ov('__WS_A__'::uuid) -> 'recent' -> 1 ->> 'id') = '__T1__'
    AND (pg_temp._ov('__WS_A__'::uuid) -> 'recent' -> 2 ->> 'id') = '__T2__'
    AND (pg_temp._ov('__WS_A__'::uuid) -> 'recent' -> 3 ->> 'id') = '__T4__'
    AND (pg_temp._ov('__WS_A__'::uuid) -> 'recent' -> 4 ->> 'id') = '__T5__',
  '5 items'::jsonb, to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk('12b recent exclui arquivado e cross-unit',
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(pg_temp._ov('__WS_A__'::uuid) -> 'recent') r
    WHERE r ->> 'id' IN ('__T8__', '__B1__', '__B2__')),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- ================= 6: unidade coordenada VAZIA =================
SELECT pg_temp._chk('6a unidade vazia devolve zeros (wsC)',
  pg_temp._num('__WS_C__', 'open') = 0
    AND pg_temp._num('__WS_C__', 'in_progress') = 0
    AND pg_temp._num('__WS_C__', 'unassigned') = 0
    AND pg_temp._num('__WS_C__', 'high_priority') = 0
    AND pg_temp._num('__WS_C__', 'urgent') = 0,
  '0/0/0/0/0'::jsonb,
  to_jsonb(concat_ws('/',
    pg_temp._num('__WS_C__', 'open'), pg_temp._num('__WS_C__', 'in_progress'),
    pg_temp._num('__WS_C__', 'unassigned'), pg_temp._num('__WS_C__', 'high_priority'),
    pg_temp._num('__WS_C__', 'urgent'))), 1, 1);
SELECT pg_temp._chk('6b unidade vazia devolve recent vazio',
  jsonb_array_length(pg_temp._ov('__WS_C__'::uuid) -> 'recent') = 0,
  '0'::jsonb,
  to_jsonb(jsonb_array_length(pg_temp._ov('__WS_C__'::uuid) -> 'recent')), 1, 1);
SELECT pg_temp._chk('6c nome da unidade vazia ainda sai',
  pg_temp._ov('__WS_C__'::uuid) #>> ARRAY['workspace', 'name'] = 'WS Gamma TEST 070',
  'WS Gamma TEST 070'::jsonb,
  to_jsonb(pg_temp._ov('__WS_C__'::uuid) #>> ARRAY['workspace', 'name']), 1, 1);

-- ================= 2/3/4/5: NEGACAO explicita (fail-closed, nada de zeros falsos) =================
SELECT pg_temp._login('__COORD_B__'::uuid);
SELECT pg_temp._expect_deny(
  '2 coordenador de OUTRA unidade negado',
  $q$SELECT public.get_coordinator_unit_overview('__WS_A__'::uuid)$q$,
  '%only an active coordinator of this unit can view its overview%');

SELECT pg_temp._login('__USER_PLN__'::uuid);
SELECT pg_temp._expect_deny(
  '3 usuario sem coordenacao negado (tecnico)',
  $q$SELECT public.get_coordinator_unit_overview('__WS_A__'::uuid)$q$,
  '%only an active coordinator of this unit can view its overview%');

SELECT pg_temp._login('__SUS_COORD__'::uuid);
SELECT pg_temp._expect_deny(
  '4 usuario sem membership ATIVA negado (suspenso)',
  $q$SELECT public.get_coordinator_unit_overview('__WS_A__'::uuid)$q$,
  '%only an active coordinator of this unit can view its overview%');

SELECT pg_temp._login('__COORD_Z__'::uuid);
SELECT pg_temp._expect_deny(
  '5a coordenador SEM unidade negado',
  $q$SELECT public.get_coordinator_unit_overview('__WS_A__'::uuid)$q$,
  '%only an active coordinator of this unit can view its overview%');

SELECT pg_temp._login('__SUP_ADM__'::uuid);
SELECT pg_temp._expect_deny(
  '5b super admin SEM membership negado (is_coordinator_of e a autoridade)',
  $q$SELECT public.get_coordinator_unit_overview('__WS_A__'::uuid)$q$,
  '%only an active coordinator of this unit can view its overview%');

SELECT pg_temp._logout();
SELECT pg_temp._expect_deny(
  '5c sem sessao (auth.uid() nulo) negado',
  $q$SELECT public.get_coordinator_unit_overview('__WS_A__'::uuid)$q$,
  '%only an active coordinator of this unit can view its overview%');

-- coordinator consultando unidade que NAO coordena (wsB, de coord_b)
SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT pg_temp._expect_deny(
  '2b coordenador consultando unidade fora do escopo negado',
  $q$SELECT public.get_coordinator_unit_overview('__WS_B__'::uuid)$q$,
  '%only an active coordinator of this unit can view its overview%');

-- ================= 11: erro de consulta PROPAGA (nunca vira zero) =================
-- DROP dentro da transacao; a proxima chamada deve RAISAR, nao devolver 0.
DROP TABLE public.chamados_tickets;
SELECT pg_temp._expect_error(
  '11 erro de consulta propaga (tabela inexistente)',
  $q$SELECT public.get_coordinator_unit_overview('__WS_A__'::uuid)$q$,
  '%does not exist%');

-- ================= I: ACL no catalogo REAL =================
SELECT pg_temp._chk(
  'I1 anon NAO executa get_coordinator_unit_overview',
  NOT has_function_privilege('anon', 'public.get_coordinator_unit_overview(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'I2 authenticated EXECUTA get_coordinator_unit_overview',
  has_function_privilege('authenticated', 'public.get_coordinator_unit_overview(uuid)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

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
        print("[validate-070] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes",
              file=sys.stderr)
        return 2
    profile_updates = "\n".join(
        f"UPDATE public.profiles SET status='active', role='{role}' WHERE id='{P[key]}';"
        for key, role in PROFILE_ROLES.items()
    )
    body = SQL
    for tok, val in T.items():
        body = body.replace(tok, val)
    body = body.replace("__USERS__", USERS_SQL)
    body = body.replace("__MEMBERSHIP_ROWS__", MEMBERSHIP_SQL)
    body = body.replace("__TICKET_ROWS__", TICKET_SQL)
    body = body.replace("__PROFILE_UPDATES__", profile_updates)
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
        print(f"\n[OK] VALIDACAO 070 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())