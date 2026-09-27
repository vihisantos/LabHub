#!/usr/bin/env python3
"""Helper de fixtures E2E RBAC 2.0 contra o DEV (Management API, service-side).

Subcomandos:
  bootstrap                 cria workspaces fixture e2e-ws-a/b/c (idempotente)
  signup-state EMAIL        estado do profile + contagem de memberships (JSON)
  approve EMAIL [ASSIGNMENTS]
                            RBAC 2.0 (PR-3/#296). Aprovação global é SÓ o
                            status (pending -> active). ASSIGNMENTS é opcional
                            e configura o ACESSO por unidade, no formato
                            <workspace_slug>:<role>, separados por vírgula:
                              approve user@x.com e2e-ws-a:tecnico,e2e-ws-b:lider
                            Cada assignment vira uma membership via RPC 072
                            (admin_upsert_membership). Sem assignments, apenas
                            aprova. Aprovação e acesso são operações distintas.
                            NÃO usa a 052 (conjunto + cargo único) nem escreve
                            workspace_ids.
  memberships EMAIL         lista memberships {ws, role, status} (JSON)
  suspend EMAIL | activate EMAIL | set-super EMAIL true|false
  confirm-email EMAIL       marca email_confirmed_at (equivale ao clique no link)
  action-seeds ROLE         Actions semeadas da role (JSON)
  cleanup PREFIX            remove usuários prefix% + workspaces e2e-ws-%
  residue                   contagens de resíduo (JSON)
"""
from __future__ import annotations

import json
import os
import sys

import requests

# Carrega .env (nunca sobrescreve variáveis já exportadas)
try:
    from dotenv import load_dotenv

    load_dotenv(".env", override=False)
except Exception:
    pass

REF = os.environ.get("SUPABASE_PROJECT_REF", "")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

WS = {
    "e2e-ws-a": "11111111-1111-1111-1111-111111111111",
    "e2e-ws-b": "22222222-2222-2222-2222-222222222222",
    "e2e-ws-c": "33333333-3333-3333-3333-333333333333",
}

ROLE_TO_SLUG = {
    "technician": "tec", "tecnico": "tec", "tec": "tec",
    "viewer": "vis", "vis": "vis",
    "admin": "adm", "adm": "adm",
    "coordinator": "coordinator",
    "lider": "lider",
}


def q(sql: str):
    r = requests.post(URL, json={"query": sql}, headers=HEADERS, timeout=120)
    if r.status_code >= 300:
        print(r.text[:400], file=sys.stderr)
        sys.exit(2)
    return r.json()


def rpc(fn: str, params: dict):
    """Chama RPC via PostgREST com service_role (mesmo caminho do endpoint admin)."""
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
                 "Content-Type": "application/json"},
        json=params,
        timeout=60,
    )
    if r.status_code >= 300:
        print(f"rpc {fn} HTTP {r.status_code}: {r.text[:400]}", file=sys.stderr)
        sys.exit(2)
    return r.json()


def out(obj):
    print(json.dumps(obj, ensure_ascii=False))


def esc(v: str) -> str:
    return v.replace("'", "''")


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""

    if cmd == "bootstrap":
        values = ", ".join(
            f"('{wid}', 'E2E WS {slug[-1].upper()}', '{slug}')"
            for slug, wid in WS.items()
        )
        q(f"""INSERT INTO public.workspaces (id, name, slug) VALUES {values}
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;""")
        out(WS)

    elif cmd == "signup-state":
        email = esc(sys.argv[2])
        rows = q(f"""SELECT p.status, p.role, p.workspace_ids::text AS ws,
                       (SELECT count(*) FROM public.memberships m WHERE m.profile_id = p.id) AS memberships
                     FROM public.profiles p WHERE p.email = '{email}'""")
        out(rows[0] if rows else {})

    elif cmd == "approve":
        # RBAC 2.0 (PR-3/#296): DUAS operações conceitualmente distintas.
        #   1. aprovação global ....... profiles.status: pending -> active
        #   2. configuração de acesso . memberships por unidade via RPC 072
        # A 052 (conjunto de workspaces + cargo único + espelho em
        # workspace_ids) NÃO é usada, e workspace_ids nunca é escrito aqui:
        # o espelho é recomputado pela própria 072.
        email = esc(sys.argv[2])
        spec = (sys.argv[3] if len(sys.argv) > 3 else "").strip()

        # Valida TUDO antes de qualquer escrita (falha não deixa estado parcial).
        planned = []
        for item in [s.strip() for s in spec.split(",") if s.strip()]:
            if ":" not in item:
                print(f"assignment inválido (esperado <workspace_slug>:<role>): {item}", file=sys.stderr)
                return 2
            ws_slug, role_raw = (p.strip() for p in item.split(":", 1))
            if ws_slug not in WS:
                print(f"workspace desconhecido: {ws_slug}", file=sys.stderr)
                return 2
            role_slug = ROLE_TO_SLUG.get(role_raw.lower())
            if not role_slug:
                print(f"role sem slug no servidor: {role_raw}", file=sys.stderr)
                return 2
            planned.append((ws_slug, role_slug))

        rows = q(f"SELECT id::text AS id FROM public.profiles WHERE email='{email}'")
        if not rows:
            print(f"profile não encontrado: {email}", file=sys.stderr)
            return 2
        uid = rows[0]["id"]

        # 1) Aprovação global. Precisa vir ANTES das memberships: a 072 exige
        #    conta ATIVA para conceder acesso.
        q(f"UPDATE public.profiles SET status='active' WHERE id='{uid}'")

        # 2) Configuração de acesso: uma chamada da 072 por unidade, cada uma
        #    com o cargo DAQUELA unidade (pode diferir entre unidades).
        granted = []
        for ws_slug, role_slug in planned:
            rpc("admin_upsert_membership", {
                "p_user_id": uid,
                "p_workspace_id": WS[ws_slug],
                "p_role_slug": role_slug,
            })
            granted.append({"workspace": ws_slug, "role": role_slug})

        out({"ok": True, "status": "active", "memberships": granted})

    elif cmd == "memberships":
        email = esc(sys.argv[2])
        rows = q(f"""SELECT w.slug AS ws, r.slug AS role, m.status
                     FROM public.memberships m
                     JOIN public.profiles p ON p.id = m.profile_id
                     JOIN public.workspaces w ON w.id = m.workspace_id
                     JOIN public.roles r ON r.id = m.role_id
                     WHERE p.email = '{email}' ORDER BY w.slug""")
        out(rows)

    elif cmd == "suspend":
        q(f"UPDATE public.profiles SET status='suspended' WHERE email='{esc(sys.argv[2])}'")
        out({"ok": True})

    elif cmd == "activate":
        q(f"UPDATE public.profiles SET status='active' WHERE email='{esc(sys.argv[2])}'")
        out({"ok": True})

    elif cmd == "set-super":
        q(f"UPDATE public.profiles SET is_super_admin={sys.argv[3]} WHERE email='{esc(sys.argv[2])}'")
        out({"ok": True})

    elif cmd == "create-user":
        # Via Auth Admin API (service_role, server-side): usuário 100% válido
        # para o GoTrue (aud/role/identity corretos) e SEM envio de e-mail.
        email = esc(sys.argv[2])
        name = sys.argv[3] if len(sys.argv) > 3 else "E2E User"
        password = sys.argv[4] if len(sys.argv) > 4 else "E2eDefault#2026x!"
        supabase_url = os.environ.get("SUPABASE_URL", "")
        service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        if not supabase_url or not service_key:
            print("SUPABASE_URL / SUPABASE_SERVICE_KEY ausentes", file=sys.stderr)
            return 2
        existing = q(f"SELECT id::text FROM auth.users WHERE email = '{email}'")
        if existing:
            out({"id": existing[0]["id"], "existed": True})
        else:
            r = requests.post(
                f"{supabase_url}/auth/v1/admin/users",
                headers={"apikey": service_key, "Authorization": f"Bearer {service_key}",
                          "Content-Type": "application/json"},
                json={"email": email, "password": password, "email_confirm": True,
                      "user_metadata": {"name": name}},
                timeout=30,
            )
            if r.status_code >= 300:
                print(f"admin/users HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
                return 2
            out({"id": r.json()["id"], "existed": False})

    elif cmd == "confirm-email":
        q(f"UPDATE auth.users SET email_confirmed_at = now() WHERE email='{esc(sys.argv[2])}'")
        out({"ok": True})

    elif cmd == "action-seeds":
        role = esc(sys.argv[2])
        rows = q(f"""SELECT rp.action FROM public.role_permissions rp
                     JOIN public.roles r ON r.id = rp.role_id
                     WHERE r.slug = '{role}' ORDER BY rp.action""")
        out([r["action"] for r in rows])

    elif cmd == "cleanup":
        prefix = esc(sys.argv[2])
        u = q(f"DELETE FROM auth.users WHERE email LIKE '{prefix}%' RETURNING email")
        w = q(f"DELETE FROM public.workspaces WHERE slug LIKE 'e2e-ws-%' RETURNING slug")
        out({"users_deleted": [r["email"] for r in u], "workspaces_deleted": [r["slug"] for r in w]})

    elif cmd == "residue":
        out(q("""SELECT (SELECT count(*) FROM public.profiles) AS profiles,
                        (SELECT count(*) FROM public.memberships) AS memberships,
                        (SELECT count(*) FROM public.workspaces) AS workspaces,
                        (SELECT count(*) FROM auth.users) AS auth_users""")[0])

    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
