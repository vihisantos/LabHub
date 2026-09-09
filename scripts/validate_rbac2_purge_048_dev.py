#!/usr/bin/env python3
"""Validação COMPORTAMENTAL da migration 048 (Fase 9.1-A — purge de UUIDs
fantasma em profiles.workspace_ids ao excluir um workspace) contra o DEV.

Cada STAGE roda numa transação própria (1 request à Management API) com
ROLLBACK no fim: nenhum resíduo é persistido. Um request final confirma zero
resíduo no banco (mesmo padrão do validate_rbac2_trigger_dev.py).

Garante as provas exigidas na revisão do design 9.1 (§2.9):
  - STAGE 1 — cenário integrado workspace A (workspace_ids + membership active
    + managed_by configurado com lider) → DELETE A → array limpo, memberships
    seguem a política (CASCADE), managed_by sem entidade inválida, workspace
    não reaparece, 041 não recria associação; múltiplos profiles apontando para
    A; [A,B] → [B]; profile sem A / com workspace_ids NULL → não quebra;
    invariantes 1/2; ordem real CASCADE / SET NULL × AFTER DELETE (estado final
    verificado).
  - STAGE 2 — múltiplas exclusões no MESMO statement (DELETE ... WHERE id IN
    (A, C)) — exige transition table (a proposta textual do design usava OLD.id
    em statement trigger, inválido em PG); um profile com [A,C] só vira [] sem
    erro de dupla atualização.
  - STAGE 3 — DELETE no-op (transição vazia) não quebra e não altera estado;
    nenhuma recursão.
  - FINAL — zero resíduo após os ROLLBACKs (fixtures não existem mais) +
    baseline informativo de UUIDs fantasma pré-migration.

Nota: fixtures nascem pelo CAMINHO REAL (INSERT auth.users → handle_new_user
cria profile; "aprovação" = UPDATE em profiles, disparando o trigger 041 que
cria memberships). managed_by exige cargo de liderança (guarda 045/046), por
isso o gestor do cenário é um perfil 'lider'.

Requer: migrations 036..048 aplicadas no alvo (memberships 036, trigger 041,
managed_by/guarda 045/046, purge 048).

Uso:
    SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
        python scripts/validate_rbac2_purge_048_dev.py
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
WS_G = "99999999-9999-9999-9999-999999999999"  # inexistente (DELETE no-op)

PFX = "bbbbbbbb-0000-0000-0000-0000000000"
P = {
    "tec": f"{PFX}01",     # technician   ws [A,B]
    "tec2": f"{PFX}02",    # technician   ws [A]
    "view": f"{PFX}03",    # viewer       ws [A]  (gerenciado pelo lider)
    "view2": f"{PFX}04",   # viewer       ws [A]  (idem)
    "bonly": f"{PFX}05",   # viewer       ws [B]  (sem A)
    "multi": f"{PFX}06",   # technician   ws [A,C] (estressa multi-delete no same stmt)
    "nullws": f"{PFX}07",  # viewer       workspace_ids NULL (não quebra)
    "super": f"{PFX}08",   # admin        ws [A], is_super_admin (041 → 0 memberships)
    "lider": f"{PFX}09",   # lider        ws [A] (gestor do managed_by — 046 exige cargo de liderança)
}

ALL_PIDS = ", ".join(f"'{pid}'" for pid in P.values())
USERS_SQL = ",\n".join(
    f"  ('{pid}', 'test.purge048.{key}@example.com')" for key, pid in P.items()
)

# Blocos SQL reaproveitados entre stages (cada stage = 1 transação própria).
# ----------------------------------------------------------------------------
HELPERS_SQL = """
CREATE TEMP TABLE _t(id serial PRIMARY KEY, name text, ok boolean, detail jsonb);
CREATE FUNCTION pg_temp._ws(p uuid) RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(t.ws::text ORDER BY t.ord), '[]'::jsonb)
  FROM public.profiles pr
  CROSS JOIN LATERAL unnest(COALESCE(pr.workspace_ids, ARRAY[]::uuid[]))
    WITH ORDINALITY AS t(ws, ord)
  WHERE pr.id = p;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._ms(p uuid) RETURNS jsonb AS $f$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ws', m.workspace_id::text, 'role', r.slug, 'st', m.status)
    ORDER BY m.workspace_id), '[]'::jsonb)
  FROM public.memberships m JOIN public.roles r ON r.id = m.role_id
  WHERE m.profile_id = p;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._cnt(p uuid) RETURNS int AS $f$
  SELECT count(*)::int FROM public.memberships m WHERE m.profile_id = p;
$f$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._chk(name text, ok boolean, detail jsonb) RETURNS void AS $f$
  INSERT INTO _t(name, ok, detail) VALUES (name, ok, detail);
$f$ LANGUAGE sql VOLATILE;
"""

FIXTURES_SQL = f"""
DELETE FROM public.workspaces WHERE id IN ('{WS_A}','{WS_B}','{WS_C}');
DELETE FROM auth.users WHERE id IN ({ALL_PIDS});

INSERT INTO public.workspaces (id, name, slug) VALUES
  ('{WS_A}', 'WS A test-048', 'ws-a-048'),
  ('{WS_B}', 'WS B test-048', 'ws-b-048'),
  ('{WS_C}', 'WS C test-048', 'ws-c-048');

INSERT INTO auth.users (id, email) VALUES
{USERS_SQL};

UPDATE public.profiles SET status='active', role='technician', workspace_ids=ARRAY['{WS_A}','{WS_B}']::uuid[] WHERE id='{P["tec"]}';
UPDATE public.profiles SET status='active', role='technician', workspace_ids=ARRAY['{WS_A}']::uuid[]          WHERE id='{P["tec2"]}';
UPDATE public.profiles SET status='active', role='viewer',     workspace_ids=ARRAY['{WS_A}']::uuid[]          WHERE id='{P["view"]}';
UPDATE public.profiles SET status='active', role='viewer',     workspace_ids=ARRAY['{WS_A}']::uuid[]          WHERE id='{P["view2"]}';
UPDATE public.profiles SET status='active', role='viewer',     workspace_ids=ARRAY['{WS_B}']::uuid[]          WHERE id='{P["bonly"]}';
UPDATE public.profiles SET status='active', role='technician', workspace_ids=ARRAY['{WS_A}','{WS_C}']::uuid[] WHERE id='{P["multi"]}';
UPDATE public.profiles SET status='active', role='viewer',     workspace_ids=NULL                           WHERE id='{P["nullws"]}';
UPDATE public.profiles SET status='active', role='admin',      workspace_ids=ARRAY['{WS_A}']::uuid[], is_super_admin=true WHERE id='{P["super"]}';
UPDATE public.profiles SET status='active', role='lider',      workspace_ids=ARRAY['{WS_A}']::uuid[]          WHERE id='{P["lider"]}';

-- Relação de gestão em A (guardas 045/046: mesmo ws, gestor ativo, sob cargo de liderança, sem self)
UPDATE public.memberships SET managed_by = (
  SELECT mgr.id FROM public.memberships mgr
  WHERE mgr.profile_id='{P["lider"]}' AND mgr.workspace_id='{WS_A}')
WHERE profile_id='{P["view"]}'  AND workspace_id='{WS_A}';
UPDATE public.memberships SET managed_by = (
  SELECT mgr.id FROM public.memberships mgr
  WHERE mgr.profile_id='{P["lider"]}' AND mgr.workspace_id='{WS_A}')
WHERE profile_id='{P["view2"]}' AND workspace_id='{WS_A}';
"""

PRE_CHECKS = f"""
SELECT pg_temp._chk('P0 workspace A existe + tec memberships A,B',
  (SELECT count(*) FROM public.workspaces WHERE id='{WS_A}') = 1
    AND pg_temp._cnt('{P["tec"]}') = 2,
  jsonb_build_object('tec_ws', pg_temp._ws('{P["tec"]}'), 'tec_ms', pg_temp._ms('{P["tec"]}')));
SELECT pg_temp._chk('P1 memberships em A = 6 (tec, tec2, view, view2, multi, lider)',
  (SELECT count(*) FROM public.memberships WHERE workspace_id='{WS_A}') = 6,
  jsonb_build_object('memb_em_A', (SELECT count(*)::int FROM public.memberships WHERE workspace_id='{WS_A}')));
SELECT pg_temp._chk('P2 managed_by: view/view2 gerenciados pelo lider em A',
  (SELECT count(*) FROM public.memberships
    WHERE workspace_id='{WS_A}'
      AND managed_by = (SELECT mgr.id FROM public.memberships mgr WHERE mgr.profile_id='{P["lider"]}' AND mgr.workspace_id='{WS_A}')) = 2,
  jsonb_build_object('links', (SELECT count(*)::int FROM public.memberships WHERE workspace_id='{WS_A}' AND managed_by IS NOT NULL)));
SELECT pg_temp._chk('P3 multi tem memberships em A e C ([A,C])',
  pg_temp._cnt('{P["multi"]}') = 2 AND pg_temp._ws('{P["multi"]}') = '["{WS_A}","{WS_C}"]'::jsonb,
  jsonb_build_object('ws', pg_temp._ws('{P["multi"]}'), 'cnt', pg_temp._cnt('{P["multi"]}')));
SELECT pg_temp._chk('P4 nullws sem memberships (workspace_ids NULL)',
  pg_temp._cnt('{P["nullws"]}') = 0,
  jsonb_build_object('cnt', pg_temp._cnt('{P["nullws"]}')));
SELECT pg_temp._chk('P5 super admin sem memberships (041)',
  pg_temp._cnt('{P["super"]}') = 0,
  jsonb_build_object('cnt', pg_temp._cnt('{P["super"]}')));
"""

STAGE1_CHECKS = f"""
SELECT pg_temp._chk('S1 workspace A nao reaparece (count=0)',
  (SELECT count(*) FROM public.workspaces WHERE id='{WS_A}') = 0,
  jsonb_build_object('left', (SELECT count(*)::int FROM public.workspaces WHERE id='{WS_A}')));
SELECT pg_temp._chk('S2 nenhum profile referencia mais A (multiplos profiles purgados)',
  (SELECT count(*) FROM public.profiles WHERE '{WS_A}' = ANY (COALESCE(workspace_ids, ARRAY[]::uuid[]))) = 0,
  jsonb_build_object('still_ref', (SELECT count(*)::int FROM public.profiles WHERE '{WS_A}' = ANY (COALESCE(workspace_ids, ARRAY[]::uuid[])))));
SELECT pg_temp._chk('S3 tec: [A,B] -> [B] (A removido, B permanece)',
  pg_temp._ws('{P["tec"]}') = '["{WS_B}"]'::jsonb,
  jsonb_build_object('ws', pg_temp._ws('{P["tec"]}')));
SELECT pg_temp._chk('S4 tec: membership so em B (1 linha) - 041 nao recriou A',
  pg_temp._ms('{P["tec"]}') = '[{{"ws":"{WS_B}","role":"tec","st":"active"}}]'::jsonb AND pg_temp._cnt('{P["tec"]}') = 1,
  jsonb_build_object('ms', pg_temp._ms('{P["tec"]}'), 'cnt', pg_temp._cnt('{P["tec"]}')));
SELECT pg_temp._chk('S5 tec2/view/view2/lider: array [] e memberships 0',
  pg_temp._cnt('{P["tec2"]}') = 0 AND pg_temp._cnt('{P["view"]}') = 0 AND pg_temp._cnt('{P["view2"]}') = 0
    AND pg_temp._cnt('{P["lider"]}') = 0
    AND pg_temp._ws('{P["tec2"]}') = '[]'::jsonb AND pg_temp._ws('{P["view"]}') = '[]'::jsonb
    AND pg_temp._ws('{P["lider"]}') = '[]'::jsonb,
  jsonb_build_object('tec2', jsonb_build_object('ws', pg_temp._ws('{P["tec2"]}'), 'cnt', pg_temp._cnt('{P["tec2"]}')),
                     'view', jsonb_build_object('ws', pg_temp._ws('{P["view"]}'), 'cnt', pg_temp._cnt('{P["view"]}')),
                     'lider', jsonb_build_object('ws', pg_temp._ws('{P["lider"]}'), 'cnt', pg_temp._cnt('{P["lider"]}'))));
SELECT pg_temp._chk('S6 bonly (sem A) intacto [B] / multi: [A,C] -> [C]',
  pg_temp._ws('{P["bonly"]}') = '["{WS_B}"]'::jsonb
    AND pg_temp._ms('{P["bonly"]}') = '[{{"ws":"{WS_B}","role":"vis","st":"active"}}]'::jsonb
    AND pg_temp._ws('{P["multi"]}') = '["{WS_C}"]'::jsonb,
  jsonb_build_object('bonly', pg_temp._ws('{P["bonly"]}'), 'multi', pg_temp._ws('{P["multi"]}')));
SELECT pg_temp._chk('S7 nullws: workspace_ids NULL permanece NULL (nao quebra)',
  (SELECT workspace_ids IS NULL FROM public.profiles WHERE id='{P["nullws"]}') IS TRUE,
  jsonb_build_object('nullws_still_null', (SELECT workspace_ids IS NULL FROM public.profiles WHERE id='{P["nullws"]}')));
SELECT pg_temp._chk('S8 super: array [] (era [A]) e sem memberships',
  pg_temp._ws('{P["super"]}') = '[]'::jsonb AND pg_temp._cnt('{P["super"]}') = 0,
  jsonb_build_object('ws', pg_temp._ws('{P["super"]}')));
SELECT pg_temp._chk('S9 memberships do workspace A todas removidas (CASCADE)',
  (SELECT count(*) FROM public.memberships WHERE workspace_id='{WS_A}') = 0,
  jsonb_build_object('memb_A', (SELECT count(*)::int FROM public.memberships WHERE workspace_id='{WS_A}')));
SELECT pg_temp._chk('S10 managed_by sem entidade invalida (nenhum orfao)',
  (SELECT count(*) FROM public.memberships m WHERE m.managed_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.memberships x WHERE x.id = m.managed_by)) = 0,
  jsonb_build_object('orphans', (SELECT count(*)::int FROM public.memberships m WHERE m.managed_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.memberships x WHERE x.id = m.managed_by))));
SELECT pg_temp._chk('S11 INVARIANTE 1: nenhum profile referencia workspace inexistente',
  (SELECT count(*) FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.workspace_ids, ARRAY[]::uuid[])) wd
                   LEFT JOIN public.workspaces w ON w.id = wd
                   WHERE w.id IS NULL)) = 0,
  jsonb_build_object('dead_refs', (SELECT count(*)::int FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.workspace_ids, ARRAY[]::uuid[])) wd
                   LEFT JOIN public.workspaces w ON w.id = wd
                   WHERE w.id IS NULL))));
SELECT pg_temp._chk('S12 INVARIANTE 2: memberships so em workspaces existentes',
  (SELECT count(*) FROM public.memberships m
     WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = m.workspace_id)) = 0,
  jsonb_build_object('dead_mem', (SELECT count(*)::int FROM public.memberships m
     WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = m.workspace_id))));
"""

STAGE2_CHECKS = f"""
SELECT pg_temp._chk('M1 A e C excluidos (ambos count=0)',
  (SELECT count(*) FROM public.workspaces WHERE id IN ('{WS_A}','{WS_C}')) = 0,
  jsonb_build_object('left', (SELECT count(*)::int FROM public.workspaces WHERE id IN ('{WS_A}','{WS_C}'))));
SELECT pg_temp._chk('M2 nenhum profile referencia A nem C (transição multi-lida sem erro)',
  (SELECT count(*) FROM public.profiles
     WHERE ARRAY['{WS_A}','{WS_C}']::uuid[] && COALESCE(workspace_ids, ARRAY[]::uuid[])) = 0,
  jsonb_build_object('still_ref', (SELECT count(*)::int FROM public.profiles
     WHERE ARRAY['{WS_A}','{WS_C}']::uuid[] && COALESCE(workspace_ids, ARRAY[]::uuid[]))));
SELECT pg_temp._chk('M3 multi [A,C] -> [] (ambos removidos, sem dupla-atualizacao)',
  pg_temp._ws('{P["multi"]}') = '[]'::jsonb AND pg_temp._cnt('{P["multi"]}') = 0,
  jsonb_build_object('ws', pg_temp._ws('{P["multi"]}'), 'cnt', pg_temp._cnt('{P["multi"]}')));
SELECT pg_temp._chk('M4 tec: [A,B] com A,C deletados -> [B] (B sobrevive)',
  pg_temp._ws('{P["tec"]}') = '["{WS_B}"]'::jsonb AND pg_temp._cnt('{P["tec"]}') = 1,
  jsonb_build_object('ws', pg_temp._ws('{P["tec"]}'), 'ms', pg_temp._ms('{P["tec"]}')));
SELECT pg_temp._chk('M5 bonly [B] intacto; lider sem memberships',
  pg_temp._ws('{P["bonly"]}') = '["{WS_B}"]'::jsonb
    AND pg_temp._cnt('{P["bonly"]}') = 1
    AND pg_temp._cnt('{P["lider"]}') = 0,
  jsonb_build_object('bonly', jsonb_build_object('ws', pg_temp._ws('{P["bonly"]}'), 'cnt', pg_temp._cnt('{P["bonly"]}')),
                     'lider_cnt', pg_temp._cnt('{P["lider"]}')));
SELECT pg_temp._chk('M6 INVARIANTE 1 e 2 ainda valem (sem dead refs)',
  (SELECT count(*) FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.workspace_ids, ARRAY[]::uuid[])) wd
                   LEFT JOIN public.workspaces w ON w.id = wd WHERE w.id IS NULL)) = 0
    AND (SELECT count(*) FROM public.memberships m
         WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = m.workspace_id)) = 0,
  jsonb_build_object('dead_profile_refs', (SELECT count(*)::int FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.workspace_ids, ARRAY[]::uuid[])) wd
                   LEFT JOIN public.workspaces w ON w.id = wd WHERE w.id IS NULL)),
                     'dead_memberships', (SELECT count(*)::int FROM public.memberships m
         WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = m.workspace_id))));
SELECT pg_temp._chk('M7 managed_by sem orfaos apos multi-delete',
  (SELECT count(*) FROM public.memberships m WHERE m.managed_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.memberships x WHERE x.id = m.managed_by)) = 0,
  jsonb_build_object('orphans', (SELECT count(*)::int FROM public.memberships m WHERE m.managed_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.memberships x WHERE x.id = m.managed_by))));
"""

STAGE3_CHECKS = f"""
SELECT pg_temp._chk('N1 DELETE no-op (transição vazia) executa sem erro e nao altera nada',
  (SELECT count(*) FROM public.workspaces WHERE id='{WS_A}') = 1
    AND pg_temp._ws('{P["tec"]}') = '["{WS_A}","{WS_B}"]'::jsonb
    AND pg_temp._cnt('{P["tec"]}') = 2,
  jsonb_build_object('tec', pg_temp._ws('{P["tec"]}'), 'cnt', pg_temp._cnt('{P["tec"]}')));
"""

SUMMARY_SQL = """
SELECT
  coalesce(bool_and(ok), false) AS all_ok,
  count(*) FILTER (WHERE NOT ok) AS fails,
  coalesce(jsonb_agg(name ORDER BY id) FILTER (WHERE NOT ok), '[]'::jsonb) AS failed,
  count(*) AS total_checks,
  jsonb_agg(jsonb_build_object('id', id, 'name', name, 'ok', ok, 'detail', detail) ORDER BY id) AS details
FROM _t;
"""


def _stage(checks: str, delete_sql: str, tag: str) -> str:
    return (
        "BEGIN;\n" + HELPERS_SQL + FIXTURES_SQL + PRE_CHECKS
        + delete_sql + "\n" + checks
        + SUMMARY_SQL + "\nROLLBACK;\n"
    )


SQL_STAGES = {
    "stage1_single_delete": _stage(STAGE1_CHECKS, f"DELETE FROM public.workspaces WHERE id = '{WS_A}';", "single delete A"),
    "stage2_multi_delete": _stage(STAGE2_CHECKS, f"DELETE FROM public.workspaces WHERE id IN ('{WS_A}', '{WS_C}');", "multi delete A,C"),
    "stage3_noop_delete": _stage(STAGE3_CHECKS, f"DELETE FROM public.workspaces WHERE id = '{WS_G}';", "no-op delete"),
}

SQL_RESIDUE = f"""
SELECT jsonb_build_object(
  'ws_a', (SELECT count(*)::int FROM public.workspaces WHERE id='{WS_A}'),
  'ws_b', (SELECT count(*)::int FROM public.workspaces WHERE id='{WS_B}'),
  'ws_c', (SELECT count(*)::int FROM public.workspaces WHERE id='{WS_C}'),
  'fixture_profiles', (SELECT count(*)::int FROM public.profiles WHERE id IN ({ALL_PIDS})),
  'fixture_auth_users', (SELECT count(*)::int FROM auth.users WHERE id IN ({ALL_PIDS})),
  'stale_baseline_pre_migration', (SELECT count(*)::int FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.workspace_ids, ARRAY[]::uuid[])) wd
                   LEFT JOIN public.workspaces w ON w.id = wd WHERE w.id IS NULL))
) AS residue;
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
        timeout=180,
    )
    print(f"\n=== [{tag}] HTTP {resp.status_code} ===")
    if resp.status_code >= 300:
        print(resp.text[:1500], file=sys.stderr)
        raise SystemExit(2)
    return resp.json()


def main() -> int:
    global REF, TOKEN
    _load_env()
    REF = os.environ.get("SUPABASE_PROJECT_REF", "")
    TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not REF or not TOKEN:
        print("[validate] ERRO: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN ausentes", file=sys.stderr)
        return 2

    failed_anywhere: list[str] = []
    total_checks = 0
    for tag, sql in SQL_STAGES.items():
        verdict = _post(sql, tag)
        row = verdict[0] if verdict else {}
        total_checks += int(row.get("total_checks") or 0)
        failed = row.get("failed") or []
        failed_anywhere.extend(failed)
        print(json.dumps(row.get("details") or [], indent=2, ensure_ascii=False))
        if row.get("all_ok") is not True:
            print(f"  >> FALHAS nesta stage: {failed}", file=sys.stderr)
        else:
            print(f"  >> OK ({row.get('total_checks')} checks) — transacao revertida.")

    if failed_anywhere:
        print(f"\n[FAIL] FALHAS {len(failed_anywhere)}: {failed_anywhere}", file=sys.stderr)
        return 1

    print(f"\n[OK] VALIDACAO COMPLETA: todos os {total_checks} checks passaram (cada stage revertida)\n")

    residue = _post(SQL_RESIDUE, "residuo-zero")
    rs = residue[0].get("residue", {}) if residue else {}
    print(json.dumps(rs, indent=2, ensure_ascii=False))
    leaks = [k for k in ("ws_a", "ws_b", "ws_c", "fixture_profiles", "fixture_auth_users") if rs.get(k, 0) != 0]
    if leaks:
        print(f"\n[FAIL] Resíduo detectado: {leaks}", file=sys.stderr)
        return 1
    print("\n[OK] ZERO RESIDUO: nenhum fixture sobrou no banco (ROLLBACKs efetivos).")
    stale = rs.get("stale_baseline_pre_migration", 0)
    print(f"[INFO] Baseline de UUIDs fantasma PRÉ-migration no DEV: {stale} (dados pré-048; decisão separada).")
    return 0


if __name__ == "__main__":
    sys.exit(main())