#!/usr/bin/env python3
"""Adversarial RLS matrix â€” Migration 044 hardening profiles/workspaces (DEV).

Executa a matriz de testes da etapa 044-C contra o DEV Supabase com um
CLIENTE AUTENTICADO real (GoTrue login password + REST com anon key), SEM
service key â€” exatamente o caminho que o frontend usa (RLS se aplica).

Fixtures criadas via scripts/e2e_db.py (DEV obskpmnphevpaexooldg):
  sa   (super admin, is_super_admin=true, sem memberships, role admin)
  a1   (viewer, membership ACTIVE em WS-A)        <- ator principal sout
  a2   (viewer, membership ACTIVE em WS-A e WS-C) <- multi-workspace
  b1   (viewer, membership ACTIVE em WS-B)        <- outro workspace
  c1   (viewer, membership ACTIVE em WS-C)        <- outro workspace
  ap1  (viewer, membership PENDING em WS-A)       <- pending nao confere visib.
  nosm (viewer, SEM membership, workspace_ids={}) <- sem capability
  wnx  (viewer, workspace_ids=[uuid inexistente]) <- P7 para em outro ws

Workspaces: e2e-ws-a=11111111-... / b=2222... / c=3333...
"""
from __future__ import annotations

import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

try:
    from dotenv import load_dotenv

    load_dotenv(".env", override=False)
except Exception:
    pass

import requests

URL = os.environ["SUPABASE_URL"]
ANON = os.environ.get("SUPABASE_ANON_KEY") or os.environ["VITE_SUPABASE_ANON_KEY"]
PASS = os.environ.get("E2E_PASSWORD", "E2eDefault#2026x!")

WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
WS_C = "33333333-3333-3333-3333-333333333333"
WS_GHOST = "44444444-4444-4444-4444-444444444444"

results: list[tuple[bool, str, str]] = []


def check(name: str, ok: bool, evidence: str = "") -> None:
    results.append((ok, name, evidence))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" :: {evidence}" if evidence else ""))


def login(email: str) -> str:
    r = requests.post(
        f"{URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": PASS},
        timeout=30,
    )
    if r.status_code >= 300:
        raise SystemExit(f"login {email} falhou HTTP {r.status_code}: {r.text[:200]}")
    return r.json()["access_token"]


def rest(table: str, token: str, *, select: str = "*", query: dict | None = None) -> list:
    url = f"{URL}/rest/v1/{table}"
    params = {"select": select}
    if query:
        params.update(query)
    r = requests.get(
        url,
        params=params,
        headers={"apikey": ANON, "Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if r.status_code >= 400:
        return [{"__error__": f"{r.status_code}: {r.text[:200]}"}]
    return r.json()


def rpc(fn: str, token: str, body: dict) -> dict:
    r = requests.post(
        f"{URL}/rest/v1/rpc/{fn}",
        headers={"apikey": ANON, "Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    return {"status": r.status_code, "text": r.text[:200]}


def email_of(rows: list) -> list[str]:
    return sorted({r.get("email", "") for r in rows if "email" in r})


def run() -> int:
    toks = {e: login(e) for e in (
        "sa@e2e-rls.example.com", "a1@e2e-rls.example.com", "a2@e2e-rls.example.com",
        "b1@e2e-rls.example.com", "c1@e2e-rls.example.com", "ap1@e2e-rls.example.com",
        "nosm@e2e-rls.example.com", "wnx@e2e-rls.example.com")}

    a1, a2, b1, c1, sa, ap1, nosm, wnx = (toks[e] for e in (
        "a1@e2e-rls.example.com", "a2@e2e-rls.example.com", "b1@e2e-rls.example.com",
        "c1@e2e-rls.example.com", "sa@e2e-rls.example.com", "ap1@e2e-rls.example.com",
        "nosm@e2e-rls.example.com", "wnx@e2e-rls.example.com"))

    # ---- PROFILES P1-P12 (tabela profiles) ----
    # P1 prÃ³prio
    rows = rest("profiles", a1, select="id,email", query={"id": "eq.d943e148-41af-42bc-9dec-f2ad0980273e"})
    check("P1 proprio ALLOW", len(rows) == 1 and rows[0].get("email") == "a1@e2e-rls.example.com",
          f"{len(rows)} rows")

    # P2 co-membro ativo (a2 em WS-A)
    rows = rest("profiles", a1, select="id,email", query={"id": "eq.e75f1155-cdaf-480f-95bf-6763e1f63239"})
    check("P2 co-member active ALLOW", len(rows) == 1, f"{len(rows)} rows")

    # P3 outro workspace (b1 em WS-B)
    rows = rest("profiles", a1, select="id,email", query={"id": "eq.e43c31e1-e17c-447d-9aff-6fb1647cb237"})
    check("P3 outro ws DENY", len(rows) == 0, f"{len(rows)} rows")

    # P4 multiplos ws (a2 vÃª c1, que estÃ¡ em WS-C, onde a2 Ã© membro)
    rows = rest("profiles", a2, select="id,email", query={"id": "eq.e0ddd621-c010-4cc6-a0b0-d4d62a130696"})
    check("P4 multi-ws ALLOW", len(rows) == 1, f"{len(rows)} rows")

    # P5 sem membership (nosm) visto por a1 -> DENY
    rows = rest("profiles", a1, select="id,email", query={"id": "eq.9b0a4aec-4742-40ef-ac3a-408046e2a4c2"})
    check("P5 sem membership DENY", len(rows) == 0, f"{len(rows)} rows")

    # P6 membership pending (ap1) visto por a1 (que Ã© membro ativo do mesmo ws) -> DENY
    rows = rest("profiles", a1, select="id,email", query={"id": "eq.7500bd40-2b2c-496e-8e35-8629e9724ce7"})
    check("P6 membership pending DENY", len(rows) == 0, f"{len(rows)} rows")

    # P7 workspace inexistente (wnx tem ws-ghost, sem membership) -> DENY
    rows = rest("profiles", a1, select="id,email", query={"id": "eq.d0f9ea2c-bde9-4f38-879e-e8eec26826b1"})
    check("P7 workspace inexistente DENY", len(rows) == 0, f"{len(rows)} rows")

    # P8 usuario inexistente -> DENY
    rows = rest("profiles", a1, select="id,email", query={"id": "eq.00000000-0000-0000-0000-000000000000"})
    check("P8 usuario inexistente DENY", len(rows) == 0, f"{len(rows)} rows")

    # P9 super admin ve todos
    rows = rest("profiles", sa, select="email")
    emails = email_of(rows)
    expect = {"sa@e2e-rls.example.com", "a1@e2e-rls.example.com", "a2@e2e-rls.example.com",
              "b1@e2e-rls.example.com", "c1@e2e-rls.example.com", "ap1@e2e-rls.example.com",
              "nosm@e2e-rls.example.com", "wnx@e2e-rls.example.com"}
    check("P9 super admin ALLOW todos", expect <= set(emails), f"{len(emails)} emails")

    # P10 super admin em ws nao pertencente -> ALLOW (bypass)
    rows = rest("profiles", sa, select="id,email", query={"id": "eq.e43c31e1-e17c-447d-9aff-6fb1647cb237"})
    check("P10 super admin bypass ALLOW", len(rows) == 1, f"{len(rows)} rows")

    # P11 UPDATE proprio (avatar)
    r = requests.patch(
        f"{URL}/rest/v1/profiles?id=eq.d943e148-41af-42bc-9dec-f2ad0980273e",
        headers={"apikey": ANON, "Authorization": f"Bearer {a1}", "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        json={"avatar": "e2e-rls-044"},
        timeout=30,
    )
    check("P11 update proprio ALLOW", r.status_code == 200, f"HTTP {r.status_code}")

    # P12 UPDATE role de outro nao-super (b1 por a1)
    r = requests.patch(
        f"{URL}/rest/v1/profiles?id=eq.e43c31e1-e17c-447d-9aff-6fb1647cb237",
        headers={"apikey": ANON, "Authorization": f"Bearer {a1}", "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        json={"role": "admin"},
        timeout=30,
    )
    check("P12 update outro DENY", r.status_code == 200 and r.json() == [],
          f"HTTP {r.status_code} rows={len(r.json())}")

    # ---- WORKSPACES W1-W10 ----
    rows = rest("workspaces", a1, select="id,name", query={"id": f"eq.{WS_A}"})
    check("W1 meu ws ALLOW", len(rows) == 1, f"{len(rows)} rows")

    rows = rest("workspaces", a1, select="id,name", query={"id": f"eq.{WS_B}"})
    check("W2 ws de outro DENY", len(rows) == 0, f"{len(rows)} rows")

    rows = rest("workspaces", a2, select="id,name")
    ids = sorted({r["id"] for r in rows})
    check("W3 multi-ws lista ALLOW", ids == [WS_A, WS_C], f"{ids}")

    rows = rest("workspaces", nosm, select="id,name")
    check("W4 sem membership DENY (vazio)", len(rows) == 0, f"{len(rows)} rows")

    rows = rest("workspaces", sa, select="id,name")
    ids = sorted({r["id"] for r in rows})
    check("W5 super admin ALLOW todos", ids == [WS_A, WS_B, WS_C], f"{ids}")

    rows = rest("workspaces", a1, select="id,name", query={"id": f"eq.{WS_B}"})
    check("W6 uuid conhecido outro ws DENY", len(rows) == 0, f"{len(rows)} rows")

    # W7 INSERT nao-super
    r = requests.post(
        f"{URL}/rest/v1/workspaces",
        headers={"apikey": ANON, "Authorization": f"Bearer {a1}", "Content-Type": "application/json"},
        json={"name": "E2E RLS NaoSuper", "slug": "e2e-rls-nosuper"},
        timeout=30,
    )
    check("W7 insert nao-super DENY", r.status_code == 400 or r.status_code == 403,
          f"HTTP {r.status_code}")

    # W8 INSERT super admin (cria temporario e apaga via W10/cleanup)
    import uuid as _uuid
    slug = f"e2e-rls-{_uuid.uuid4().hex[:8]}"
    r = requests.post(
        f"{URL}/rest/v1/workspaces",
        headers={"apikey": ANON, "Authorization": f"Bearer {sa}", "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        json={"name": "E2E RLS Super", "slug": slug},
        timeout=30,
    )
    created = r.json()[0]["id"] if r.status_code == 201 and r.json() else ""
    check("W8 insert super ALLOW", r.status_code == 201, f"HTTP {r.status_code}")

    # W9 DELETE nao-super
    r = requests.delete(
        f"{URL}/rest/v1/workspaces?id=eq.{WS_B}",
        headers={"apikey": ANON, "Authorization": f"Bearer {a1}",
                 "Prefer": "return=representation"},
        timeout=30,
    )
    body = r.json() if r.text else []
    check("W9 delete nao-super DENY", r.status_code == 200 and body == [],
          f"HTTP {r.status_code} rows={len(body)}")

    # W10 UPDATE super admin (no temp criado no W8); depois remove o temp
    r = requests.patch(
        f"{URL}/rest/v1/workspaces?id=eq.{created}",
        headers={"apikey": ANON, "Authorization": f"Bearer {sa}", "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        json={"color": "#0f0"},
        timeout=30,
    )
    check("W10 update super ALLOW", r.status_code == 200 and r.json(),
          f"HTTP {r.status_code} rows={len(r.json()) if r.json() else 0}")
    if created:
        requests.delete(
            f"{URL}/rest/v1/workspaces?id=eq.{created}",
            headers={"apikey": ANON, "Authorization": f"Bearer {sa}"},
            timeout=30,
        )

    # ---- ATAQUES A1-A10 ----
    # A1 uuid manipulation
    rows = rest("profiles", a1, select="id,email", query={"id": f"eq.{WS_GHOST}"})
    check("A1 uuid manipulation DENY", len(rows) == 0, f"{len(rows)} rows")

    # A2 email cross-ws DENY
    rows = rest("profiles", a1, select="email", query={"email": "eq.b1@e2e-rls.example.com"})
    check("A2 cross-ws email DENY", len(rows) == 0, f"{len(rows)} rows")

    # A3 import no esport (profiles Ã— memberships) â€” tenta ler memberships de outro ws
    rows = rest("memberships", a1, select="workspace_id,status")
    ids = sorted({r["workspace_id"] for r in rows})
    check("A3 memberships cross-ws DENY", WS_B not in ids, f"ws visiveis={ids}")

    # A4 funcao (RPC booleano) â€” sem vazamento de campos
    resp = rpc("profile_visible_to_me", a1, {"target_user": "e43c31e1-e17c-447d-9aff-6fb1647cb237"})
    check("A4 rpc bool sem vazamento", resp["status"] in (200, 404) and resp["text"] in ("false", "true"),
          f"status={resp['status']} body={resp['text']}")

    # A6 renderselect client (defaultDb from profiles) â€” lista reduzida (nao cross-ws)
    rows = rest("profiles", a1, select="email")
    emails = email_of(rows)
    check("A6 client profiles nao cross-ws DENY", "b1@e2e-rls.example.com" not in emails,
          f"visiveis para a1: {emails}")

    # A7 sem capability (nosm) â€” profiles so proprio; workspaces vazio
    rows = rest("profiles", nosm, select="email")
    emails = email_of(rows)
    check("A7 sem capability profiles DENY", emails == ["nosm@e2e-rls.example.com"], f"{emails}")

    # A8 super admin RBAC2 (flag) sem membership -> ainda ALLOW (is_super_admin)
    rows = rest("profiles", sa, select="id,email", query={"id": "eq.d0f9ea2c-bde9-4f38-879e-e8eec26826b1"})
    check("A8 super admin flag ALLOW", len(rows) == 1, f"{len(rows)} rows")

    # A10 poll pending (LoginPage select id,status eq proprio)
    rows = rest("profiles", a1, select="id,status", query={"id": "eq.d943e148-41af-42bc-9dec-f2ad0980273e"})
    check("A10 poll pending proprio ALLOW", len(rows) == 1 and rows[0].get("status") == "active",
          f"{len(rows)} rows")

    # A9 realtime â€” nao testavel aqui (canal -> websocket); coberto pelo resultado
    #    de SELECT filtrado (P3/P6/A6) + sem erro 42501 em qualquer select acima.

    failed = [n for ok, n, _ in results if not ok]
    print(f"\nRESULTADO: {len(results) - len(failed)}/{len(results)} PASS"
          + (f"  FALHAS: {failed}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())