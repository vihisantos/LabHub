#!/usr/bin/env python3
"""Validação COMPORTAMENTAL da migration 049 (Fase 9.1-B — unificar
user_belongs_to_workspace() para ler memberships active) contra o DEV.

Estratégia (uma transação por request, ROLLBACK no fim — nenhum resíduo):
  - Request 1 "rls_behavior": simula sessões autenticadas de verdade via
    `SET ROLE authenticated` + GUC `request.jwt.claim.sub` (mesmo harness usado
    pelo validate_rbac2_coordinator_047_dev.py). Fixtures são criadas como
    postgres (BYPASSRLS); cada identidade roda sob RLS real.
    PROVA de não-recursão é EMPÍRICA: SELECT em `memberships` (full scan) e em
    tabelas cujas policies dependem indiretamente do helper (`assets`,
    `workspaces`) — se houvesse loop/recursão, o request falharia (HTTP 400).
  - Request 2 "structural_acl": como postgres — props das funções (SECURITY
    DEFINER/STABLE/search_path), origem sem workspace_ids, ACL sem anon/PUBLIC
    nas duas sobrecargas, RLS de memberships + policy intacta, dono com
    BYPASSRLS, e o CONJUNTO das policies dependentes (76, baseline PRÉ-049
    capturado no início desta fase) — igual pós-049.
  - Request 3 "residuo-zero": nenhum fixture sobrou + baseline informativo de
    UUIDs fantasma pré/independente-049.

Cenários (80+ checks) cobrem §3.7 do desenho 9.1 e os Invariantes 1-3,5:
  - active = autorizado (uuid e text); super admin preservado nas policies;
  - suspended/removed/pending = fail-closed (mesmo com workspace_ids ainda
    contendo o UUID — drift demonstrado);
  - cross-workspace negado nas duas direções; sem membership = negado;
  - chamada direta da função; consumidores indiretos (assets/workspaces);
  - antes/depois: conjunto de policies dependentes intacto.

Requer: migrations 036..049 aplicadas no alvo (memberships 036, trigger 041,
ducação 044, purge 048, helper 049).

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_ubtw_049_dev.py
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

REF = ""
TOKEN = ""

WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
WS_C = "33333333-3333-3333-3333-333333333333"

PFX = "bbbbbbbb-0000-0000-0000-0000000000"
P = {
    "joe":   f"{PFX}01",  # [A,B]   membro ativo nos dois
    "jane":  f"{PFX}02",  # [A]
    "bob":   f"{PFX}03",  # [B]
    "cal":   f"{PFX}04",  # [C]     (cross-workspace p/ usuarios de A/B)
    "dora":  f"{PFX}05",  # [C]
    "sus":   f"{PFX}06",  # [A]     membership -> suspended
    "rem":   f"{PFX}07",  # [A]     membership -> removed
    "pend":  f"{PFX}08",  # [A]     membership -> pending
    "nobm":  f"{PFX}09",  # []      sem membership
    "super": f"{PFX}10",  # [A] is_super_admin -> sem membership (041)
}

ALL_PIDS = ", ".join(f"'{pid}'" for pid in P.values())
USERS_SQL = ",\n".join(f"  ('{pid}', 'test.ubtw049.{key}@example.com')" for key, pid in P.items())

# Baseline PRÉ-049 (capturado em 2026-09-08 via pg_policies no DEV): as 76
# policies cujo USING/WITH CHECK referencia user_belongs_to_workspace.
BASELINE_DEPENDENT = """
pcare|action_logs|action_logs_insert|INSERT
pcare|action_logs|action_logs_select|SELECT
pcare|action_logs|action_logs_update|UPDATE
pcare|checklist_templates|checklist_templates_delete|DELETE
pcare|checklist_templates|checklist_templates_insert|INSERT
pcare|checklist_templates|checklist_templates_select|SELECT
pcare|checklist_templates|checklist_templates_update|UPDATE
pcare|maintenance|pcare_maintenance_delete|DELETE
pcare|maintenance|pcare_maintenance_insert|INSERT
pcare|maintenance|pcare_maintenance_select|SELECT
pcare|maintenance|pcare_maintenance_update|UPDATE
pcare|part_usage|part_usage_delete|DELETE
pcare|part_usage|part_usage_insert|INSERT
pcare|part_usage|part_usage_select|SELECT
pcare|part_usage|part_usage_update|UPDATE
pcare|parts|parts_delete|DELETE
pcare|parts|parts_insert|INSERT
pcare|parts|parts_select|SELECT
pcare|parts|parts_update|UPDATE
pcare|pc_checklists|pc_checklists_delete|DELETE
pcare|pc_checklists|pc_checklists_insert|INSERT
pcare|pc_checklists|pc_checklists_select|SELECT
pcare|pc_checklists|pc_checklists_update|UPDATE
pcare|pcs|pcs_delete|DELETE
pcare|pcs|pcs_insert|INSERT
pcare|pcs|pcs_select|SELECT
pcare|pcs|pcs_update|UPDATE
public|app_data_backups|app_data_backups_select|SELECT
public|assets|public_assets_insert|INSERT
public|assets|public_assets_select|SELECT
public|assets|public_assets_update|UPDATE
public|membership_overrides|membership_overrides_select|SELECT
public|memberships|memberships_select|SELECT
public|notifications|notifications_insert|INSERT
public|notifications|notifications_select|SELECT
public|notifications|notifications_update|UPDATE
public|role_permissions|role_permissions_select|SELECT
public|roles|roles_select|SELECT
public|tablet_reservations|tablet_reservations_insert|INSERT
public|tablet_reservations|tablet_reservations_select|SELECT
public|tablet_reservations|tablet_reservations_update|UPDATE
public|tv_music_requests|tv_music_requests_select|SELECT
public|workspace_app_settings|workspace_app_settings_select|SELECT
public|workspaces|workspaces_select|SELECT
stock|notifications|notifications_insert|INSERT
stock|notifications|notifications_select|SELECT
stock|notifications|notifications_update|UPDATE
stock|stock_inventory_counts|stock_inventory_counts_delete|DELETE
stock|stock_inventory_counts|stock_inventory_counts_insert|INSERT
stock|stock_inventory_counts|stock_inventory_counts_select|SELECT
stock|stock_inventory_counts|stock_inventory_counts_update|UPDATE
stock|stock_inventory_cycles|stock_inventory_cycles_delete|DELETE
stock|stock_inventory_cycles|stock_inventory_cycles_insert|INSERT
stock|stock_inventory_cycles|stock_inventory_cycles_select|SELECT
stock|stock_inventory_cycles|stock_inventory_cycles_update|UPDATE
stock|stock_items|stock_items_delete|DELETE
stock|stock_items|stock_items_insert|INSERT
stock|stock_items|stock_items_select|SELECT
stock|stock_items|stock_items_update|UPDATE
stock|stock_kits|stock_kits_delete|DELETE
stock|stock_kits|stock_kits_insert|INSERT
stock|stock_kits|stock_kits_select|SELECT
stock|stock_kits|stock_kits_update|UPDATE
stock|stock_maintenance|stock_maintenance_delete|DELETE
stock|stock_maintenance|stock_maintenance_insert|INSERT
stock|stock_maintenance|stock_maintenance_select|SELECT
stock|stock_maintenance|stock_maintenance_update|UPDATE
stock|stock_movements|stock_movements_delete|DELETE
stock|stock_movements|stock_movements_insert|INSERT
stock|stock_movements|stock_movements_select|SELECT
stock|stock_movements|stock_movements_update|UPDATE
stock|stock_photos|stock_photos_delete|DELETE
stock|stock_photos|stock_photos_insert|INSERT
stock|stock_photos|stock_photos_select|SELECT
stock|stock_photos|stock_photos_update|UPDATE
""".strip()
BASELINE_DEPENDENT_SET = frozenset(BASELINE_DEPENDENT.splitlines())


def _literal_uuid_list(item: str) -> str:
    return "'{" + item + "}'::uuid[]"


def _role_slug(role: str) -> str:
    return {"joe": "tec", "jane": "tec", "bob": "tec", "cal": "tec", "dora": "tec",
            "sus": "tec", "rem": "tec", "pend": "tec", "nobm": "tec"}.get(role, "tec")


HELPERS_SQL = """
CREATE TEMP TABLE _t(id serial PRIMARY KEY, name text, ok boolean, detail jsonb);
CREATE FUNCTION pg_temp._chk(p_name text, p_ok boolean, p_detail jsonb) RETURNS void AS $f$
  INSERT INTO _t(name, ok, detail) VALUES (p_name, p_ok, p_detail);
$f$ LANGUAGE sql VOLATILE;
GRANT USAGE, SELECT ON SEQUENCE _t_id_seq TO authenticated;
CREATE FUNCTION pg_temp._ms(p uuid) RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ws', m.workspace_id::text, 'st', m.status) ORDER BY m.workspace_id), '[]'::jsonb)
  FROM public.memberships m
  WHERE m.profile_id = p;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._scan() RETURNS int AS $f$
  SELECT count(*)::int FROM public.memberships;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._asset(p_ws uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.assets ad WHERE ad.workspace_id = p_ws;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._wsset() RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(w.id::text ORDER BY w.id), '[]'::jsonb) FROM public.workspaces w;
$f$ LANGUAGE sql STABLE;
GRANT ALL ON _t TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp._chk(text, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp._ms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp._scan() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp._asset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp._wsset() TO authenticated;
"""

FIXTURES_SQL = f"""
DELETE FROM public.workspaces WHERE id IN ('{WS_A}','{WS_B}','{WS_C}');
DELETE FROM public.assets WHERE asset_tag IN ('asset-049-a','asset-049-c');
DELETE FROM auth.users WHERE id IN ({ALL_PIDS});

INSERT INTO public.workspaces (id, name, slug) VALUES
  ('{WS_A}', 'WS A test-049', 'ws-a-049'),
  ('{WS_B}', 'WS B test-049', 'ws-b-049'),
  ('{WS_C}', 'WS C test-049', 'ws-c-049');

INSERT INTO auth.users (id, email) VALUES
{USERS_SQL};

UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["joe"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["jane"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["bob"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["cal"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["dora"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["sus"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["rem"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["pend"]}';
UPDATE public.profiles SET status='active', role='technician' WHERE id='{P["nobm"]}';
UPDATE public.profiles SET status='active', role='technician', is_super_admin=true WHERE id='{P["super"]}';

-- Memberships diretas (9.3-C: sem trigger 041; mesmo conjunto de antes).
-- super fica sem membership (by design, como o sync fazia).
INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
SELECT v.pid::uuid, v.ws::uuid, r.id, 'active'
FROM (VALUES
  ('{P["joe"]}', '{WS_A}', 'tec'), ('{P["joe"]}', '{WS_B}', 'tec'),
  ('{P["jane"]}', '{WS_A}', 'tec'),
  ('{P["bob"]}', '{WS_B}', 'tec'),
  ('{P["cal"]}', '{WS_C}', 'tec'),
  ('{P["dora"]}', '{WS_C}', 'tec'),
  ('{P["sus"]}', '{WS_A}', 'tec'),
  ('{P["rem"]}', '{WS_A}', 'tec'),
  ('{P["pend"]}', '{WS_A}', 'tec')
) AS v(pid, ws, slug)
JOIN public.roles r ON r.slug = v.slug
ON CONFLICT (profile_id, workspace_id) DO UPDATE SET
  role_id = EXCLUDED.role_id, status = 'active', updated_at = now();

-- Dead-letter de status de membership (normalização fora do escopo 9.1): o
-- drift fica em memberships.status, NÃO em profiles — invariavelmente o objetivo.
UPDATE public.memberships SET status='suspended' WHERE profile_id='{P["sus"]}'  AND workspace_id='{WS_A}';
UPDATE public.memberships SET status='removed'   WHERE profile_id='{P["rem"]}'  AND workspace_id='{WS_A}';
UPDATE public.memberships SET status='pending'   WHERE profile_id='{P["pend"]}' AND workspace_id='{WS_A}';

-- Consumidores indiretos do helper (suas policies chamam user_belongs_to_workspace):
INSERT INTO public.assets (workspace_id, asset_tag, equipment_type) VALUES
  ('{WS_A}', 'asset-049-a', 'Impressora'),
  ('{WS_C}', 'asset-049-c', 'Notebook');

-- Número total de memberships da fixture (para o full-scan do super admin):
CREATE TEMP TABLE _meta(k text PRIMARY KEY, v int);
INSERT INTO _meta VALUES ('total_memberships', (
  SELECT count(*)::int FROM public.memberships
  WHERE profile_id IN ({ALL_PIDS})));
GRANT ALL ON _meta TO authenticated;
"""

IDENTITY = """
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', {uid}::text, true),
       set_config('request.jwt.claims', jsonb_build_object('sub', {uid}::text, 'role', 'authenticated')::text, true);
"""

SUMMARY_SQL = """
RESET ROLE;
SELECT
  coalesce(bool_and(ok), false) AS all_ok,
  count(*) FILTER (WHERE NOT ok) AS fails,
  coalesce(jsonb_agg(name ORDER BY id) FILTER (WHERE NOT ok), '[]'::jsonb) AS failed,
  count(*) AS total_checks,
  jsonb_agg(jsonb_build_object('id', id, 'name', name, 'ok', ok, 'detail', detail) ORDER BY id) AS details
FROM _t;
"""

L_T = "''::text"
T = "::text"

SQL_BEHAVIOR = f"""
BEGIN;
{HELPERS_SQL}
{FIXTURES_SQL}

-- ===================== IDENTIDADE: joe [A,B] =====================
{IDENTITY.replace('{uid}', "'" + P["joe"] + "'")}

SELECT pg_temp._chk('J1 joe: funcao uuid(A)=true, (B)=true',
  public.user_belongs_to_workspace('{WS_A}') AND public.user_belongs_to_workspace('{WS_B}'),
  jsonb_build_object('A', public.user_belongs_to_workspace('{WS_A}'), 'B', public.user_belongs_to_workspace('{WS_B}')));
SELECT pg_temp._chk('J2 joe: funcao uuid(C)=false, NULL=false (fail-closed)',
  NOT public.user_belongs_to_workspace('{WS_C}') AND NOT public.user_belongs_to_workspace(NULL),
  jsonb_build_object('C', public.user_belongs_to_workspace('{WS_C}'), 'NULL', public.user_belongs_to_workspace(NULL)));
SELECT pg_temp._chk('J3 joe: funcao text(A)=true, text(C)=false, ""=false, NULL=false',
  public.user_belongs_to_workspace('{WS_A}'{T}) AND NOT public.user_belongs_to_workspace('{WS_C}'{T})
    AND NOT public.user_belongs_to_workspace(''{T}) AND NOT public.user_belongs_to_workspace(NULL),
  jsonb_build_object('A', public.user_belongs_to_workspace('{WS_A}'{T}), 'C', public.user_belongs_to_workspace('{WS_C}'{T}),
                     'vazio', public.user_belongs_to_workspace(''{T})));
SELECT pg_temp._chk('J4 joe: le a propria membership (2 linhas)',
  pg_temp._ms('{P["joe"]}') = '[{{"ws":"{WS_A}","st":"active"}},{{"ws":"{WS_B}","st":"active"}}]'::jsonb,
  jsonb_build_object('ms', pg_temp._ms('{P["joe"]}')));
SELECT pg_temp._chk('J5 joe: ve membership de jane no MESMO workspace (A) — 1 linha',
  (SELECT count(*) FROM public.memberships WHERE profile_id='{P["jane"]}') = 1,
  jsonb_build_object('n', (SELECT count(*)::int FROM public.memberships WHERE profile_id='{P["jane"]}')));
SELECT pg_temp._chk('J6 joe: NAO ve quem so existe em C (cal/dora) — cross-workspace negado',
  (SELECT count(*) FROM public.memberships WHERE profile_id IN ('{P["cal"]}','{P["dora"]}')) = 0,
  jsonb_build_object('n', (SELECT count(*)::int FROM public.memberships WHERE profile_id IN ('{P["cal"]}','{P["dora"]}'))));
SELECT pg_temp._chk('J7 joe: full-scan memberships SEM recurssao/loop = 7 (rows em A,B)',
  pg_temp._scan() = 7,
  jsonb_build_object('n', pg_temp._scan()));
SELECT pg_temp._chk('J8 joe: consumidor indireto assets — ve asset A (1), nao C (0)',
  pg_temp._asset('{WS_A}') = 1 AND pg_temp._asset('{WS_C}') = 0,
  jsonb_build_object('A', pg_temp._asset('{WS_A}'), 'C', pg_temp._asset('{WS_C}')));
SELECT pg_temp._chk('J9 joe: workspaces_select — vê A e B, nao C',
  pg_temp._wsset() = '["{WS_A}","{WS_B}"]'::jsonb,
  jsonb_build_object('wss', pg_temp._wsset()));

-- ===================== IDENTIDADE: jane [A] =====================
{IDENTITY.replace('{uid}', "'" + P["jane"] + "'")}

SELECT pg_temp._chk('A1 jane: fn(A)=true, fn(B)=false, fn(C)=false',
  public.user_belongs_to_workspace('{WS_A}') AND NOT public.user_belongs_to_workspace('{WS_B}')
    AND NOT public.user_belongs_to_workspace('{WS_C}'),
  jsonb_build_object('A', public.user_belongs_to_workspace('{WS_A}'), 'B', public.user_belongs_to_workspace('{WS_B}'),
                     'C', public.user_belongs_to_workspace('{WS_C}')));
SELECT pg_temp._chk('A2 jane: full-scan = 5 (rows em A)',
  pg_temp._scan() = 5,
  jsonb_build_object('n', pg_temp._scan()));
SELECT pg_temp._chk('A3 jane: NAO ve bob (B-only) — cross-workspace',
  (SELECT count(*) FROM public.memberships WHERE profile_id='{P["bob"]}') = 0,
  jsonb_build_object('n', (SELECT count(*)::int FROM public.memberships WHERE profile_id='{P["bob"]}')));
SELECT pg_temp._chk('A4 jane: consumidor indireto assets — ve A (1), nao C (0)',
  pg_temp._asset('{WS_A}') = 1 AND pg_temp._asset('{WS_C}') = 0,
  jsonb_build_object('A', pg_temp._asset('{WS_A}'), 'C', pg_temp._asset('{WS_C}')));
SELECT pg_temp._chk('A5 jane: workspaces_select — vê so A',
  pg_temp._wsset() = '["{WS_A}"]'::jsonb,
  jsonb_build_object('wss', pg_temp._wsset()));

-- ===================== IDENTIDADE: bob [B] =====================
{IDENTITY.replace('{uid}', "'" + P["bob"] + "'")}

SELECT pg_temp._chk('B1 bob: fn(B)=true, fn(A)=false',
  public.user_belongs_to_workspace('{WS_B}') AND NOT public.user_belongs_to_workspace('{WS_A}'),
  jsonb_build_object('B', public.user_belongs_to_workspace('{WS_B}'), 'A', public.user_belongs_to_workspace('{WS_A}')));
SELECT pg_temp._chk('B2 bob: full-scan = 2 (rows em B); nao ve jane',
  pg_temp._scan() = 2 AND (SELECT count(*) FROM public.memberships WHERE profile_id='{P["jane"]}') = 0,
  jsonb_build_object('n', pg_temp._scan()));

-- ===================== IDENTIDADE: cal [C] =====================
{IDENTITY.replace('{uid}', "'" + P["cal"] + "'")}

SELECT pg_temp._chk('C1 cal: fn(C)=true, fn(A)=false; full-scan = 2 (rows em C)',
  public.user_belongs_to_workspace('{WS_C}') AND NOT public.user_belongs_to_workspace('{WS_A}') AND pg_temp._scan() = 2,
  jsonb_build_object('C', public.user_belongs_to_workspace('{WS_C}'), 'A', public.user_belongs_to_workspace('{WS_A}'),
                     'n', pg_temp._scan()));

-- ===================== IDENTIDADE: sus (membership suspended) =====================
{IDENTITY.replace('{uid}', "'" + P["sus"] + "'")}

SELECT pg_temp._chk('S1 sus: fn(A)=FALSE apesar de workspace_ids=[A] (drift negado; memberships e a autoridade)',
  NOT public.user_belongs_to_workspace('{WS_A}')
    AND (SELECT '{WS_A}' = ANY (COALESCE(workspace_ids, ARRAY[]::uuid[])) FROM public.profiles WHERE id='{P["sus"]}'),
  jsonb_build_object('fn', public.user_belongs_to_workspace('{WS_A}'),
                     'workspace_ids_ainda_contem_A', (SELECT '{WS_A}' = ANY (COALESCE(workspace_ids, ARRAY[]::uuid[])) FROM public.profiles WHERE id='{P["sus"]}')));
SELECT pg_temp._chk('S2 sus: full-scan = 0 (nada visivel; fail-closed)',
  pg_temp._scan() = 0,
  jsonb_build_object('n', pg_temp._scan()));

-- ===================== IDENTIDADE: rem (membership removed) =====================
{IDENTITY.replace('{uid}', "'" + P["rem"] + "'")}

SELECT pg_temp._chk('R1 rem: fn(A)=false; full-scan = 0',
  NOT public.user_belongs_to_workspace('{WS_A}') AND pg_temp._scan() = 0,
  jsonb_build_object('fn', public.user_belongs_to_workspace('{WS_A}'), 'n', pg_temp._scan()));

-- ===================== IDENTIDADE: pend (membership pending) =====================
{IDENTITY.replace('{uid}', "'" + P["pend"] + "'")}

SELECT pg_temp._chk('P1 pend: fn(A)=false; full-scan = 0',
  NOT public.user_belongs_to_workspace('{WS_A}') AND pg_temp._scan() = 0,
  jsonb_build_object('fn', public.user_belongs_to_workspace('{WS_A}'), 'n', pg_temp._scan()));

-- ===================== IDENTIDADE: nobm (sem membership) =====================
{IDENTITY.replace('{uid}', "'" + P["nobm"] + "'")}

SELECT pg_temp._chk('N1 nobm: fn(A/B/C)=false; full-scan = 0; nao ve ninguem',
  NOT public.user_belongs_to_workspace('{WS_A}') AND NOT public.user_belongs_to_workspace('{WS_B}')
    AND NOT public.user_belongs_to_workspace('{WS_C}') AND pg_temp._scan() = 0,
  jsonb_build_object('A', public.user_belongs_to_workspace('{WS_A}'), 'B', public.user_belongs_to_workspace('{WS_B}'),
                     'C', public.user_belongs_to_workspace('{WS_C}'), 'n', pg_temp._scan()));

-- ===================== IDENTIDADE: super (is_super_admin, sem membership) =====================
{IDENTITY.replace('{uid}', "'" + P["super"] + "'")}

SELECT pg_temp._chk('SU1 super: funcao sozinha = FALSE (sem membership; Invariante 3)',
  NOT public.user_belongs_to_workspace('{WS_A}') AND NOT public.user_belongs_to_workspace('{WS_B}') AND NOT public.user_belongs_to_workspace('{WS_C}'),
  jsonb_build_object('A', public.user_belongs_to_workspace('{WS_A}'), 'B', public.user_belongs_to_workspace('{WS_B}'), 'C', public.user_belongs_to_workspace('{WS_C}')));
SELECT pg_temp._chk('SU2 super: RLS via policy (is_super_admin OR helper) ve TODAS as memberships = 9',
  pg_temp._scan() = (SELECT v FROM _meta WHERE k='total_memberships'),
  jsonb_build_object('ve', pg_temp._scan(), 'total', (SELECT v FROM _meta WHERE k='total_memberships')));

{SUMMARY_SQL}
ROLLBACK;
"""

SQL_STRUCTURAL = f"""
BEGIN;
{HELPERS_SQL}

SELECT pg_temp._chk('ST1 duas sobrecargas (text,uuid) existem',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace') = 2,
  jsonb_build_object('n', (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace')));
SELECT pg_temp._chk('ST2 SECURITY DEFINER + STABLE + search_path=public nas 2 sobrecargas',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND p.prosecdef AND p.provolatile='s' AND p.proconfig = ARRAY['search_path=public']) = 2,
  jsonb_build_object('n', (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND p.prosecdef AND p.provolatile='s' AND p.proconfig = ARRAY['search_path=public'])));
SELECT pg_temp._chk('ST3 origem lê memberships active e NÃO usa mais workspace_ids',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND p.prosrc ILIKE '%public.memberships%' AND p.prosrc ILIKE '%status%'
       AND p.prosrc NOT ILIKE '%workspace_ids%') = 2,
  jsonb_build_object('ok_overloads', (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND p.prosrc ILIKE '%public.memberships%' AND p.prosrc ILIKE '%status%'
       AND p.prosrc NOT ILIKE '%workspace_ids%')));
SELECT pg_temp._chk('ST4 ACL: anon/PUBLIC SEM EXECUTE nas 2 sobrecargas',
  (SELECT count(*) FROM pg_proc p
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,'{{}}'::aclitem[])) acl
     JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND (acl.grantee='anon'::regrole OR acl.grantee=0)) = 0,
  jsonb_build_object('found', (SELECT count(*)::int FROM pg_proc p
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,'{{}}'::aclitem[])) acl
     JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND (acl.grantee='anon'::regrole OR acl.grantee=0))));
SELECT pg_temp._chk('ST5 ACL: authenticated + service_role COM EXECUTE nas 2 sobrecargas',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{{}}'::aclitem[])) acl
                   WHERE acl.grantee IN ('authenticated'::regrole,'service_role'::regrole))) = 2,
  jsonb_build_object('n', (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace'
       AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{{}}'::aclitem[])) acl
                   WHERE acl.grantee IN ('authenticated'::regrole,'service_role'::regrole)))));
SELECT pg_temp._chk('ST6 donos tem BYPASSRLS (premissa de nao-recursao)',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace' AND r.rolbypassrls) = 2,
  jsonb_build_object('n', (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
     WHERE n.nspname='public' AND p.proname='user_belongs_to_workspace' AND r.rolbypassrls)));
SELECT pg_temp._chk('ST7 memberships com RLS ativa e memberships_select dependente do helper',
  (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='memberships') IS TRUE
    AND (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='memberships'
       AND p.policyname='memberships_select' AND p.qual ILIKE '%user_belongs_to_workspace%') = 1,
  jsonb_build_object('rls', (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='memberships')));

{SUMMARY_SQL}
ROLLBACK;
"""

SQL_RESIDUE = f"""
SELECT jsonb_build_object(
  'ws_a', (SELECT count(*)::int FROM public.workspaces WHERE id='{WS_A}'),
  'ws_b', (SELECT count(*)::int FROM public.workspaces WHERE id='{WS_B}'),
  'ws_c', (SELECT count(*)::int FROM public.workspaces WHERE id='{WS_C}'),
  'fixture_profiles', (SELECT count(*)::int FROM public.profiles WHERE id IN ({ALL_PIDS})),
  'fixture_auth_users', (SELECT count(*)::int FROM auth.users WHERE id IN ({ALL_PIDS})),
  'fixture_assets', (SELECT count(*)::int FROM public.assets WHERE asset_tag IN ('asset-049-a','asset-049-c')),
  'stale_baseline_independente_049', (SELECT count(*)::int FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.workspace_ids, ARRAY[]::uuid[])) wd
                   LEFT JOIN public.workspaces w ON w.id = wd WHERE w.id IS NULL))
) AS residue;
"""

SQL_DEPENDENT_POST = """
SELECT string_agg(sch || '|' || tbl || '|' || pol || '|' || cmd, E'\\n' ORDER BY sch, tbl, pol, cmd) AS dep
FROM (
  SELECT DISTINCT schemaname AS sch, tablename AS tbl, policyname AS pol, cmd
  FROM pg_policies
  WHERE qual ILIKE '%user_belongs_to_workspace%'
     OR with_check ILIKE '%user_belongs_to_workspace%'
) d;
"""


def _load_env() -> None:
    if load_dotenv is None:
        return
    for name in (".env", ".env.local"):
        path = PROJECT_ROOT / name
        if path.is_file():
            load_dotenv(path, override=False)


def _post(sql: str, tag: str) -> list:
    url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
    resp = requests.post(
        url,
        json={"query": sql},
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        timeout=240,
    )
    print(f"\n=== [{tag}] HTTP {resp.status_code} ===")
    if resp.status_code >= 300:
        print(resp.text[:3000], file=sys.stderr)
        raise SystemExit(2)
    return resp.json()


def _run_stage(sql: str, tag: str) -> list[str]:
    verdict = _post(sql, tag)
    row = verdict[0] if verdict else {}
    failed = row.get("failed") or []
    print(json.dumps(row.get("details") or [], indent=2, ensure_ascii=False))
    if row.get("all_ok") is not True:
        print(f"  >> FALHAS nesta etapa: {failed}", file=sys.stderr)
    else:
        print(f"  >> OK ({row.get('total_checks')} checks) — transacao revertida.")
    return list(failed)


def main() -> int:
    global REF, TOKEN
    _load_env()
    REF = os.environ.get("SUPABASE_PROJECT_REF", "")
    TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not REF or not TOKEN:
        print("[validate] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes", file=sys.stderr)
        return 2

    failed: list[str] = []

    failed += _run_stage(SQL_BEHAVIOR, "rls_behavior (SET ROLE authenticated + JWT)")

    failed += _run_stage(SQL_STRUCTURAL, "structural_acl (postgres)")

    # Antes/depois: conjunto de policies dependentes do helper não pode mudar.
    dep_raw = _post(SQL_DEPENDENT_POST, "dependent_policies_post_049")
    dep_set = frozenset((dep_raw[0].get("dep") or "").splitlines())
    if dep_set == BASELINE_DEPENDENT_SET:
        print(f"\n[OK] Policies dependentes inalteradas: {len(dep_set)} (idênticas ao baseline pré-049).")
    else:
        only_post = sorted(dep_set - BASELINE_DEPENDENT_SET)
        only_base = sorted(BASELINE_DEPENDENT_SET - dep_set)
        print(f"\n[FAIL] Policies dependentes mudaram: só-pós-049={only_post} só-pré={only_base}", file=sys.stderr)
        failed.append("dependent_policies_mismatch")

    residue = _post(SQL_RESIDUE, "residuo-zero")
    rs = residue[0].get("residue", {}) if residue else {}
    print(json.dumps(rs, indent=2, ensure_ascii=False))
    leaks = [k for k in ("ws_a", "ws_b", "ws_c", "fixture_profiles", "fixture_auth_users", "fixture_assets")
             if rs.get(k, 0) != 0]
    if leaks:
        print(f"\n[FAIL] Resíduo detectado: {leaks}", file=sys.stderr)
        failed.append("residue")
    else:
        print("\n[OK] ZERO RESIDUO: nenhum fixture sobrou no banco (ROLLBACKs efetivos).")
    print(f"[INFO] Baseline de UUIDs fantasma independente-049 no DEV: {rs.get('stale_baseline_independente_049', 0)}.")

    if failed:
        print(f"\n[FAIL] FALHAS {len(failed)}: {failed}", file=sys.stderr)
        return 1
    print("\n[OK] VALIDACAO 9.1-B COMPLETA: comportamento + estrutura + policies dependentes + zero residuo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())