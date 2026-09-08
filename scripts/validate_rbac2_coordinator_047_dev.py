#!/usr/bin/env python3
"""Validação COMPORTAMENTAL da migration 047 (escopo do coordenador) contra o DEV.

Roda TUDO em UMA transação (um único request à Management API): fixtures,
mutações passo a passo e asserts avaliados em SQL — termina com ROLLBACK:
zero resíduo no banco (mesmo padrão do validate_rbac2_trigger_dev.py).

Cenário (Fase 8 — matriz adversarial):
  coord_a  : coordenador wsA+wsB  (ator principal / multiunidade)
  coord_b  : coordenador só wsA   (par na unidade, SEM wsB)
  coord_z  : coordenador SEM unidade (workspace_ids vazio -> 0 memberships)
  lider1/2 : líderes wsA (subordinados diretos de coord_a via RPC)
  tec1     : técnico wsA na equipe do lider1
  tec2     : técnico wsA solto (sem gestor)
  tecB     : técnico wsB (unidade de coord_a, fora do alcance de coord_b)
  user_pln : técnico wsA SEM cargo de coordenação

Árvore montada pelo CAMINHO REAL (RPC): lider1/lider2 <- coord_a.wsA;
tec1 <- lider1. Os asserts cobrem:
  S  leitura escopada (unidades/lideranças/equipes) como coord_a;
  V  coordenador sem unidade -> vazio/negação;
  U  usuário sem coordenação -> vazio/negação;
  T  transbordo de unidade (coord_b em wsB) -> negação + recuperação;
  W  regras de escrita do RPC (coordenadores pares, gestor fora da árvore,
     lider->lider vetado pela 046, raiz, alvo/gestor inexistentes, alvo
     inativo, remoção por NULL);
  C  guarda 046: gestor fora de cargo de liderança (ciclo inviável por
     regras -> rejeitado antes de formar);
  A  ACL real no catálogo (anon NÃO executa; authenticated executa);
  X  integridade final do escopo após todas as mutações restauradas.

Requer migrations 036..047 aplicadas no alvo (memberships, RLS super-admin-only,
cargo lider, trigger guarda 046, RPCs 047).

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_coordinator_047_dev.py
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
PFX = "bbbbbbbb-0000-0000-0000-0000000000"
P = {k: f"{PFX}{i:02d}" for i, k in enumerate(
    ["coord_a", "coord_b", "coord_z", "lider1", "lider2",
     "tec1", "tec2", "tecB", "user_pln"], start=1)}
MISSING = "c0ff0000-0000-0000-0000-00000000dead"  # uuid inexistente

USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.{key}@example.com')" for key, pid in P.items()
)

T = {
    "__WS_A__": WS_A, "__WS_B__": WS_B, "__MISSING__": MISSING,
    "__COORD_A__": P["coord_a"], "__COORD_B__": P["coord_b"], "__COORD_Z__": P["coord_z"],
    "__LIDER1__": P["lider1"], "__LIDER2__": P["lider2"],
    "__TEC1__": P["tec1"], "__TEC2__": P["tec2"], "__TECB__": P["tecB"],
    "__USER_PLN__": P["user_pln"],
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
CREATE FUNCTION pg_temp._j_units() RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM public.get_coordinator_units();
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._j_leaders(p_ws uuid) RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM public.get_coordinator_leaders(p_ws);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._j_team(p_mgr uuid) RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM public.get_memberships_by_manager(p_mgr);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._cu() RETURNS int AS $f$
  SELECT count(*)::int FROM public.get_coordinator_units();
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._cl(p_ws uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.get_coordinator_leaders(p_ws);
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._tm(p_mgr uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.get_memberships_by_manager(p_mgr);
$f$ LANGUAGE sql STABLE;
CREATE TEMP TABLE _m(key text PRIMARY KEY, mid uuid);

-- simula a sessão autenticada para auth.uid() (sub + claims completos)
SELECT set_config('request.jwt.claim.sub', '__COORD_A__'::text, true),
       set_config('request.jwt.claims',
         '{"sub":"__COORD_A__","role":"authenticated"}'::jsonb::text, true);

-- ---------------- fixtures (fluxo real: signup + aprovação 041)
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('__WS_A__', 'WS Alpha TEST', 'ws-alpha-test'),
  ('__WS_B__', 'WS Beta TEST',  'ws-beta-test');

INSERT INTO auth.users (id, email) VALUES
  __USERS__;

UPDATE public.profiles SET status='active', role='coordinator', workspace_ids=ARRAY['__WS_A__','__WS_B__']::uuid[] WHERE id='__COORD_A__';
UPDATE public.profiles SET status='active', role='coordinator', workspace_ids=ARRAY['__WS_A__']::uuid[]          WHERE id='__COORD_B__';
UPDATE public.profiles SET status='active', role='coordinator', workspace_ids=ARRAY[]::uuid[]                      WHERE id='__COORD_Z__';
UPDATE public.profiles SET status='active', role='lider',       workspace_ids=ARRAY['__WS_A__']::uuid[]          WHERE id='__LIDER1__';
UPDATE public.profiles SET status='active', role='lider',       workspace_ids=ARRAY['__WS_A__']::uuid[]          WHERE id='__LIDER2__';
UPDATE public.profiles SET status='active', role='technician',  workspace_ids=ARRAY['__WS_A__']::uuid[]          WHERE id='__TEC1__';
UPDATE public.profiles SET status='active', role='technician',  workspace_ids=ARRAY['__WS_A__']::uuid[]          WHERE id='__TEC2__';
UPDATE public.profiles SET status='active', role='technician',  workspace_ids=ARRAY['__WS_B__']::uuid[]          WHERE id='__TECB__';
UPDATE public.profiles SET status='active', role='technician',  workspace_ids=ARRAY['__WS_A__']::uuid[]          WHERE id='__USER_PLN__';

INSERT INTO _m(key, mid)
SELECT s.key, m.id
FROM (VALUES
  ('coord_a.wsA', '__COORD_A__', '__WS_A__'),
  ('coord_a.wsB', '__COORD_A__', '__WS_B__'),
  ('coord_b.wsA', '__COORD_B__', '__WS_A__'),
  ('lider1.wsA',  '__LIDER1__',  '__WS_A__'),
  ('lider2.wsA',  '__LIDER2__',  '__WS_A__'),
  ('tec1.wsA',    '__TEC1__',    '__WS_A__'),
  ('tec2.wsA',    '__TEC2__',    '__WS_A__'),
  ('tecB.wsB',    '__TECB__',    '__WS_B__')
) s(key, pid, ws)
JOIN public.memberships m ON m.profile_id = s.pid::uuid AND m.workspace_id = s.ws::uuid;

-- Árvore montada pelo CAMINHO REAL (RPC 047): coord_a lidera as lideranças;
-- tec1 entra na equipe do lider1.
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='lider1.wsA'),
  (SELECT mid FROM _m WHERE key='coord_a.wsA'));
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='lider2.wsA'),
  (SELECT mid FROM _m WHERE key='coord_a.wsA'));
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='tec1.wsA'),
  (SELECT mid FROM _m WHERE key='lider1.wsA'));

-- ================= S: leitura escopada (como coord_a) =================
SELECT pg_temp._chk(
  'S1 coord_a vê 2 unidades (wsA+wsB)',
  pg_temp._cu() = 2 AND pg_temp._j_units() @> jsonb_build_array(
    (SELECT mid FROM _m WHERE key='coord_a.wsA'),
    (SELECT mid FROM _m WHERE key='coord_a.wsB')),
  '2'::jsonb, to_jsonb(pg_temp._cu()), 2, pg_temp._cu());

SELECT pg_temp._chk(
  'S2 is_coordinator_of(wsA)=true',
  public.is_coordinator_of('__WS_A__'::uuid),
  'true'::jsonb, to_jsonb(public.is_coordinator_of('__WS_A__'::uuid)), 1, 1);

SELECT pg_temp._chk(
  'S3 is_coordinator_of(wsB)=true (multiunidade)',
  public.is_coordinator_of('__WS_B__'::uuid),
  'true'::jsonb, to_jsonb(public.is_coordinator_of('__WS_B__'::uuid)), 1, 1);

SELECT pg_temp._chk(
  'S4 lideranças diretas wsA = {lider1, lider2}',
  pg_temp._cl('__WS_A__'::uuid) = 2 AND pg_temp._j_leaders('__WS_A__'::uuid) @> jsonb_build_array(
    (SELECT mid FROM _m WHERE key='lider1.wsA'),
    (SELECT mid FROM _m WHERE key='lider2.wsA')),
  '2'::jsonb, to_jsonb(pg_temp._cl('__WS_A__'::uuid)), 2, pg_temp._cl('__WS_A__'::uuid));

SELECT pg_temp._chk(
  'S5 equipe do lider1 = {tec1}',
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA')) = 1
    AND pg_temp._j_team((SELECT mid FROM _m WHERE key='lider1.wsA')) @> jsonb_build_array(
      (SELECT mid FROM _m WHERE key='tec1.wsA')),
  '1'::jsonb,
  to_jsonb(pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA'))), 1,
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA')));

-- ================= V: coordenador SEM unidade (coord_z) =================
SELECT set_config('request.jwt.claim.sub', '__COORD_Z__'::text, true),
       set_config('request.jwt.claims',
         '{"sub":"__COORD_Z__","role":"authenticated"}'::jsonb::text, true);

SELECT pg_temp._chk(
  'V1 coordenador sem unidade -> 0 unidades',
  pg_temp._cu() = 0, '0'::jsonb, to_jsonb(pg_temp._cu()), 0, pg_temp._cu());

SELECT pg_temp._chk(
  'V2 coordenador sem unidade -> is_coordinator_of=false',
  NOT public.is_coordinator_of('__WS_A__'::uuid),
  'false'::jsonb, to_jsonb(public.is_coordinator_of('__WS_A__'::uuid)), 0, 0);

SELECT pg_temp._chk(
  'V3 coordenador sem unidade -> lideranças vazias',
  pg_temp._cl('__WS_A__'::uuid) = 0, '0'::jsonb,
  to_jsonb(pg_temp._cl('__WS_A__'::uuid)), 0, pg_temp._cl('__WS_A__'::uuid));

-- ================= U: usuário SEM coordenação (user_pln) =================
SELECT set_config('request.jwt.claim.sub', '__USER_PLN__'::text, true),
       set_config('request.jwt.claims',
         '{"sub":"__USER_PLN__","role":"authenticated"}'::jsonb::text, true);

SELECT pg_temp._chk(
  'U1 não-coordenador -> 0 unidades',
  pg_temp._cu() = 0, '0'::jsonb, to_jsonb(pg_temp._cu()), 0, pg_temp._cu());

SELECT pg_temp._chk(
  'U2 não-coordenador -> lideranças wsA vazias',
  pg_temp._cl('__WS_A__'::uuid) = 0, '0'::jsonb,
  to_jsonb(pg_temp._cl('__WS_A__'::uuid)), 0, pg_temp._cl('__WS_A__'::uuid));

SELECT pg_temp._chk(
  'U3 não-coordenador -> is_coordinator_of=false',
  NOT public.is_coordinator_of('__WS_A__'::uuid),
  'false'::jsonb, to_jsonb(public.is_coordinator_of('__WS_A__'::uuid)), 0, 0);

-- U4: escrita de não-coordenador é negada pelo RPC
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='tec2.wsA'),
    NULL);
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('U4 não-coordenador NÃO re-parenta', false,
    to_jsonb('only an active coordinator of this unit can manage its membership structure'::text),
    to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('U4 não-coordenador NÃO re-parenta',
    m LIKE 'only an active coordinator of this unit%',
    to_jsonb('only an active coordinator of this unit can manage its membership structure'::text),
    to_jsonb(m), 1, 1);
END $d$;

-- ================= T: TRANSBORDO de unidade (coord_b → wsB) =================
SELECT set_config('request.jwt.claim.sub', '__COORD_B__'::text, true),
       set_config('request.jwt.claims',
         '{"sub":"__COORD_B__","role":"authenticated"}'::jsonb::text, true);

SELECT pg_temp._chk(
  'T1 coord_b (só wsA) -> is_coordinator_of(wsB)=false',
  NOT public.is_coordinator_of('__WS_B__'::uuid),
  'false'::jsonb, to_jsonb(public.is_coordinator_of('__WS_B__'::uuid)), 0, 0);

SELECT pg_temp._chk(
  'T2 coord_b -> lideranças wsB vazias (fail-closed)',
  pg_temp._cl('__WS_B__'::uuid) = 0, '0'::jsonb,
  to_jsonb(pg_temp._cl('__WS_B__'::uuid)), 0, pg_temp._cl('__WS_B__'::uuid));

-- T3: escrever na unidade de outro coordenador é negado
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='tecB.wsB'),
    (SELECT mid FROM _m WHERE key='coord_b.wsA'));
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('T3 coord_b não gerencia wsB', false,
    to_jsonb('only an active coordinator of this unit can manage its membership structure'::text),
    to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('T3 coord_b não gerencia wsB',
    m LIKE 'only an active coordinator of this unit%',
    to_jsonb('only an active coordinator of this unit can manage its membership structure'::text),
    to_jsonb(m), 1, 1);
END $d$;

-- T4: NA MESMA unidade o coordenador PAR pode trazer membership para a
-- própria árvore (gestor = a própria membership de coordenação). Tec1 vai
-- direto para coord_b; depois RESTAURADO para o lider1 por coord_a.
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='tec1.wsA'),
  (SELECT mid FROM _m WHERE key='coord_b.wsA'));
SELECT pg_temp._chk(
  'T4 coord_b assume tec1 na própria árvore',
  pg_temp._tm((SELECT mid FROM _m WHERE key='coord_b.wsA')) = 1
    AND pg_temp._j_team((SELECT mid FROM _m WHERE key='coord_b.wsA')) @> jsonb_build_array(
      (SELECT mid FROM _m WHERE key='tec1.wsA')),
  '1'::jsonb,
  to_jsonb(pg_temp._tm((SELECT mid FROM _m WHERE key='coord_b.wsA'))), 1,
  pg_temp._tm((SELECT mid FROM _m WHERE key='coord_b.wsA')));

-- ================= W: regras de escrita (como coord_a) =================
SELECT set_config('request.jwt.claim.sub', '__COORD_A__'::text, true),
       set_config('request.jwt.claims',
         '{"sub":"__COORD_A__","role":"authenticated"}'::jsonb::text, true);

-- W1: coordenador NÃO re-parenta membership de coordenação (pares na unidade)
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='coord_b.wsA'),
    (SELECT mid FROM _m WHERE key='coord_a.wsA'));
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W1 coord não re-parenta coordenação (pares)', false,
    to_jsonb('coordinators are peers in a unit'::text), to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W1 coord não re-parenta coordenação (pares)',
    m LIKE 'coordinators are peers in a unit%',
    to_jsonb('coordinators are peers in a unit'::text), to_jsonb(m), 1, 1);
END $d$;

-- W2: gestor em OUTRA unidade é rejeitado (coord_a gerindo wsB com lider de wsA)
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='tecB.wsB'),
    (SELECT mid FROM _m WHERE key='lider1.wsA'));
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W2 gestor fora do workspace do alvo', false,
    to_jsonb('manager must belong to the same workspace as the target'::text),
    to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W2 gestor fora do workspace do alvo',
    m LIKE 'manager must belong to the same workspace as the target',
    to_jsonb('manager must belong to the same workspace as the target'::text),
    to_jsonb(m), 1, 1);
END $d$;

-- W3: gestor FORA da árvore do chamador (usei o coord peer como gestor)
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='tec2.wsA'),
    (SELECT mid FROM _m WHERE key='coord_b.wsA'));
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W3 gestor fora da árvore do chamador', false,
    to_jsonb('manager is outside the coordinator scope in this unit'::text),
    to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W3 gestor fora da árvore do chamador',
    m LIKE 'manager is outside the coordinator scope in this unit',
    to_jsonb('manager is outside the coordinator scope in this unit'::text),
    to_jsonb(m), 1, 1);
END $d$;

-- W4: lider->lider vetado pela guarda 046 (depois do escopo do RPC passar)
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='lider2.wsA'),
    (SELECT mid FROM _m WHERE key='lider1.wsA'));
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W4 lider->lider vetado pela guarda 046', false,
    to_jsonb('a lider cannot directly manage another lider in the same workspace'::text),
    to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W4 lider->lider vetado pela guarda 046',
    m LIKE 'a lider cannot directly manage another lider in the same workspace',
    to_jsonb('a lider cannot directly manage another lider in the same workspace'::text),
    to_jsonb(m), 1, 1);
END $d$;

-- W5: a membership de coordenação é a RAIZ (não se auto-edita)
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='coord_a.wsA'),
    NULL);
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W5 membership de coordenação é a raiz', false,
    to_jsonb('coordination membership is the root of the unit and has no manager'::text),
    to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W5 membership de coordenação é a raiz',
    m LIKE 'coordination membership is the root of the unit and has no manager',
    to_jsonb('coordination membership is the root of the unit and has no manager'::text),
    to_jsonb(m), 1, 1);
END $d$;

-- W6: alvo inexistente
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager('__MISSING__'::uuid, NULL);
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W6 alvo inexistente', false,
    to_jsonb('target membership not found'::text), to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W6 alvo inexistente',
    m LIKE 'target membership not found',
    to_jsonb('target membership not found'::text), to_jsonb(m), 1, 1);
END $d$;

-- W7: gestor inexistente
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='tec1.wsA'),
    '__MISSING__'::uuid);
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W7 gestor inexistente', false,
    to_jsonb('manager membership not found'::text), to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W7 gestor inexistente',
    m LIKE 'manager membership not found',
    to_jsonb('manager membership not found'::text), to_jsonb(m), 1, 1);
END $d$;

-- W8: alvo com status NÃO-ativo é rejeitado (mesmo para remoção por NULL)
UPDATE public.memberships SET status='removed' WHERE id=(SELECT mid FROM _m WHERE key='tec2.wsA');
DO $d$
DECLARE m text;
BEGIN
  PERFORM public.coordinator_set_manager(
    (SELECT mid FROM _m WHERE key='tec2.wsA'),
    NULL);
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W8 alvo inativo', false,
    to_jsonb('target membership must be active'::text), to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('W8 alvo não-ativo',
    m LIKE 'target membership must be active%',
    to_jsonb('target membership must be active (found ...)'::text), to_jsonb(m), 1, 1);
END $d$;
UPDATE public.memberships SET status='active' WHERE id=(SELECT mid FROM _m WHERE key='tec2.wsA');

-- W9: POSITIVO — re-parentar tec2 para a equipe do lider2
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='tec2.wsA'),
  (SELECT mid FROM _m WHERE key='lider2.wsA'));
SELECT pg_temp._chk(
  'W9 re-parenta tec2 para a equipe do lider2',
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider2.wsA')) = 1
    AND pg_temp._j_team((SELECT mid FROM _m WHERE key='lider2.wsA')) @> jsonb_build_array(
      (SELECT mid FROM _m WHERE key='tec2.wsA')),
  '1'::jsonb,
  to_jsonb(pg_temp._tm((SELECT mid FROM _m WHERE key='lider2.wsA'))), 1,
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider2.wsA')));

-- W10: remoção por NULL (tec1 sai da equipe do lider1)
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='tec1.wsA'),
  NULL);
SELECT pg_temp._chk(
  'W10 NULL remove tec1 da equipe do lider1',
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA')) = 0
    AND pg_temp._j_team((SELECT mid FROM _m WHERE key='lider1.wsA')) = '[]'::jsonb,
  '0'::jsonb,
  to_jsonb(pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA'))), 0,
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA')));

-- W10b: re-admitir tec1 na equipe do lider1 (positivo pós-remoção)
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='tec1.wsA'),
  (SELECT mid FROM _m WHERE key='lider1.wsA'));

-- W11: remover LIDERANÇA da árvore (lider1 lots da árvore) e restaurar
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='lider1.wsA'),
  NULL);
SELECT pg_temp._chk(
  'W11 NULL remove lider1 da árvore do coordenador',
  pg_temp._cl('__WS_A__'::uuid) = 1,
  '1'::jsonb, to_jsonb(pg_temp._cl('__WS_A__'::uuid)), 1, pg_temp._cl('__WS_A__'::uuid));
SELECT public.coordinator_set_manager(
  (SELECT mid FROM _m WHERE key='lider1.wsA'),
  (SELECT mid FROM _m WHERE key='coord_a.wsA'));

-- ================= C: guarda 046 (gestor fora de cargo de liderança) =================
-- Ciclo real é estruturalmente inviável (coords pares + sem lider->lider); a
-- guarda 046 rejeita o gestor de cargo não-liderança ANTES de qualquer ciclo.
DO $d$
DECLARE m text;
BEGIN
  UPDATE public.memberships m
     SET managed_by = (SELECT mid FROM _m WHERE key='tec1.wsA')
   WHERE m.id = (SELECT mid FROM _m WHERE key='lider1.wsA');
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('C1 guarda 046: gestor tec rejeitado (ciclo inviável)', false,
    to_jsonb('manager must be a leadership role'::text), to_jsonb('no exception raised'::text), 1, 0);
EXCEPTION WHEN OTHERS THEN
  m := SQLERRM;
  INSERT INTO _t(name, ok, expected, actual, n_expected, n_actual)
  VALUES ('C1 guarda 046: gestor tec rejeitado (ciclo inviável)',
    m LIKE 'manager must be a leadership role%',
    to_jsonb('manager must be a leadership role'::text), to_jsonb(m), 1, 1);
END $d$;

-- ================= A: ACL no catálogo REAL =================
SELECT pg_temp._chk(
  'A1 anon NÃO executa coordinator_set_manager',
  NOT has_function_privilege('anon', 'public.coordinator_set_manager(uuid, uuid)', 'EXECUTE'),
  'false'::jsonb,
  to_jsonb(has_function_privilege('anon', 'public.coordinator_set_manager(uuid, uuid)', 'EXECUTE')),
  0, 0);
SELECT pg_temp._chk(
  'A2 anon NÃO executa get_coordinator_units',
  NOT has_function_privilege('anon', 'public.get_coordinator_units()', 'EXECUTE'),
  'false'::jsonb,
  to_jsonb(has_function_privilege('anon', 'public.get_coordinator_units()', 'EXECUTE')),
  0, 0);
SELECT pg_temp._chk(
  'A3 authenticated EXECUTA coordinator_set_manager',
  has_function_privilege('authenticated', 'public.coordinator_set_manager(uuid, uuid)', 'EXECUTE'),
  'true'::jsonb,
  to_jsonb(has_function_privilege('authenticated', 'public.coordinator_set_manager(uuid, uuid)', 'EXECUTE')),
  1, 1);
SELECT pg_temp._chk(
  'A4 authenticated EXECUTA is_coordinator_of',
  has_function_privilege('authenticated', 'public.is_coordinator_of(uuid)', 'EXECUTE'),
  'true'::jsonb,
  to_jsonb(has_function_privilege('authenticated', 'public.is_coordinator_of(uuid)', 'EXECUTE')),
  1, 1);

-- ================= X: integridade final (como coord_a) =================
SELECT set_config('request.jwt.claim.sub', '__COORD_A__'::text, true),
       set_config('request.jwt.claims',
         '{"sub":"__COORD_A__","role":"authenticated"}'::jsonb::text, true);

SELECT pg_temp._chk(
  'X1 final: ainda 2 unidades',
  pg_temp._cu() = 2, '2'::jsonb, to_jsonb(pg_temp._cu()), 2, pg_temp._cu());

SELECT pg_temp._chk(
  'X2 final: lideranças wsA = {lider1, lider2}',
  pg_temp._cl('__WS_A__'::uuid) = 2 AND pg_temp._j_leaders('__WS_A__'::uuid) @> jsonb_build_array(
    (SELECT mid FROM _m WHERE key='lider1.wsA'),
    (SELECT mid FROM _m WHERE key='lider2.wsA')),
  '2'::jsonb, to_jsonb(pg_temp._cl('__WS_A__'::uuid)), 2, pg_temp._cl('__WS_A__'::uuid));

SELECT pg_temp._chk(
  'X3 final: equipe lider1 = {tec1} (restaurado)',
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA')) = 1
    AND pg_temp._j_team((SELECT mid FROM _m WHERE key='lider1.wsA')) @> jsonb_build_array(
      (SELECT mid FROM _m WHERE key='tec1.wsA')),
  '1'::jsonb,
  to_jsonb(pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA'))), 1,
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider1.wsA')));

SELECT pg_temp._chk(
  'X4 final: equipe lider2 = {tec2} (W9)',
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider2.wsA')) = 1
    AND pg_temp._j_team((SELECT mid FROM _m WHERE key='lider2.wsA')) @> jsonb_build_array(
      (SELECT mid FROM _m WHERE key='tec2.wsA')),
  '1'::jsonb,
  to_jsonb(pg_temp._tm((SELECT mid FROM _m WHERE key='lider2.wsA'))), 1,
  pg_temp._tm((SELECT mid FROM _m WHERE key='lider2.wsA')));

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
        print("[validate-047] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes", file=sys.stderr)
        return 2
    body = SQL
    for tok, val in T.items():
        body = body.replace(tok, val)
    body = body.replace("__USERS__", USERS_SQL)
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
        print(f"\n[OK] VALIDACAO 047 COMPLETA: todos os {verdict[0]['total_checks']} checks passaram (transacao revertida)")
        return 0
    print(f"\n[FAIL] FALHAS: {verdict[0]['failed']}", file=sys.stderr)
    print(f"[FAIL] ACTUAL:   {verdict[0].get('failed_actual')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())