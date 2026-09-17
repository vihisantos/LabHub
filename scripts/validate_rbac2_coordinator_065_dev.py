#!/usr/bin/env python3
"""Validação COMPORTAMENTAL da migration 065 (gestão de memberships pelo Coordenador).

Roda TUDO em UMA transação (um único request à Management API): fixtures,
mutações passo a passo e asserts avaliados em SQL — termina com ROLLBACK: zero
resíduo no banco (mesmo padrão de validate_rbac2_coordinator_047_dev.py).

Cenário (Fase 9 — matriz adversarial):
  coord_a  : coordenador só wsA (ator principal)
  coord_b  : coordenador só wsB (fora do escopo de wsA)
  coord_c  : coordenador PAR de coord_a em wsA
  coord_z  : coordenador SEM unidade (sem memberships)
  lider1/2/3: lideranças wsA subordinadas a coord_a
  tec1     : técnico wsA na equipe do lider1
  tec2     : técnico wsA solto (ciclo de vida)
  tec3     : técnico wsA na equipe do lider3
  pend1/2  : solicitações PENDING em wsA
  pendB    : solicitação PENDING em wsB (fora do escopo de coord_a)
  user_pln : técnico wsA sem coordenação

Asserts cobrem:
  A  permissões/escopo: negação fora da unidade, coord sem unidade, par
     (outro coordenador), auto-raiz, cargos proibidos adm/coordinator,
     membership inexistente, não-coordenador; diretório de alvos pendentes;
     `profiles.role` NUNCA muda;
  B  ciclo de vida: pending→active, pending→rejeitada (DELETE sem apagar
     profile/auth), active→suspended, suspended→active, active→removed,
     transições inválidas negadas, troca de cargo válida/inválida;
  C  gestor: suspensão/remoção neutralizam dependentes; restauração NÃO recria
     managed_by; sair de liderança neutraliza a equipe;
  D  auditoria (app_audit_logs, trigger 054 + meta 065): approve/reject/suspend/
     restore/remove/role/manager; ação NEGADA não executa e não loga; nenhuma
     action nova;
  E  ACL real no catálogo (anon NÃO executa; authenticated executa);
  X  integridade final.

Requer migrations 036..047, 054 e 065 aplicadas no alvo.

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_coordinator_065_dev.py
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
PFX = "cccccccc-0000-0000-0000-0000000000"
P = {k: f"{PFX}{i:02d}" for i, k in enumerate(
    ["coord_a", "coord_b", "coord_c", "coord_z", "lider1", "lider2", "lider3",
     "tec1", "tec2", "tec3", "pend1", "pend2", "pendB", "user_pln"], start=1)}

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

T = {
    "__WS_A__": WS_A, "__WS_B__": WS_B,
    "__COORD_A__": P["coord_a"], "__COORD_B__": P["coord_b"],
    "__COORD_C__": P["coord_c"], "__COORD_Z__": P["coord_z"],
    "__LIDER1__": P["lider1"], "__LIDER2__": P["lider2"], "__LIDER3__": P["lider3"],
    "__TEC1__": P["tec1"], "__TEC2__": P["tec2"], "__TEC3__": P["tec3"],
    "__PEND1__": P["pend1"], "__PEND2__": P["pend2"], "__PENDB__": P["pendB"],
    "__USER_PLN__": P["user_pln"],
}

ROLE_SLUGS = {"coord_a": "coordinator", "coord_b": "coordinator", "coord_c": "coordinator",
              "lider1": "lider", "lider2": "lider", "lider3": "lider",
              "tec1": "tec", "tec2": "tec", "tec3": "tec",
              "pend1": "tec", "pend2": "tec", "pendB": "tec", "user_pln": "tec"}
MEMBERSHIP_ROWS = "\n".join(
    f"  ('{P[k]}', '" + ("__WS_B__" if k == "coord_b" else "__WS_A__") + f"', '{ROLE_SLUGS[k]}'),"
    for k in ["coord_a", "coord_b", "coord_c", "lider1", "lider2", "lider3",
              "tec1", "tec2", "tec3", "user_pln"]
)
PENDING_ROWS = "\n".join([
    f"  ('{P['pend1']}', '__WS_A__', 'tec'),",
    f"  ('{P['pend2']}', '__WS_A__', 'tec'),",
    f"  ('{P['pendB']}', '__WS_B__', 'tec')",
])

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
CREATE FUNCTION pg_temp._slug(p_mid uuid) RETURNS text AS $f$
  SELECT r.slug FROM public.memberships m JOIN public.roles r ON r.id = m.role_id WHERE m.id = p_mid;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._reqs(p_ws uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.coordinator_get_requests(p_ws);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._audit_n(p_action text, p_pid uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.app_audit_logs
  WHERE action = p_action AND entity_id = p_pid::text;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._audit_meta(p_action text, p_pid uuid) RETURNS jsonb AS $f$
  SELECT meta FROM public.app_audit_logs
  WHERE action = p_action AND entity_id = p_pid::text
  ORDER BY "timestamp" DESC, id DESC LIMIT 1;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._audit_actor(p_action text, p_pid uuid) RETURNS text AS $f$
  SELECT actor_id::text FROM public.app_audit_logs
  WHERE action = p_action AND entity_id = p_pid::text
  ORDER BY "timestamp" DESC, id DESC LIMIT 1;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._profile_role(p_pid uuid) RETURNS text AS $f$
  SELECT role FROM public.profiles WHERE id = p_pid;
$f$ LANGUAGE sql STABLE;

-- ---------------- fixtures
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST', 'ws-alpha-test'),
  ('__WS_B__', 'WS Beta TEST',  'ws-beta-test');

INSERT INTO auth.users (id, email) VALUES
  __USERS__;

UPDATE public.profiles SET status='active', role='coordinator' WHERE id='__COORD_A__';
UPDATE public.profiles SET status='active', role='coordinator' WHERE id='__COORD_B__';
UPDATE public.profiles SET status='active', role='coordinator' WHERE id='__COORD_C__';
UPDATE public.profiles SET status='active', role='coordinator' WHERE id='__COORD_Z__';
UPDATE public.profiles SET status='active', role='lider'       WHERE id='__LIDER1__';
UPDATE public.profiles SET status='active', role='lider'       WHERE id='__LIDER2__';
UPDATE public.profiles SET status='active', role='lider'       WHERE id='__LIDER3__';
UPDATE public.profiles SET status='active', role='technician'  WHERE id='__TEC1__';
UPDATE public.profiles SET status='active', role='technician'  WHERE id='__TEC2__';
UPDATE public.profiles SET status='active', role='technician'  WHERE id='__TEC3__';
UPDATE public.profiles SET status='active', role='technician'  WHERE id='__PEND1__';
UPDATE public.profiles SET status='active', role='technician'  WHERE id='__PEND2__';
UPDATE public.profiles SET status='active', role='technician'  WHERE id='__PENDB__';
UPDATE public.profiles SET status='active', role='technician'  WHERE id='__USER_PLN__';

-- Memberships ativas (coord_z fica sem membership).
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, 'active'
FROM (VALUES
__MEMBERSHIP_ROWS__
) AS v(pid, ws, slug)
JOIN public.roles r ON r.slug = v.slug;

-- Solicitações PENDING.
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, 'pending'
FROM (VALUES
__PENDING_ROWS__
) AS v(pid, ws, slug)
JOIN public.roles r ON r.slug = v.slug;

INSERT INTO _m(key, mid, pid)
SELECT s.key, m.id, m.profile_id
FROM (VALUES
  ('coord_a.wsA', '__COORD_A__', '__WS_A__'),
  ('coord_b.wsB', '__COORD_B__', '__WS_B__'),
  ('coord_c.wsA', '__COORD_C__', '__WS_A__'),
  ('lider1.wsA',  '__LIDER1__',  '__WS_A__'),
  ('lider2.wsA',  '__LIDER2__',  '__WS_A__'),
  ('lider3.wsA',  '__LIDER3__',  '__WS_A__'),
  ('tec1.wsA',    '__TEC1__',    '__WS_A__'),
  ('tec2.wsA',    '__TEC2__',    '__WS_A__'),
  ('tec3.wsA',    '__TEC3__',    '__WS_A__'),
  ('tecB.wsB',    '__PENDB__',   '__WS_B__'),
  ('pend1.wsA',   '__PEND1__',   '__WS_A__'),
  ('pend2.wsA',   '__PEND2__',   '__WS_A__')
) s(key, pid, ws)
JOIN public.memberships m ON m.profile_id = s.pid::uuid AND m.workspace_id = s.ws::uuid;

-- Árvore montada pelo CAMINHO REAL (RPC 047) como coord_a.
SELECT pg_temp._login('__COORD_A__'::uuid);
SELECT public.coordinator_set_manager(pg_temp._mid('lider1.wsA'), pg_temp._mid('coord_a.wsA'));
SELECT public.coordinator_set_manager(pg_temp._mid('lider2.wsA'), pg_temp._mid('coord_a.wsA'));
SELECT public.coordinator_set_manager(pg_temp._mid('lider3.wsA'), pg_temp._mid('coord_a.wsA'));
SELECT public.coordinator_set_manager(pg_temp._mid('tec1.wsA'),   pg_temp._mid('lider1.wsA'));
SELECT public.coordinator_set_manager(pg_temp._mid('tec3.wsA'),   pg_temp._mid('lider3.wsA'));

-- ================= A: permissões / escopo (como coord_a) =================
SELECT pg_temp._chk(
  'A0 get_requests(wsA) = {pend1, pend2}',
  pg_temp._reqs('__WS_A__'::uuid) = 2,
  '2'::jsonb, to_jsonb(pg_temp._reqs('__WS_A__'::uuid)), 2, pg_temp._reqs('__WS_A__'::uuid));

SELECT pg_temp._chk(
  'A1 get_requests(wsB) vazio (coord_a não coordena wsB)',
  pg_temp._reqs('__WS_B__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._reqs('__WS_B__'::uuid)), 0, pg_temp._reqs('__WS_B__'::uuid));

SELECT pg_temp._expect_deny(
  'A2 coord_a não aprova pendB (outra unidade)',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('tecB.wsB'))$q$,
  'only an active coordinator of this unit can approve%');

SELECT pg_temp._expect_deny(
  'A3 coord_a não altera cargo de coordenação PAR (coord_c)',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('coord_c.wsA'), 'tec')$q$,
  'a coordination membership role cannot be changed%');

SELECT pg_temp._expect_deny(
  'A4 coord_a não altera a própria membership de coordenação (raiz)',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('coord_a.wsA'), 'tec')$q$,
  'a coordination membership role cannot be changed%');

SELECT pg_temp._expect_deny(
  'A5 coord_a NÃO concede adm',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec1.wsA'), 'adm')$q$,
  'role adm cannot be assigned by a coordinator%');

SELECT pg_temp._expect_deny(
  'A6 coord_a NÃO concede coordinator',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec1.wsA'), 'coordinator')$q$,
  'role coordinator cannot be assigned by a coordinator%');

SELECT pg_temp._expect_deny(
  'A7 membership inexistente negada',
  $q$SELECT public.coordinator_approve_membership('00000000-0000-0000-0000-0000000000ff'::uuid)$q$,
  'membership not found%');

-- coord_b (só wsB) tentando agir em wsA.
SELECT pg_temp._login('__COORD_B__'::uuid);
SELECT pg_temp._expect_deny(
  'A8 coord_b não aprova pend1 (fora do escopo)',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend1.wsA'))$q$,
  'only an active coordinator of this unit can approve%');

-- coordenador SEM unidade.
SELECT pg_temp._login('__COORD_Z__'::uuid);
SELECT pg_temp._chk(
  'A9 coord_z get_requests(wsA) vazio',
  pg_temp._reqs('__WS_A__'::uuid) = 0,
  '0'::jsonb, to_jsonb(pg_temp._reqs('__WS_A__'::uuid)), 0, pg_temp._reqs('__WS_A__'::uuid));
SELECT pg_temp._expect_deny(
  'A10 coord_z não aprova pend1',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend1.wsA'))$q$,
  'only an active coordinator of this unit can approve%');

-- não-coordenador.
SELECT pg_temp._login('__USER_PLN__'::uuid);
SELECT pg_temp._expect_deny(
  'A11 técnico comum não suspende tec1',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('tec1.wsA'))$q$,
  'only an active coordinator of this unit can suspend%');

-- ================= B: ciclo de vida (como coord_a) =================
SELECT pg_temp._login('__COORD_A__'::uuid);

SELECT pg_temp._expect_ok(
  'B1 aprovar pend1',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend1.wsA'))$q$);
SELECT pg_temp._chk(
  'B2 pend1 ficou ACTIVE',
  pg_temp._status(pg_temp._mid('pend1.wsA')) = 'active',
  to_jsonb('active'::text), to_jsonb(pg_temp._status(pg_temp._mid('pend1.wsA'))), 1, 1);
SELECT pg_temp._chk(
  'B3 profiles.role de pend1 intocado (technician)',
  pg_temp._profile_role(pg_temp._pid('pend1.wsA')) = 'technician',
  to_jsonb('technician'::text), to_jsonb(pg_temp._profile_role(pg_temp._pid('pend1.wsA'))), 1, 1);
SELECT pg_temp._expect_deny(
  'B4 aprovar de novo (não é pending) é negado',
  $q$SELECT public.coordinator_approve_membership(pg_temp._mid('pend1.wsA'))$q$,
  'only pending memberships can be approved%');
SELECT pg_temp._chk(
  'B5 get_requests(wsA) agora = 1 (só pend2)',
  pg_temp._reqs('__WS_A__'::uuid) = 1,
  '1'::jsonb, to_jsonb(pg_temp._reqs('__WS_A__'::uuid)), 1, pg_temp._reqs('__WS_A__'::uuid));

SELECT pg_temp._expect_ok(
  'B6 rejeitar pend2',
  $q$SELECT public.coordinator_reject_membership(pg_temp._mid('pend2.wsA'))$q$);
SELECT pg_temp._chk(
  'B7 membership rejeitada não existe mais',
  NOT EXISTS (SELECT 1 FROM public.memberships WHERE id = pg_temp._mid('pend2.wsA')),
  'true'::jsonb, to_jsonb(NOT EXISTS (SELECT 1 FROM public.memberships WHERE id = pg_temp._mid('pend2.wsA'))), 1, 1);
SELECT pg_temp._chk(
  'B8 profile e usuário Auth do rejeitado PERMANECEM',
  EXISTS (SELECT 1 FROM public.profiles WHERE id = '__PEND2__'::uuid)
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = '__PEND2__'::uuid),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._expect_ok(
  'B9 suspender tec2 (active)',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('tec2.wsA'))$q$);
SELECT pg_temp._chk(
  'B10 tec2 SUSPENDED',
  pg_temp._status(pg_temp._mid('tec2.wsA')) = 'suspended',
  to_jsonb('suspended'::text), to_jsonb(pg_temp._status(pg_temp._mid('tec2.wsA'))), 1, 1);
SELECT pg_temp._expect_ok(
  'B11 restaurar tec2 (suspended)',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('tec2.wsA'))$q$);
SELECT pg_temp._chk(
  'B12 tec2 ACTIVE de novo',
  pg_temp._status(pg_temp._mid('tec2.wsA')) = 'active',
  to_jsonb('active'::text), to_jsonb(pg_temp._status(pg_temp._mid('tec2.wsA'))), 1, 1);
SELECT pg_temp._expect_ok(
  'B13 remover tec2 (active)',
  $q$SELECT public.coordinator_remove_membership(pg_temp._mid('tec2.wsA'))$q$);
SELECT pg_temp._chk(
  'B14 tec2 REMOVED, linha e perfil preservados',
  pg_temp._status(pg_temp._mid('tec2.wsA')) = 'removed'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = '__TEC2__'::uuid),
  to_jsonb('removed'::text), to_jsonb(pg_temp._status(pg_temp._mid('tec2.wsA'))), 1, 1);
SELECT pg_temp._expect_deny(
  'B15 suspender membership já removida é negado',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('tec2.wsA'))$q$,
  'only active memberships can be suspended%');
SELECT pg_temp._expect_deny(
  'B16 restaurar membership removida é negado',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('tec2.wsA'))$q$,
  'only suspended memberships can be restored%');

SELECT pg_temp._expect_ok(
  'B17 troca de cargo válida tec1 -> vis',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('tec1.wsA'), 'vis')$q$);
SELECT pg_temp._chk(
  'B18 tec1 agora é cargo vis e profiles.role intocado',
  pg_temp._slug(pg_temp._mid('tec1.wsA')) = 'vis'
    AND pg_temp._profile_role('__TEC1__'::uuid) = 'technician',
  to_jsonb('vis'::text), to_jsonb(pg_temp._slug(pg_temp._mid('tec1.wsA'))), 1, 1);

-- ================= C: gestor (neutralização) =================
SELECT pg_temp._expect_ok(
  'C1 suspender lider1 (gestor de tec1)',
  $q$SELECT public.coordinator_suspend_membership(pg_temp._mid('lider1.wsA'))$q$);
SELECT pg_temp._chk(
  'C2 tec1 desvinculado (managed_by NULL) após suspensão',
  pg_temp._managed(pg_temp._mid('tec1.wsA')) IS NULL,
  'null'::jsonb, to_jsonb(pg_temp._managed(pg_temp._mid('tec1.wsA'))), 0, (pg_temp._managed(pg_temp._mid('tec1.wsA')) IS NULL)::int);
SELECT pg_temp._expect_ok(
  'C3 restaurar lider1',
  $q$SELECT public.coordinator_restore_membership(pg_temp._mid('lider1.wsA'))$q$);
SELECT pg_temp._chk(
  'C4 restauração NÃO recria managed_by de tec1',
  pg_temp._managed(pg_temp._mid('tec1.wsA')) IS NULL,
  'null'::jsonb, to_jsonb(pg_temp._managed(pg_temp._mid('tec1.wsA'))), 0, (pg_temp._managed(pg_temp._mid('tec1.wsA')) IS NULL)::int);

SELECT pg_temp._expect_ok(
  'C5 remover lider3 (gestor de tec3)',
  $q$SELECT public.coordinator_remove_membership(pg_temp._mid('lider3.wsA'))$q$);
SELECT pg_temp._chk(
  'C6 tec3 desvinculado após remoção do gestor',
  pg_temp._status(pg_temp._mid('lider3.wsA')) = 'removed'
    AND pg_temp._managed(pg_temp._mid('tec3.wsA')) IS NULL,
  'null'::jsonb, to_jsonb(pg_temp._managed(pg_temp._mid('tec3.wsA'))), 0, (pg_temp._managed(pg_temp._mid('tec3.wsA')) IS NULL)::int);

-- sair de liderança neutraliza a equipe: tec1 volta para lider2 e é solto.
SELECT public.coordinator_set_manager(pg_temp._mid('tec1.wsA'), pg_temp._mid('lider2.wsA'));
SELECT pg_temp._expect_ok(
  'C7 rebaixar lider2 (lider->tec)',
  $q$SELECT public.coordinator_set_role(pg_temp._mid('lider2.wsA'), 'tec')$q$);
SELECT pg_temp._chk(
  'C8 tec1 desvinculado ao gestor sair de liderança',
  pg_temp._managed(pg_temp._mid('tec1.wsA')) IS NULL,
  'null'::jsonb, to_jsonb(pg_temp._managed(pg_temp._mid('tec1.wsA'))), 0, (pg_temp._managed(pg_temp._mid('tec1.wsA')) IS NULL)::int);

-- ================= D: auditoria (app_audit_logs) =================
SELECT pg_temp._chk(
  'D1 approve auditado (membership_changed pending->active)',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__PEND1__'
      AND meta->>'prev_status' = 'pending' AND meta->>'new_status' = 'active'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'D2 rejeição auditada (membership_removed)',
  pg_temp._audit_n('membership_removed', '__PEND2__'::uuid) = 1,
  '1'::jsonb, to_jsonb(pg_temp._audit_n('membership_removed', '__PEND2__'::uuid)), 1, 1);

SELECT pg_temp._chk(
  'D3 suspensão auditada (active->suspended, actor = coord_a)',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__LIDER1__'
      AND meta->>'prev_status' = 'active' AND meta->>'new_status' = 'suspended'
      AND actor_id = '__COORD_A__'::uuid),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'D4 troca de manager registrada com prev/new managed_by (065)',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__TEC1__'
      AND meta->>'managed_by' = pg_temp._mid('lider2.wsA')::text
      AND meta->'prev_managed_by' IS NOT NULL),
  'true'::jsonb, to_jsonb(pg_temp._audit_meta('membership_changed', '__TEC1__'::uuid)), 1, 1);

SELECT pg_temp._chk(
  'D5 troca de cargo auditada (prev_role/new_role)',
  EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action = 'membership_changed' AND entity_id = '__LIDER2__'
      AND meta->>'prev_role' IS NOT NULL AND meta->>'role_id' IS NOT NULL
      AND meta->>'prev_role' <> meta->>'role_id'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

SELECT pg_temp._chk(
  'D6 nenhuma action nova (sem membership_approved/suspended)',
  NOT EXISTS (
    SELECT 1 FROM public.app_audit_logs
    WHERE action IN ('membership_approved', 'membership_rejected',
                     'membership_suspended', 'membership_restored',
                     'membership_role_changed', 'membership_manager_changed')),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- D7: ação NEGADA não executa e não loga.
DO $d$
DECLARE before_n int; after_n int; st_before text; st_after text;
BEGIN
  SELECT pg_temp._audit_n('membership_changed', '__TEC1__'::uuid) INTO before_n;
  st_before := pg_temp._status(pg_temp._mid('tec1.wsA'));
  BEGIN
    PERFORM public.coordinator_approve_membership(pg_temp._mid('tec1.wsA'));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pg_temp._audit_n('membership_changed', '__TEC1__'::uuid) INTO after_n;
  st_after := pg_temp._status(pg_temp._mid('tec1.wsA'));
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('D7 deny não loga nem altera estado',
    before_n = after_n AND st_before = st_after,
    to_jsonb(before_n) || to_jsonb(st_before), to_jsonb(after_n) || to_jsonb(st_after), 1, 1);
END $d$;

-- ================= E: ACL no catálogo REAL =================
SELECT pg_temp._chk(
  'E1 anon NÃO executa coordinator_get_requests',
  NOT has_function_privilege('anon', 'public.coordinator_get_requests(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'E2 anon NÃO executa coordinator_approve_membership',
  NOT has_function_privilege('anon', 'public.coordinator_approve_membership(uuid)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'E3 anon NÃO executa coordinator_set_role',
  NOT has_function_privilege('anon', 'public.coordinator_set_role(uuid, text)', 'EXECUTE'),
  'false'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'E4 authenticated EXECUTA coordinator_remove_membership',
  has_function_privilege('authenticated', 'public.coordinator_remove_membership(uuid)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);
SELECT pg_temp._chk(
  'E5 authenticated EXECUTA coordinator_set_role',
  has_function_privilege('authenticated', 'public.coordinator_set_role(uuid, text)', 'EXECUTE'),
  'true'::jsonb, to_jsonb('checked'::text), 1, 1);

-- ================= X: integridade final =================
SELECT pg_temp._chk(
  'X1 nenhum profiles.role tocado',
  (SELECT count(*) FROM public.profiles
    WHERE id IN ('__TEC1__','__TEC2__','__TEC3__','__LIDER1__','__LIDER2__','__LIDER3__','__PEND1__','__PEND2__')
      AND role <> CASE
        WHEN id IN ('__LIDER1__','__LIDER2__','__LIDER3__') THEN 'lider'
        ELSE 'technician' END) = 0,
  '0'::jsonb, to_jsonb('checked'::text), 0, 0);
SELECT pg_temp._chk(
  'X2 tec1 segue com cargo vis (não promovido à coordenação)',
  pg_temp._slug(pg_temp._mid('tec1.wsA')) = 'vis',
  to_jsonb('vis'::text), to_jsonb(pg_temp._slug(pg_temp._mid('tec1.wsA'))), 1, 1);

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
        print("[validate-065] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes", file=sys.stderr)
        return 2
    body = SQL
    for tok, val in T.items():
        body = body.replace(tok, val)
    body = body.replace("__USERS__", USERS_SQL)
    body = body.replace("__MEMBERSHIP_ROWS__", MEMBERSHIP_ROWS)
    body = body.replace("__PENDING_ROWS__", PENDING_ROWS)
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
        print(f"\n[OK] VALIDACAO 065 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
