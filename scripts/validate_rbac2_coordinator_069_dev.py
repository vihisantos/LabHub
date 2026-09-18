#!/usr/bin/env python3
"""Validacao COMPORTAMENTAL da migration 069 (Fase 5.3 - Trust Boundary de set_role).

Roda TUDO em UMA transacao (um unico request a Management API): fixtures,
mutacoes passo a passo e asserts avaliados em SQL - termina com ROLLBACK: zero
residuo no banco (mesmo padrao de validate_rbac2_coordinator_065/068_dev.py).

Escopo: `coordinator_set_role` deve continuar rejeitando cargos de INPUT fora da
whitelist tec|vis|est|opv|lider, deve AGORA rejeitar o ALVO `adm` (linha vermelha
nova da 069) e o ALVO `coordinator` (ja bloqueado na 065), preservando o caminho
feliz (tec->lider / tec->vis), o escopo por unidade, `active` como unico estado
de partida e a auditoria trigger-based (sem tocar `profiles.role` nem
`is_super_admin`).

Cenario:
  coord_a  : coordenador ativo de wsA (ator principal)
  coord_b  : coordenador ativo de wsB (outro escopo; tambem testa o proprio)
  coord_z  : coordenador SEM unidade (sem memberships)
  user_pln : tecnico ativo de wsA (nao-coordenador)
  adm_a    : membership ATIVA adm em wsA (linha vermelha da 069)
  adm_b    : membership ATIVA adm em wsB (linha vermelha vale no proprio escopo)
  tec_lid  : tecnico ativo de wsA (caminho feliz -> lider)
  tec_vis  : tecnico ativo de wsA (caminho feliz -> vis)
  lid_x    : lider ativo de wsA (alvo coordinator NAO; usado na integridade)
  sus_tec  : tecnico SUSPENSO de wsA (estado de partida invalido)

Asserts cobrem:
  A  INPUT fora da whitelist: 'adm', 'coordinator', 'root' negados;
  B  ALVO adm: rebaixar adm_a (para tec e para lider) negado; adm_a permanece
     adm+active; suspender/remover adm_a POR RPC segue negado (066);
  C  ALVO coordinator (par/raiz): set_role na propria membership coordinada
     negado;
  D  escopo fail-closed: coord_b fora da unidade, tecnico comum, coord sem
     unidade e membership inexistente negados;
  E  estado de partida: membership SUSPENSA nao pode mudar de cargo;
  F  caminho feliz: tec->lider e tec->vis funcionam; auditoria (054+065) grava
     membership_changed com meta role_id/prev_role/status/prev_status corretos;
     G  denials nao geram trilha de mutacao nem estado; integridade final
     (role_id/status/managed_by intactos nos alvos negados; profiles.role
     intocado);
  I  ACL real no catalogo (anon NAO executa; authenticated executa).

Requer migrations 036..047, 054, 065, 066, 068 e 069 aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_coordinator_069_dev.py
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
PFX = "ffffffff-0000-0000-0000-0000000000"
P = {k: f"{PFX}{i:02d}" for i, k in enumerate(
    ["coord_a", "coord_b", "coord_z", "user_pln",
     "adm_a", "adm_b", "tec_lid", "tec_vis", "lid_x", "sus_tec"], start=1)}

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

T = {
    "__WS_A__": WS_A, "__WS_B__": WS_B,
    "__COORD_A__": P["coord_a"], "__COORD_B__": P["coord_b"],
    "__COORD_Z__": P["coord_z"], "__USER_PLN__": P["user_pln"],
    "__ADM_A__": P["adm_a"], "__ADM_B__": P["adm_b"],
    "__TEC_LID__": P["tec_lid"], "__TEC_VIS__": P["tec_vis"],
    "__LID_X__": P["lid_x"], "__SUS_TEC__": P["sus_tec"],
}

# profiles.role (coluna global; o RPC nao a usa como autorizacao de cargo).
PROFILE_ROLES = {
    "coord_a": "coordinator", "coord_b": "coordinator", "coord_z": "coordinator",
    "user_pln": "technician", "adm_a": "technician", "adm_b": "technician",
    "tec_lid": "technician", "tec_vis": "technician",
    "lid_x": "technician", "sus_tec": "technician",
}

# memberships: (key, workspace, slug, status)
MEMBERSHIP_ROWS = [
    ("coord_a", "__WS_A__", "coordinator", "active"),
    ("coord_b", "__WS_B__", "coordinator", "active"),
    ("user_pln", "__WS_A__", "tec", "active"),
    ("adm_a", "__WS_A__", "adm", "active"),
    ("adm_b", "__WS_B__", "adm", "active"),
    ("tec_lid", "__WS_A__", "tec", "active"),
    ("tec_vis", "__WS_A__", "tec", "active"),
    ("lid_x", "__WS_A__", "lider", "active"),
    ("sus_tec", "__WS_A__", "tec", "suspended"),
]

_WS = {"__WS_A__": WS_A, "__WS_B__": WS_B}

MEMBERSHIP_SQL = ",\n".join(
    f"  ('{P[key]}', '{_WS[ws]}', '{slug}', '{status}')"
    for key, ws, slug, status in MEMBERSHIP_ROWS
)

M_KEYS = [
    ("coord_a.wsa", "coord_a", "__WS_A__"),
    ("coord_b.wsb", "coord_b", "__WS_B__"),
    ("user_pln.wsa", "user_pln", "__WS_A__"),
    ("adm_a.wsa", "adm_a", "__WS_A__"),
    ("adm_b.wsb", "adm_b", "__WS_B__"),
    ("tec_lid.wsa", "tec_lid", "__WS_A__"),
    ("tec_vis.wsa", "tec_vis", "__WS_A__"),
    ("lid_x.wsa", "lid_x", "__WS_A__"),
    ("sus_tec.wsa", "sus_tec", "__WS_A__"),
]
M_KEYS_SQL = ",\n".join(
    f"  ('{key}', '{P[k]}', '{_WS[ws]}')" for key, k, ws in M_KEYS
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
CREATE FUNCTION pg_temp._status(p_mid uuid) RETURNS text AS $f$
  SELECT status FROM public.memberships WHERE id = p_mid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._slug(p_mid uuid) RETURNS text AS $f$
  SELECT r.slug FROM public.memberships m JOIN public.roles r ON r.id = m.role_id WHERE m.id = p_mid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._mgr(p_mid uuid) RETURNS uuid AS $f$
  SELECT managed_by FROM public.memberships WHERE id = p_mid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._rid(p_slug text) RETURNS uuid AS $f$
  SELECT id FROM public.roles WHERE slug = p_slug;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._profile_role(p_pid uuid) RETURNS text AS $f$
  SELECT role FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
-- Mutacoes de membership (UPDATE) auditadas para o perfil; INSERT (fixture) nao conta.
CREATE FUNCTION pg_temp._mut_audit(p_pid uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.app_audit_logs
  WHERE entity_id = p_pid::text AND action = 'membership_changed';
$f$ LANGUAGE sql STABLE;

-- ---------------- fixtures
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST 069', 'ws-alpha-test-069'),
  ('__WS_B__', 'WS Beta TEST 069',  'ws-beta-test-069');

INSERT INTO auth.users (id, email) VALUES
  __USERS__;

__PROFILE_UPDATES__

INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, v.status
FROM (VALUES
__MEMBERSHIP_ROWS__
) AS v(pid, ws, slug, status)
JOIN public.roles r ON r.slug = v.slug;

INSERT INTO _m(key, mid, pid)
SELECT s.key, m.id, m.profile_id
FROM (VALUES
__M_KEYS__
) AS s(key, pid, ws)
JOIN public.memberships m ON m.profile_id = s.pid::uuid AND m.workspace_id = s.ws::uuid;

-- ================= A: INPUT fora da whitelist (como coord_a) =================
SELECT pg_temp._login('__COORD_A__'::uuid);

SELECT pg_temp._expect_deny(
  'A1 input slug adm negado',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_lid.wsa'), 'adm')$q$,
  'role adm cannot be assigned by a coordinator%');
SELECT pg_temp._expect_deny(
  'A2 input slug coordinator negado',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_lid.wsa'), 'coordinator')$q$,
  'role coordinator cannot be assigned by a coordinator%');
SELECT pg_temp._expect_deny(
  'A3 input slug fora da whitelist (root) negado',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_lid.wsa'), 'root')$q$,
  'role root cannot be assigned by a coordinator%');

-- ================= B: ALVO adm (linha vermelha da 069) =================
SELECT pg_temp._expect_deny(
  'B1 rebaixar adm_a para tec negado',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('adm_a.wsa'), 'tec')$q$,
  'administrative memberships cannot have their role changed by the RPC');
SELECT pg_temp._expect_deny(
  'B2 rebaixar adm_a para lider negado',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('adm_a.wsa'), 'lider')$q$,
  'administrative memberships cannot have their role changed by the RPC');
SELECT pg_temp._chk(
  'B3 adm_a segue adm + active',
  pg_temp._slug(pg_temp._mid('adm_a.wsa')) = 'adm'
    AND pg_temp._status(pg_temp._mid('adm_a.wsa')) = 'active',
  to_jsonb('adm/active'::text),
  to_jsonb(concat_ws('/', pg_temp._slug(pg_temp._mid('adm_a.wsa')),
                           pg_temp._status(pg_temp._mid('adm_a.wsa')))), 1, 1);
-- Bypass de 2 passos (rebaixar e depois suspender/remover) deve continuar fechado.
SELECT pg_temp._expect_deny(
  'B4 apos tentativas, suspender adm_a POR RPC segue negado (066)',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('adm_a.wsa'))$q$,
  'administrative or coordination memberships cannot be suspended by the RPC');
SELECT pg_temp._expect_deny(
  'B5 apos tentativas, remover adm_a POR RPC segue negado (066)',
  $q$SELECT public.coordinator_remove_membership(pg_temp._mid('adm_a.wsa'))$q$,
  'administrative or coordination memberships cannot be removed by the RPC');
SELECT pg_temp._chk(
  'B6 adm_a segue intacto apos B4/B5',
  pg_temp._slug(pg_temp._mid('adm_a.wsa')) = 'adm'
    AND pg_temp._status(pg_temp._mid('adm_a.wsa')) = 'active'
    AND pg_temp._mgr(pg_temp._mid('adm_a.wsa')) IS NULL,
  to_jsonb('adm/active/null'::text),
  to_jsonb(concat_ws('/', pg_temp._slug(pg_temp._mid('adm_a.wsa')),
                           pg_temp._status(pg_temp._mid('adm_a.wsa')),
                           coalesce(pg_temp._mgr(pg_temp._mid('adm_a.wsa'))::text, 'null'))), 1, 1);

-- ================= C: ALVO coordinator (par/raiz, 065) =================
SELECT pg_temp._expect_deny(
  'C1 trocar a propria membership coordenada negado',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('coord_a.wsa'), 'tec')$q$,
  'a coordination membership role cannot be changed by the RPC');

-- ================= D: escopo fail-closed =================
SELECT pg_temp._login('__COORD_B__'::uuid);
SELECT pg_temp._expect_deny(
  'D1 coord_b nao muda cargo em wsA (fora do escopo)',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_lid.wsa'), 'lider')$q$,
  'only an active coordinator of this unit can change membership roles');

SELECT pg_temp._login('__USER_PLN__'::uuid);
SELECT pg_temp._expect_deny(
  'D2 tecnico comum nao muda cargo',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_vis.wsa'), 'vis')$q$,
  'only an active coordinator of this unit can change membership roles');

SELECT pg_temp._login('__COORD_Z__'::uuid);
SELECT pg_temp._expect_deny(
  'D3 coord sem unidade nao muda cargo',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_lid.wsa'), 'lider')$q$,
  'only an active coordinator of this unit can change membership roles');

SELECT pg_temp._expect_deny(
  'D4 membership inexistente negada',
  $q$SELECT public.coordinator_set_role('00000000-0000-0000-0000-0000000000ff'::uuid, 'tec')$q$,
  'membership not found%');

-- ================= E: estado de partida =================
SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT pg_temp._expect_deny(
  'E1 membership SUSPENSA nao muda de cargo',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('sus_tec.wsa'), 'vis')$q$,
  'only active memberships can have their role changed%');

-- ================= F: caminho feliz + auditoria =================
SELECT pg_temp._expect_ok(
  'F1 tec_lid -> lider',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_lid.wsa'), 'lider')$q$);
SELECT pg_temp._chk(
  'F2 tec_lid agora lider',
  pg_temp._slug(pg_temp._mid('tec_lid.wsa')) = 'lider',
  to_jsonb('lider'::text), to_jsonb(pg_temp._slug(pg_temp._mid('tec_lid.wsa'))), 1, 1);

SELECT pg_temp._expect_ok(
  'F3 tec_vis -> vis',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec_vis.wsa'), 'vis')$q$);
SELECT pg_temp._chk(
  'F4 tec_vis agora vis',
  pg_temp._slug(pg_temp._mid('tec_vis.wsa')) = 'vis',
  to_jsonb('vis'::text), to_jsonb(pg_temp._slug(pg_temp._mid('tec_vis.wsa'))), 1, 1);

SELECT pg_temp._chk(
  'F5 tec_lid auditado (membership_changed) com meta correto',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__TEC_LID__'
      AND meta->>'prev_role' = pg_temp._rid('tec')::text
      AND meta->>'role_id' = pg_temp._rid('lider')::text
      AND meta->>'prev_status' = 'active' AND meta->>'status' = 'active'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'F6 tec_vis auditado (membership_changed) com meta correto',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__TEC_VIS__'
      AND meta->>'prev_role' = pg_temp._rid('tec')::text
      AND meta->>'role_id' = pg_temp._rid('vis')::text
      AND meta->>'prev_status' = 'active' AND meta->>'status' = 'active'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'F7 exatamente 1 auditoria de mudanca de cargo para tec_lid',
  pg_temp._mut_audit('__TEC_LID__'::uuid) = 1,
  '1'::jsonb, to_jsonb(pg_temp._mut_audit('__TEC_LID__'::uuid)), 1, 1);

-- ================= G: deny nao loga nem deteriora estado =================
DO $g$
DECLARE before_n int; after_n int; sl_before text; st_before text;
BEGIN
  SELECT pg_temp._mut_audit('__ADM_A__'::uuid) INTO before_n;
  sl_before := pg_temp._slug(pg_temp._mid('adm_a.wsa'));
  st_before := pg_temp._status(pg_temp._mid('adm_a.wsa'));
  BEGIN
    PERFORM public.coordinator_set_role(pg_temp._mid('adm_a.wsa'), 'tec');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pg_temp._mut_audit('__ADM_A__'::uuid) INTO after_n;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('G1 deny nao loga nem altera o alvo adm',
    before_n = after_n
      AND sl_before = pg_temp._slug(pg_temp._mid('adm_a.wsa'))
      AND st_before = pg_temp._status(pg_temp._mid('adm_a.wsa')),
    to_jsonb(before_n) || to_jsonb(sl_before) || to_jsonb(st_before),
    to_jsonb(after_n) || to_jsonb(pg_temp._slug(pg_temp._mid('adm_a.wsa')))
               || to_jsonb(pg_temp._status(pg_temp._mid('adm_a.wsa'))), 1, 1);
END $g$;

SELECT pg_temp._chk(
  'G2 deny (alvo adm) nao gerou trilha de mutacao',
  pg_temp._mut_audit('__ADM_A__'::uuid) = 0
    AND pg_temp._mut_audit('__ADM_B__'::uuid) = 0,
  '0/0'::jsonb,
  to_jsonb(concat_ws('/', pg_temp._mut_audit('__ADM_A__'::uuid),
                           pg_temp._mut_audit('__ADM_B__'::uuid))), 1, 1);
SELECT pg_temp._chk(
  'G3 deny (alvo coordinator) nao gerou trilha de mutacao',
  pg_temp._mut_audit('__COORD_A__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._mut_audit('__COORD_A__'::uuid)), 1, 1);

-- ================= H: integridade final =================
SELECT pg_temp._chk(
  'H1 alvos negados intactos (adm_a, adm_b, coord_a, lid_x, sus_tec)',
  pg_temp._slug(pg_temp._mid('adm_a.wsa')) = 'adm'
    AND pg_temp._slug(pg_temp._mid('adm_b.wsb')) = 'adm'
    AND pg_temp._slug(pg_temp._mid('coord_a.wsa')) = 'coordinator'
    AND pg_temp._slug(pg_temp._mid('lid_x.wsa')) = 'lider'
    AND pg_temp._slug(pg_temp._mid('sus_tec.wsa')) = 'tec'
    AND pg_temp._status(pg_temp._mid('adm_a.wsa')) = 'active'
    AND pg_temp._status(pg_temp._mid('sus_tec.wsa')) = 'suspended',
  to_jsonb('adm/adm/coordinator/lider/tec + status intactos'::text), to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk(
  'H2 nenhum profiles.role tocado',
  (SELECT count(*) FROM public.profiles
    WHERE id IN ('__COORD_A__','__COORD_B__','__COORD_Z__','__USER_PLN__',
                 '__ADM_A__','__ADM_B__','__TEC_LID__','__TEC_VIS__',
                 '__LID_X__','__SUS_TEC__')
      AND role NOT IN ('coordinator', 'technician')) = 0,
  '0'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'H3 caminho feliz consolidado (tec_lid=lider, tec_vis=vis, suspenso intacto)',
  pg_temp._slug(pg_temp._mid('tec_lid.wsa')) = 'lider'
    AND pg_temp._slug(pg_temp._mid('tec_vis.wsa')) = 'vis'
    AND pg_temp._status(pg_temp._mid('sus_tec.wsa')) = 'suspended',
  to_jsonb('lider/vis/suspended'::text),
  to_jsonb(concat_ws('/', pg_temp._slug(pg_temp._mid('tec_lid.wsa')),
                           pg_temp._slug(pg_temp._mid('tec_vis.wsa')),
                           pg_temp._status(pg_temp._mid('sus_tec.wsa')))), 1, 1);

-- ================= I: ACL no catalogo REAL =================
SELECT pg_temp._chk(
  'I1 anon NAO executa coordinator_set_role',
  NOT has_function_privilege('anon', 'public.coordinator_set_role(uuid, text)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'I2 authenticated EXECUTA coordinator_set_role',
  has_function_privilege('authenticated', 'public.coordinator_set_role(uuid, text)', 'EXECUTE'),
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
        print("[validate-069] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes",
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
    body = body.replace("__M_KEYS__", M_KEYS_SQL)
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
        print(f"\n[OK] VALIDACAO 069 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())