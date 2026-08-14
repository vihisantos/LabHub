"""Cria os workspaces dos campi Anhembi (São José dos Campos e Mooca) e remove o workspace "Exemplo".

Lê SUPABASE_URL e SUPABASE_SERVICE_KEY do .env na raiz do repo (ou via variáveis de ambiente).
Idempotente: os campi são upsert por slug (on_conflict=slug); o "Exemplo" é removido apenas se existir.

Uso:
    python scripts/seed_workspaces.py
"""

import os
from pathlib import Path

import requests

CAMPI = [
    {
        "name": "Anhembi São José dos Campos",
        "slug": "anhembi-sao-jose-dos-campos",
        "location": "São José dos Campos - SP",
    },
    {
        "name": "Anhembi Mooca",
        "slug": "anhembi-mooca",
        "location": "São Paulo - SP",
    },
]

WS_TABLES = [
    ("public", "chamados_tickets"),
    ("public", "tablet_reservations"),
    ("public", "tv_events"),
    ("public", "tv_playlists"),
    ("public", "tv_music_queues"),
    ("public", "tv_music_tracks"),
    ("public", "tv_announcements"),
    ("public", "tv_galleries"),
    ("public", "tv_gallery_photos"),
    ("public", "tv_calendar_cache"),
    ("public", "tv_urgent_announcements"),
    ("stock", "stock_items"),
    ("stock", "stock_movements"),
    ("stock", "stock_kits"),
    ("stock", "stock_maintenance"),
    ("stock", "stock_inventory_cycles"),
    ("stock", "stock_inventory_counts"),
    ("stock", "stock_photos"),
    ("stock", "chamados"),
    ("stock", "rooms"),
    ("stock", "problem_templates"),
    ("stock", "notifications"),
    ("stock", "audit_logs"),
    ("stock", "user_profiles"),
    ("stock", "roles"),
    ("pcare", "assets"),
    ("pcare", "pcs"),
    ("pcare", "parts"),
    ("pcare", "part_usage"),
    ("pcare", "maintenance"),
    ("pcare", "checklist_templates"),
    ("pcare", "pc_checklists"),
    ("pcare", "action_logs"),
]


def load_env(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def base_headers(service_key):
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Prefer": "return=minimal",
    }


def schema_headers(schema, service_key):
    headers = base_headers(service_key)
    if schema in ("stock", "pcare"):
        headers["Accept-Profile"] = schema
        headers["Content-Profile"] = schema
    return headers


def upsert_workspace(base, service_key, campi):
    payload = {
        "name": campi["name"],
        "slug": campi["slug"],
        "location": campi["location"],
        "spreadsheet_url": "",
        "color": "",
        "disabled_apps": [],
    }
    url = f"{base}/rest/v1/workspaces?on_conflict=slug"
    resp = requests.post(url, json=payload, headers=schema_headers("public", service_key), timeout=20)
    if resp.status_code in (200, 201):
        print(f"  upsert ok: {campi['name']} (slug={campi['slug']})")
    else:
        print(f"  ERRO upsert {campi['name']}: HTTP {resp.status_code} {resp.text[:200]}")
        return False
    return True


def count_for_workspace(base, service_key, ws_id):
    print(f"  Dados vinculados a 'Exemplo' ({ws_id}):")
    total = 0
    for schema, table in WS_TABLES:
        url = f"{base}/rest/v1/{table}?workspace_id=eq.{ws_id}&select=id"
        try:
            resp = requests.get(url, headers=schema_headers(schema, service_key), timeout=20)
            if resp.status_code in (403, 404):
                continue
            if not resp.ok:
                continue
            n = len(resp.json())
            if n > 0:
                print(f"    {schema}.{table}: {n}")
                total += n
        except Exception:
            continue
    print(f"  TOTAL: {total} linhas")
    return total


def delete_workspace(base, service_key, ws_id):
    url = f"{base}/rest/v1/workspaces?id=eq.{ws_id}"
    resp = requests.delete(url, headers=base_headers(service_key), timeout=20)
    if resp.status_code == 204:
        print("  'Exemplo' removido.")
        return True
    print(f"  ERRO ao remover 'Exemplo': HTTP {resp.status_code} {resp.text[:200]}")
    return False


def main():
    env_path = Path(__file__).resolve().parents[1] / ".env"
    load_env(env_path)
    base = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not base or not service_key:
        print("SUPABASE_URL e SUPABASE_SERVICE_KEY não encontrados no .env")
        raise SystemExit(1)

    print("Criando/atualizando campi:")
    ok = all(upsert_workspace(base, service_key, c) for c in CAMPI)
    if not ok:
        raise SystemExit(2)

    resp = requests.get(
        f"{base}/rest/v1/workspaces?slug=eq.exemplo&select=id,name",
        headers=base_headers(service_key),
        timeout=20,
    )
    exemplo = resp.json() if resp.ok else []
    if exemplo:
        ws_id = exemplo[0]["id"]
        print(f"Removendo 'Exemplo' (slug=exemplo):")
        count_for_workspace(base, service_key, ws_id)
        delete_workspace(base, service_key, ws_id)
    else:
        print("'Exemplo' já não existe — nada a remover.")

    print("Workspaces atuais:")
    current = requests.get(
        f"{base}/rest/v1/workspaces?select=name,slug,location&order=name",
        headers=base_headers(service_key),
        timeout=20,
    )
    for w in current.json() if current.ok else []:
        print(f"  - {w['name']} | slug={w['slug']} | {w['location']}")


if __name__ == "__main__":
    main()
