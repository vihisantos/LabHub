#!/usr/bin/env python3
"""Validacao COMPORTAMENTAL da migration 068 (Fase 5.2 - Trust Boundary).

Roda TUDO em UMA transacao (um unico request a Management API): fixtures,
mutacoes passo a passo e asserts avaliados em SQL - termina com ROLLBACK: zero
residuo no banco (mesmo padrao de validate_rbac2_coordinator_065_dev.py).

Escopo: `coordinator_approve_membership` e `coordinator_reject_membership`
devem rejeitar alvos `adm`/`coordinator`, preservando o caminho feliz de
`tec/vis/est/opv/lider`, o escopo por unidade e `pending` como unica origem.

Cenario:
  coord_a  : coordenador ativo de wsA (ator principal)
  coord_b  : coordenador ativo de wsB (outro escopo; tambem testa o proprio)
  coord_z  : coordenador SEM unidade (sem memberships)
  user_pln : tecnico ativo de wsA (nao-coordenador)
  pend_tec / pend_tec2 : solicitacoes PENDING tec em wsA (caminho feliz)
  pend_adm  : solicitacao PENDING adm em wsA (linha vermelha)
  pend_coord: solicitacao PENDING coordinator em wsA (linha vermelha, par)
  pendB_tec : solicitacao PENDING tec em wsB
  pendB_adm : solicitacao PENDING adm em wsB (adm negado ate no proprio escopo)

Asserts cobrem:
  A  escopo/linha vermelha: fora da unidade, coord sem unidade, nao-coordenador,
     auto/par e adm negados em approve E reject, membership inexistente,
     transicao invalida (alvo ativo);
  B  caminho feliz: approve pending->active e reject (DELETE) de tec seguem
     funcionando; profiles.role intocado;
  C  guarda vale tambem na propria unidade (coord_b x pendB_adm) sem quebrar o
     fluxo comum (coord_b aprova pendB_tec);
  D  auditoria (trigger 054+065): approve/reject auditados; adm/coord PENDING
     intactos e sem trilha de mutacao; deny nao loga nem altera estado;
  E  ACL real no catalogo (anon NAO executa; authenticated executa);
  X  integridade final.

Requer migrations 036..047, 054, 065, 066 e 068 aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_coordinator_068_dev.py
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
     "pend_tec", "pend_tec2", "pend_adm", "pend_coord",
     "pendB_tec", "pendB_adm"], start=1)}

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

T = {
    "__WS_A__": WS_A, "__WS_B__": WS_B,
    "__COORD_A__": P["coord_a"], "__COORD_B__": P["coord_b"],
    "__COORD_Z__": P["coord_z"], "__USER_PLN__": P["user_pln"],
    "__PEND_TEC__": P["pend_tec"], "__PEND_TEC2__": P["pend_tec2"],
    "__PEND_ADM__": P["pend_adm"], "__PEND_COORD__": P["pend_coord"],
    "__PEND_BTEC__": P["pendB_tec"], "__PEND_BADM__": P["pendB_adm"],
}

# profiles.role (coluna global; o RPC nao a usa como autorizacao de cargo).
PROFILE_ROLES = {
    "coord_a": "coordinator", "coord_b": "coordinator", "coord_z": "coordinator",
    "user_pln": "technician", "pend_tec": "technician", "pend_tec2": "technician",
    "pend_adm": "technician", "pend_coord": "technician",
    "pendB_tec": "technician", "pendB_adm": "technician",
}

# memberships: (key, workspace, slug, status)
MEMBERSHIP_ROWS = [
    ("coord_a", "__WS_A__", "coordinator", "active"),
    ("coord_b", "__WS_B__", "coordinator", "active"),
    ("user_pln", "__WS_A__", "tec", "active"),
    ("pend_tec", "__WS_A__", "tec", "pending"),
    ("pend_tec2", "__WS_A__", "tec", "pending"),
    ("pend_adm", "__WS_A__", "adm", "pending"),
    ("pend_coord", "__WS_A__", "coordinator", "pending"),
    ("pendB_tec", "__WS_B__", "tec", "pending"),
    ("pendB_adm", "__WS_B__", "adm", "pending"),
]

_WS = {"__WS_A__": WS_A, "__WS_B__": WS_B}

MEMBERSHIP_SQL = ",\n".join(
    f"  ('{P[key]}', '{_WS[ws]}', '{slug}', '{status}')"
    for key, ws, slug, status in MEMBERSHIP_ROWS
)

# mapeamento key -> membership (somente as que possuem membership).
# As chaves abaixo sao referenciadas pelos asserts via pg_temp._mid('<key>').
M_KEYS = [
    ("coord_a.wsa", "coord_a", "__WS_A__"),
    ("coord_b.wsb", "coord_b", "__WS_B__"),
    ("user_pln.wsa", "user_pln", "__WS_A__"),
    ("pend_tec.wsa", "pend_tec", "__WS_A__"),
    ("pend_tec2.wsa", "pend_tec2", "__WS_A__"),
    ("pend_adm.wsa", "pend_adm", "__WS_A__"),
    ("pend_coord.wsa", "pend_coord", "__WS_A__"),
    ("pendbtec.wsb", "pendB_tec", "__WS_B__"),
    ("pendbadm.wsb", "pendB_adm", "__WS_B__"),
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
CREATE FUNCTION pg_temp._profile_role(p_pid uuid) RETURNS text AS $f$
  SELECT role FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._reqs(p_ws uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.coordinator_get_requests(p_ws);
$f$ LANGUAGE sql STABLE;
-- Mutacoes de membership (UPDATE/DELETE) auditadas para o perfil; INSERT
-- (fixture) nao conta.
CREATE FUNCTION pg_temp._mut_audit(p_pid uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.app_audit_logs
  WHERE entity_id = p_pid::text
    AND action IN ('membership_changed', 'membership_removed');
$f$ LANGUAGE sql STABLE;

-- ---------------- fixtures
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST 068', 'ws-alpha-test-068'),
  ('__WS_B__', 'WS Beta TEST 068',  'ws-beta-test-068');

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

-- ================= A: escopo / linha vermelha (como coord_a) =================
SELECT pg_temp._login('__COORD_A__'::uuid);

SELECT pg_temp._chk(
  'A1 get_requests(wsA) = 4 (pend_tec, pend_tec2, pend_adm, pend_coord)',
  pg_temp._reqs('__WS_A__'::uuid) = 4,
  '4'::jsonb, to_jsonb(pg_temp._reqs('__WS_A__'::uuid)), 4, pg_temp._reqs('__WS_A__'::uuid));

SELECT pg_temp._chk(
  'A2 get_requests(wsB) vazio (coord_a nao coordena wsB)',
  pg_temp._reqs('__WS_B__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._reqs('__WS_B__'::uuid)), 0, pg_temp._reqs('__WS_B__'::uuid));

SELECT pg_temp._expect_deny(
  'A3 approve de PENDING adm negado',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend_adm.wsa'))$q$,
  'administrative or coordination memberships cannot be approved%');

SELECT pg_temp._expect_deny(
  'A4 approve de PENDING coordinator (par) negado',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend_coord.wsa'))$q$,
  'administrative or coordination memberships cannot be approved%');

SELECT pg_temp._expect_deny(
  'A5 reject de PENDING adm negado',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('pend_adm.wsa'))$q$,
  'administrative or coordination memberships cannot be rejected%');

SELECT pg_temp._expect_deny(
  'A6 reject de PENDING coordinator (par) negado',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('pend_coord.wsa'))$q$,
  'administrative or coordination memberships cannot be rejected%');

SELECT pg_temp._expect_deny(
  'A7 membership inexistente negada',
  $q$SELECT public.coordinator_approve_membership('00000000-0000-0000-0000-0000000000ff'::uuid)$q$,
  'membership not found%');

SELECT pg_temp._expect_deny(
  'A8 approve de membership ativa negado (nao e pending)',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('user_pln.wsa'))$q$,
  'only pending memberships can be approved%');

SELECT pg_temp._expect_deny(
  'A9 reject de membership ativa negado (nao e pending)',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('user_pln.wsa'))$q$,
  'only pending memberships can be rejected%');

-- coord_b (so wsB) tentando agir em wsA.
SELECT pg_temp._login('__COORD_B__'::uuid);
SELECT pg_temp._expect_deny(
  'A10 coord_b nao aprova pend_tec em wsA (fora do escopo)',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend_tec.wsa'))$q$,
  'only an active coordinator of this unit can approve%');
SELECT pg_temp._expect_deny(
  'A11 coord_b nao rejeita pend_tec2 em wsA (fora do escopo)',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('pend_tec2.wsa'))$q$,
  'only an active coordinator of this unit can reject%');

-- nao-coordenador.
SELECT pg_temp._login('__USER_PLN__'::uuid);
SELECT pg_temp._expect_deny(
  'A12 tecnico comum nao aprova',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend_tec.wsa'))$q$,
  'only an active coordinator of this unit can approve%');
SELECT pg_temp._expect_deny(
  'A13 tecnico comum nao rejeita',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('pend_tec2.wsa'))$q$,
  'only an active coordinator of this unit can reject%');

-- coordenador SEM unidade.
SELECT pg_temp._login('__COORD_Z__'::uuid);
SELECT pg_temp._chk(
  'A14 coord_z get_requests(wsA) vazio',
  pg_temp._reqs('__WS_A__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._reqs('__WS_A__'::uuid)), 0, pg_temp._reqs('__WS_A__'::uuid));
SELECT pg_temp._expect_deny(
  'A15 coord_z nao aprova',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend_tec.wsa'))$q$,
  'only an active coordinator of this unit can approve%');

-- ================= B: caminho feliz (como coord_a) =================
SELECT pg_temp._login('__COORD_A__'::uuid);

SELECT pg_temp._expect_ok(
  'B1 aprovar pend_tec',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend_tec.wsa'))$q$);
SELECT pg_temp._chk(
  'B2 pend_tec ficou ACTIVE',
  pg_temp._status(pg_temp._mid('pend_tec.wsa')) = 'active',
  to_jsonb('active'::text), to_jsonb(pg_temp._status(pg_temp._mid('pend_tec.wsa'))), 1, 1);
SELECT pg_temp._chk(
  'B3 profiles.role de pend_tec intocado (technician)',
  pg_temp._profile_role('__PEND_TEC__'::uuid) = 'technician',
  to_jsonb('technician'::text), to_jsonb(pg_temp._profile_role('__PEND_TEC__'::uuid)), 1, 1);
SELECT pg_temp._expect_deny(
  'B4 aprovar de novo (nao e pending) negado',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend_tec.wsa'))$q$,
  'only pending memberships can be approved%');

SELECT pg_temp._expect_ok(
  'B5 rejeitar pend_tec2',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('pend_tec2.wsa'))$q$);
SELECT pg_temp._chk(
  'B6 membership rejeitada nao existe mais',
  NOT EXISTS (SELECT 1 FROM public.memberships WHERE id = pg_temp._mid('pend_tec2.wsa')),
  'true'::jsonb, to_jsonb(NOT EXISTS (SELECT 1 FROM public.memberships WHERE id = pg_temp._mid('pend_tec2.wsa'))), 1, 1);
SELECT pg_temp._chk(
  'B7 profile e usuario Auth do rejeitado PERMANECEM',
  EXISTS (SELECT 1 FROM public.profiles WHERE id = '__PEND_TEC2__'::uuid)
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = '__PEND_TEC2__'::uuid),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- ================= C: guarda na propria unidade (coord_b) =================
SELECT pg_temp._login('__COORD_B__'::uuid);
SELECT pg_temp._expect_deny(
  'C1 coord_b nao aprova PENDING adm nem na propria unidade',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pendbadm.wsb'))$q$,
  'administrative or coordination memberships cannot be approved%');
SELECT pg_temp._expect_deny(
  'C2 coord_b nao rejeita PENDING adm nem na propria unidade',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('pendbadm.wsb'))$q$,
  'administrative or coordination memberships cannot be rejected%');
SELECT pg_temp._expect_ok(
  'C3 coord_b aprova pendB_tec (caminho comum preservado)',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pendbtec.wsb'))$q$);
SELECT pg_temp._chk(
  'C4 pendB_tec ACTIVE',
  pg_temp._status(pg_temp._mid('pendbtec.wsb')) = 'active',
  to_jsonb('active'::text), to_jsonb(pg_temp._status(pg_temp._mid('pendbtec.wsb'))), 1, 1);

-- ================= D: auditoria =================
SELECT pg_temp._chk(
  'D1 approve auditado (membership_changed pending->active)',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__PEND_TEC__'
      AND meta->>'prev_status' = 'pending' AND meta->>'status' = 'active'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'D2 reject auditado (membership_removed)',
  pg_temp._mut_audit('__PEND_TEC2__'::uuid) = 1,
  '1'::jsonb, to_jsonb(pg_temp._mut_audit('__PEND_TEC2__'::uuid)), 1, 1);

SELECT pg_temp._chk(
  'D3 PENDING adm/coord seguem INTACTOS (status pending)',
  pg_temp._status(pg_temp._mid('pend_adm.wsa')) = 'pending'
    AND pg_temp._status(pg_temp._mid('pend_coord.wsa')) = 'pending'
    AND pg_temp._slug(pg_temp._mid('pend_adm.wsa')) = 'adm'
    AND pg_temp._slug(pg_temp._mid('pend_coord.wsa')) = 'coordinator',
  to_jsonb('pending/pending/adm/coordinator'::text),
  to_jsonb(concat_ws('/',
    pg_temp._status(pg_temp._mid('pend_adm.wsa')),
    pg_temp._status(pg_temp._mid('pend_coord.wsa')),
    pg_temp._slug(pg_temp._mid('pend_adm.wsa')),
    pg_temp._slug(pg_temp._mid('pend_coord.wsa')))), 1, 1);

SELECT pg_temp._chk(
  'D4 tentativas negadas em adm/coord nao geram trilha de mutacao',
  pg_temp._mut_audit('__PEND_ADM__'::uuid) = 0
    AND pg_temp._mut_audit('__PEND_COORD__'::uuid) = 0,
  '0/0'::jsonb,
  to_jsonb(concat_ws('/', pg_temp._mut_audit('__PEND_ADM__'::uuid),
                           pg_temp._mut_audit('__PEND_COORD__'::uuid))), 1, 1);

-- D5: deny nao loga nem altera estado.
DO $d$
DECLARE before_n int; after_n int; st_before text; st_after text;
BEGIN
  SELECT pg_temp._mut_audit('__PEND_ADM__'::uuid) INTO before_n;
  st_before := pg_temp._status(pg_temp._mid('pend_adm.wsa'));
  BEGIN
    PERFORM public.coordinator_approve_membership(pg_temp._mid('pend_adm.wsa'));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pg_temp._mut_audit('__PEND_ADM__'::uuid) INTO after_n;
  st_after := pg_temp._status(pg_temp._mid('pend_adm.wsa'));
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('D5 deny nao loga nem altera estado',
    before_n = after_n AND st_before = st_after,
    to_jsonb(before_n) || to_jsonb(st_before), to_jsonb(after_n) || to_jsonb(st_after), 1, 1);
END $d$;

-- ================= E: ACL no catalogo REAL =================
SELECT pg_temp._chk(
  'E1 anon NAO executa coordinator_approve_membership',
  NOT has_function_privilege('anon', 'public.coordinator_approve_membership(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'E2 anon NAO executa coordinator_reject_membership',
  NOT has_function_privilege('anon', 'public.coordinator_reject_membership(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'E3 authenticated EXECUTA coordinator_approve_membership',
  has_function_privilege('authenticated', 'public.coordinator_approve_membership(uuid)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk(
  'E4 authenticated EXECUTA coordinator_reject_membership',
  has_function_privilege('authenticated', 'public.coordinator_reject_membership(uuid)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- ================= X: integridade final =================
SELECT pg_temp._chk(
  'X1 nenhum profiles.role tocado',
  (SELECT count(*) FROM public.profiles
    WHERE id IN ('__USER_PLN__','__PEND_TEC__','__PEND_TEC2__','__PEND_ADM__',
                 '__PEND_COORD__','__PEND_BTEC__','__PEND_BADM__')
      AND role <> 'technician') = 0,
  '0'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'X2 caminho feliz consolidado (pend_tec e pendB_tec ACTIVE)',
  pg_temp._status(pg_temp._mid('pend_tec.wsa')) = 'active'
    AND pg_temp._status(pg_temp._mid('pendbtec.wsb')) = 'active',
  to_jsonb('active/active'::text),
  to_jsonb(concat_ws('/', pg_temp._status(pg_temp._mid('pend_tec.wsa')),
                           pg_temp._status(pg_temp._mid('pendbtec.wsb')))), 1, 1);

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
        print("[validate-068] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes",
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
        print(f"\n[OK] VALIDACAO 068 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
