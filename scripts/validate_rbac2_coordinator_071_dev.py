#!/usr/bin/env python3
"""Validação COMPORTAMENTAL da migration 071 (membros ATIVOS pelo Coordenador).

Roda TUDO em UMA transação (um único request à Management API): fixtures,
chamadas e asserts avaliados em SQL — termina com ROLLBACK: zero resíduo no
banco (mesmo padrão de validate_rbac2_coordinator_066_dev.py).

Cenário (Fase 11 — matriz adversarial):
  coord_a   : coordenador só wsA (ator principal)
  coord_b   : coordenador só wsB (fora do escopo de wsA)
  coord_c   : coordenador PAR de coord_a em wsA (ativo — NÃO pode aparecer)
  adm_a     : admin de workspace (role adm) ativo em wsA (NÃO pode aparecer)
  lider1    : liderança wsA gerida pela coordenação (ativo — aparece)
  tec1      : técnico wsA na equipe de lider1 (ativo — aparece)
  tecU      : técnico wsA ATIVO SEM responsável (managed_by = NULL — aparece)
  pend1     : solicitação PENDING wsA (NÃO pode aparecer)
  susA      : técnico wsA SUSPENSO (NÃO pode aparecer)
  remA      : técnico wsA REMOVIDO (NÃO pode aparecer)
  user_pln  : técnico wsA sem coordenação (negado)

Asserts cobrem:
  A  leitura escopada de ativos: inclui liderança, membro de equipe e o membro
     sem responsável (managed_by NULL); projeção de perfil completa;
  B  exclusões: pending/suspended/removed NÃO aparecem; adm/coordinator (par)
     NÃO aparecem (linha vermelha);
  C  fora do escopo: coord_b não lê wsA; coord_a não lê wsB;
  D  não-coordenador não lê;
  E  ACL real no catálogo (anon NÃO executa; authenticated executa);
  X  integridade final (RPC de leitura não toca profiles.role).

Requer migrations 036..047, 065, 066 e 071 aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_coordinator_071_dev.py
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
    ["coord_a", "coord_b", "coord_c", "adm_a", "lider1", "tec1",
     "tecU", "pend1", "susA", "remA", "user_pln"], start=1)}

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

T = {
    "__WS_A__": WS_A, "__WS_B__": WS_B,
    "__COORD_A__": P["coord_a"], "__COORD_B__": P["coord_b"],
    "__COORD_C__": P["coord_c"], "__ADM_A__": P["adm_a"],
    "__LIDER1__": P["lider1"], "__TEC1__": P["tec1"], "__TECU__": P["tecU"],
    "__PEND1__": P["pend1"], "__SUSA__": P["susA"], "__REMA__": P["remA"],
    "__USER_PLN__": P["user_pln"],
}

PROFILE_ROLES = {
    "coord_a": "coordinator", "coord_b": "coordinator", "coord_c": "coordinator",
    "adm_a": "admin", "lider1": "lider", "tec1": "technician",
    "tecU": "technician", "pend1": "technician", "susA": "technician",
    "remA": "technician", "user_pln": "technician",
}

# (key, ws, slug, status)
MEMBERSHIP_SEED = [
    ("coord_a", "A", "coordinator", "active"),
    ("coord_b", "B", "coordinator", "active"),
    ("coord_c", "A", "coordinator", "active"),
    ("adm_a", "A", "adm", "active"),
    ("lider1", "A", "lider", "active"),
    ("tec1", "A", "tec", "active"),
    ("tecU", "A", "tec", "active"),
    ("pend1", "A", "tec", "pending"),
    ("susA", "A", "tec", "suspended"),
    ("remA", "A", "tec", "removed"),
    ("user_pln", "A", "tec", "active"),
]

ROLE_SLUG_TO_DB = {
    "coordinator": "coordinator", "adm": "adm", "lider": "lider",
    "tec": "technician", "vis": "viewer", "est": "est", "opv": "opv",
}

ROLE_UPDATES = "\n".join(
    f"UPDATE public.profiles SET status = 'active', role = '{PROFILE_ROLES[key]}' "
    f"WHERE id = '{P[key]}';"
    for key in PROFILE_ROLES
)

MEMBERSHIP_ROWS = ",\n".join(
    f"  ('{P[key]}', '{(WS_B if ws == 'B' else WS_A)}', '{ROLE_SLUG_TO_DB[slug]}', '{status}')"
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
CREATE FUNCTION pg_temp._login(p_pid uuid) RETURNS void AS $f$
  SELECT set_config('request.jwt.claim.sub', p_pid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_pid, 'role', 'authenticated')::text, true);
$f$ LANGUAGE sql VOLATILE;
CREATE TEMP TABLE _m(key text PRIMARY KEY, mid uuid, pid uuid);
CREATE FUNCTION pg_temp._mid(p_key text) RETURNS uuid AS $f$
  SELECT mid FROM _m WHERE key = p_key;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._members_n(p_ws uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.coordinator_get_members(p_ws);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._members_has(p_ws uuid, p_pid uuid) RETURNS boolean AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.coordinator_get_members(p_ws) WHERE profile_id = p_pid);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._members_name(p_ws uuid, p_pid uuid) RETURNS text AS $f$
  SELECT profile_name FROM public.coordinator_get_members(p_ws) WHERE profile_id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._members_managed(p_ws uuid, p_pid uuid) RETURNS uuid AS $f$
  SELECT managed_by FROM public.coordinator_get_members(p_ws) WHERE profile_id = p_pid;
$f$ LANGUAGE sql STABLE;

-- ---------------- fixtures
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST', 'ws-alpha-test-071'),
  ('__WS_B__', 'WS Beta TEST',  'ws-beta-test-071');

INSERT INTO auth.users (id, email) VALUES
  __USERS__;

INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, v.status
FROM (VALUES
__MEMBERSHIP_ROWS__
) AS v(pid, ws, role_slug, status)
JOIN public.roles r ON r.slug = v.role_slug;

__ROLE_UPDATES__

-- Snapshot dos cargos globais ANTES de qualquer RPC (X1: RPC é de leitura).
CREATE TEMP TABLE _role0 AS
SELECT id, role FROM public.profiles WHERE id::text LIKE '__PFX__%';

INSERT INTO _m(key, mid, pid)
SELECT s.key, m.id, m.profile_id
FROM (VALUES
  ('coord_a.wsA', '__COORD_A__', '__WS_A__'),
  ('coord_b.wsB', '__COORD_B__', '__WS_B__'),
  ('coord_c.wsA', '__COORD_C__', '__WS_A__'),
  ('adm_a.wsA',   '__ADM_A__',   '__WS_A__'),
  ('lider1.wsA',  '__LIDER1__',  '__WS_A__'),
  ('tec1.wsA',    '__TEC1__',    '__WS_A__'),
  ('tecU.wsA',    '__TECU__',    '__WS_A__'),
  ('pend1.wsA',   '__PEND1__',   '__WS_A__'),
  ('susA.wsA',    '__SUSA__',    '__WS_A__'),
  ('remA.wsA',    '__REMA__',    '__WS_A__'),
  ('user_pln.wsA','__USER_PLN__','__WS_A__')
) s(key, pid, ws)
JOIN public.memberships m ON m.profile_id = s.pid::uuid AND m.workspace_id = s.ws::uuid;

-- Árvore montada pelo CAMINHO REAL (RPC 047) como coord_a: lider1 -> tec1.
SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT public.coordinator_set_manager(pg_temp._mid('lider1.wsA'), pg_temp._mid('coord_a.wsA'));
SELECT public.coordinator_set_manager(pg_temp._mid('tec1.wsA'),   pg_temp._mid('lider1.wsA'));

-- ================= A: leitura escopada de ativos (como coord_a) =================
SELECT pg_temp._chk(
  'A0 membros(wsA) inclui o membro SEM responsável (tecU, managed_by NULL)',
  pg_temp._members_has('__WS_A__'::uuid, '__TECU__'::uuid)
    AND pg_temp._members_managed('__WS_A__'::uuid, '__TECU__'::uuid) IS NULL,
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'A1 membros(wsA) inclui a liderança da unidade (lider1)',
  pg_temp._members_has('__WS_A__'::uuid, '__LIDER1__'::uuid),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'A2 membros(wsA) inclui o membro da equipe (tec1)',
  pg_temp._members_has('__WS_A__'::uuid, '__TEC1__'::uuid),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'A3 projeção traz profile_name do membro sem responsável (não vazio)',
  pg_temp._members_name('__WS_A__'::uuid, '__TECU__'::uuid) LIKE '%tecU%',
  to_jsonb('test.tecU'::text), to_jsonb(pg_temp._members_name('__WS_A__'::uuid, '__TECU__'::uuid)), 1, 1);

-- ================= B: exclusões (status e linha vermelha) =================
SELECT pg_temp._chk(
  'B1 PENDING NÃO aparece como membro ativo',
  NOT pg_temp._members_has('__WS_A__'::uuid, '__PEND1__'::uuid),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

SELECT pg_temp._chk(
  'B2 SUSPENDED NÃO aparece como membro ativo',
  NOT pg_temp._members_has('__WS_A__'::uuid, '__SUSA__'::uuid),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

SELECT pg_temp._chk(
  'B3 REMOVED NÃO aparece como membro ativo',
  NOT pg_temp._members_has('__WS_A__'::uuid, '__REMA__'::uuid),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

SELECT pg_temp._chk(
  'B4 coordenação PAR (coord_c) NÃO aparece (linha vermelha)',
  NOT pg_temp._members_has('__WS_A__'::uuid, '__COORD_C__'::uuid),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

SELECT pg_temp._chk(
  'B5 admin de workspace (adm_a) NÃO aparece (linha vermelha)',
  NOT pg_temp._members_has('__WS_A__'::uuid, '__ADM_A__'::uuid),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);

-- ================= C: fora do escopo =================
SELECT pg_temp._login('__COORD_B__'::uuid);
SELECT pg_temp._chk(
  'C1 coord_b (só wsB) NÃO lê membros de wsA',
  pg_temp._members_n('__WS_A__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._members_n('__WS_A__'::uuid)), 0, pg_temp._members_n('__WS_A__'::uuid));

SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT pg_temp._chk(
  'C2 coord_a NÃO lê membros de wsB (fora do escopo)',
  pg_temp._members_n('__WS_B__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._members_n('__WS_B__'::uuid)), 0, pg_temp._members_n('__WS_B__'::uuid));

-- ================= D: não-coordenador =================
SELECT pg_temp._login('__USER_PLN__'::uuid);
SELECT pg_temp._chk(
  'D1 técnico comum NÃO lê membros (fail-closed)',
  pg_temp._members_n('__WS_A__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._members_n('__WS_A__'::uuid)), 0, pg_temp._members_n('__WS_A__'::uuid));

-- ================= E: ACL no catálogo REAL =================
SELECT pg_temp._chk(
  'E1 anon NÃO executa coordinator_get_members',
  NOT has_function_privilege('anon', 'public.coordinator_get_members(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'E2 authenticated EXECUTA coordinator_get_members',
  has_function_privilege('authenticated', 'public.coordinator_get_members(uuid)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- ================= X: integridade final =================
SELECT pg_temp._chk(
  'X1 nenhum profiles.role tocado (RPC de leitura)',
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
        print("[validate-071] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes",
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
        print(f"\n[OK] VALIDACAO 071 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())