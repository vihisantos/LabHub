"""Preenche a spreadsheet_url de cada workspace (campus) no Supabase.

A separação de reservas por campus existe no backend (get_reservas usa
workspaces.spreadsheet_url), mas os campi criados pelo seed_workspaces.py
ficam com a URL vazia — todos caem no fallback global (SHAREPOINT_URL).

Este script atribui a planilha de cada campus. As URLs vêm de env vars:

    SPREADSHEET_URL_ANHEMBI_MOOCA=https://.../planilha.xlsx?download=1
    SPREADSHEET_URL_ANHEMBI_PIRACICABA=https://...
    SPREADSHEET_URL_ANHEMBI_SAO_JOSE_DOS_CAMPOS=https://...

O nome da env var é o slug do workspace em MAIÚSCULO com "-" vira "_".
Também aceita SPREADSHEET_URL genérico quando existe apenas um workspace
(cenário de campus único).

Idempotente: só atualiza workspaces com URL configurada; pode rodar
quantas vezes quiser.

Uso:
    python scripts/set_workspace_spreadsheets.py [--dry-run]
"""

import os
import sys
from pathlib import Path

import requests

ENV_VAR_PREFIX = "SPREADSHEET_URL_"


def load_env(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def env_var_for_slug(slug: str) -> str:
    return ENV_VAR_PREFIX + slug.upper().replace("-", "_")


def url_for_workspace(slug: str, total_workspaces: int) -> str:
    """Resolve a URL da planilha para o slug (env var específica ou genérica)."""
    specific = os.environ.get(env_var_for_slug(slug), "").strip()
    if specific:
        return specific
    # Campus único: permite SPREADSHEET_URL sem sufixo.
    if total_workspaces == 1:
        return os.environ.get("SPREADSHEET_URL", "").strip()
    return ""


def looks_like_download(url: str) -> bool:
    return "download=1" in url or ".xlsx" in url or ".xls" in url


def base_headers(service_key: str):
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Prefer": "return=minimal",
    }


def main():
    dry_run = "--dry-run" in sys.argv

    env_path = Path(__file__).resolve().parents[1] / ".env"
    load_env(env_path)
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not base or not service_key:
        print("SUPABASE_URL e SUPABASE_SERVICE_KEY não encontrados no .env")
        raise SystemExit(1)

    headers = base_headers(service_key)

    resp = requests.get(
        f"{base}/rest/v1/workspaces?select=slug,name&order=name",
        headers=headers,
        timeout=20,
    )
    if not resp.ok:
        print(f"ERRO ao listar workspaces: HTTP {resp.status_code} {resp.text[:200]}")
        raise SystemExit(2)
    workspaces = resp.json()
    if not workspaces:
        print("Nenhum workspace encontrado — nada a fazer.")
        return

    print(f"{len(workspaces)} workspace(s) encontrado(s).")
    updated = skipped = 0

    for ws in workspaces:
        slug = ws["slug"]
        url = url_for_workspace(slug, len(workspaces))
        if not url:
            print(
                f"  - {ws['name']} (slug={slug}): SEM env var "
                f"{env_var_for_slug(slug)} — mantém como está"
            )
            skipped += 1
            continue

        if not looks_like_download(url):
            print(
                f"  ! {ws['name']}: a URL não parece um link direto de download "
                f"(sem .xlsx/.xls ou ?download=1). Confira: {url}"
            )

        if dry_run:
            print(f"  - {ws['name']} (slug={slug}): [dry-run] usaria {url}")
            continue

        patch = requests.patch(
            f"{base}/rest/v1/workspaces?slug=eq.{slug}",
            json={"spreadsheet_url": url},
            headers=headers,
            timeout=20,
        )
        if patch.status_code == 204:
            print(f"  ✓ {ws['name']} (slug={slug}): spreadsheet_url atualizada")
            updated += 1
        else:
            print(
                f"  ✗ ERRO ao atualizar {ws['name']}: "
                f"HTTP {patch.status_code} {patch.text[:200]}"
            )
            skipped += 1

    print(f"\nResumo: {updated} atualizada(s), {skipped} ignorada(s)/falha(s).")
    if dry_run:
        print("(--dry-run: nada foi alterado.)")
    elif updated == 0:
        print(
            "Nenhuma URL configurada. Adicione as env vars no .env, ex.:\n"
            "  SPREADSHEET_URL_ANHEMBI_MOOCA=https://...?download=1"
        )


if __name__ == "__main__":
    main()
