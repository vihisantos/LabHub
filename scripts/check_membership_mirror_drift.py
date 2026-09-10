#!/usr/bin/env python3
"""Monitor de divergência espelho x memberships (RBAC 2.0 — Fase 9.3-D).

Janela de observação com o trigger 041 desligado: compara, por perfil,
`profiles.workspace_ids` (espelho/compat) contra memberships ATIVAS e
classifica divergências. Emite JSON + resumo humano.

READ-ONLY POR CONSTRUÇÃO: este script só executa GETs (requests.get).
NUNCA escreve, nunca chama RPCs de escrita e nunca executa a função de
sincronização legada — usá-la aqui mascararia o problema que a janela
existe para detectar (ver teste api/tests/test_drift_monitor_readonly.py).
Regra da janela: 🔴 registrar → investigar → decidir. Nunca auto-corrigir.

Uso:
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
        python scripts/check_membership_mirror_drift.py [--label DEV]

Códigos de saída:
    0 — só categorias esperadas (convergente, super_admin, nao_ativo,
        role_desconhecida);
    2 — divergência inesperada encontrada (investigar; NÃO corrigir aqui);
    1 — erro de infraestrutura (rede, credenciais, HTTP).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter

import requests

ROLE_TO_SLUG = {
    "technician": "tec", "role-technician": "tec",
    "viewer": "vis", "role-viewer": "vis",
    "admin": "adm", "role-admin": "adm",
    "coordinator": "coordinator", "role-coordinator": "coordinator",
    "lider": "lider", "role-lider": "lider",
}

EXPECTED_CATEGORIES = {"ok_convergente", "super_admin", "nao_ativo", "role_desconhecida"}


def fetch(url: str, key: str, path: str, params: dict):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    resp = requests.get(url + path, headers=headers, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def audit(url: str, key: str) -> dict:
    profiles = fetch(url, key, "/rest/v1/profiles", {
        "select": "id,email,role,status,is_super_admin,workspace_ids", "limit": "1000",
    })
    memberships = fetch(url, key, "/rest/v1/memberships", {
        "select": "profile_id,workspace_id,role_id,status", "limit": "5000",
    })
    ws_ids = {w["id"] for w in fetch(url, key, "/rest/v1/workspaces", {
        "select": "id", "limit": "500",
    })}

    by_profile: dict[str, list] = {}
    for m in memberships:
        by_profile.setdefault(m["profile_id"], []).append(m)

    categories: Counter[str] = Counter()
    divergences: list[dict] = []
    for p in profiles:
        pid = p["id"]
        col = set(p.get("workspace_ids") or [])
        rows = by_profile.get(pid, [])
        active = {m["workspace_id"] for m in rows if m["status"] == "active"}
        nonactive = sorted(
            (m["workspace_id"], m["status"]) for m in rows if m["status"] != "active"
        )

        if p.get("is_super_admin"):
            categories["super_admin"] += 1
        elif (p.get("status") or "") != "active":
            categories["nao_ativo"] += 1
        elif (p.get("role") or "") not in ROLE_TO_SLUG:
            categories["role_desconhecida"] += 1
        elif col == active and not (col - ws_ids) and not nonactive:
            categories["ok_convergente"] += 1
        else:
            categories["DIVERGENCIA"] += 1
            divergences.append({
                "email": p.get("email"),
                "role": p.get("role"),
                "status": p.get("status"),
                "coluna": sorted(col),
                "memberships_ativas": sorted(active),
                "nao_ativas": nonactive,
                "fantasmas_coluna": sorted(col - ws_ids),
            })

    return {
        "profiles": len(profiles),
        "memberships": len(memberships),
        "categorias": dict(categories.most_common()),
        "divergencias": divergences,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", default=os.environ.get("DRIFT_LABEL", "manual"))
    parser.add_argument("--url", default=os.environ.get("SUPABASE_URL", ""))
    parser.add_argument("--service-key", default=os.environ.get("SUPABASE_SERVICE_KEY", ""))
    args = parser.parse_args()

    if not args.url or not args.service_key:
        print("SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios", file=sys.stderr)
        return 1

    try:
        report = audit(args.url, args.service_key)
    except Exception as exc:
        print(f"erro de infraestrutura: {exc}", file=sys.stderr)
        return 1

    print(f"===== drift-watch [{args.label}] =====")
    print(f"profiles={report['profiles']} memberships={report['memberships']}")
    for category, count in report["categorias"].items():
        print(f"  {category}: {count}")
    for divergence in report["divergencias"]:
        print("  DIVERGENCIA: " + json.dumps(divergence, ensure_ascii=False))
    print(json.dumps({"label": args.label, **report}, ensure_ascii=False))

    unexpected = [c for c in report["categorias"] if c not in EXPECTED_CATEGORIES]
    if unexpected:
        print("DIVERGÊNCIA INESPERADA — registrar, investigar, decidir. "
              "NÃO executar a sincronização legada.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
