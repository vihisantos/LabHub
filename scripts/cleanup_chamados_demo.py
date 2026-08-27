#!/usr/bin/env python3
"""Remove all DEMO data created by seed_chamados_demo.py.

Safely removes:
  - All chamados_tickets with workspace_id = DEMO_WORKSPACE_ID
  - All ticket_events with workspace_id = DEMO_WORKSPACE_ID
  - The workspace itself (demo-chamados)

Requires confirmation before deletion. Shows exact counts first.

Requirements:
    pip install requests
    SUPABASE_URL and SUPABASE_SERVICE_KEY in .env or environment.

Usage:
    python scripts/cleanup_chamados_demo.py
    python scripts/cleanup_chamados_demo.py --dry-run   # show what would be removed
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path

import requests

# ── Constants ────────────────────────────────────────────────────────────────

DEMO_SLUG = "demo-chamados"
DEMO_WORKSPACE_ID = str(uuid.uuid5(uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8"), DEMO_SLUG))

# ── Environment ──────────────────────────────────────────────────────────────


def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def _get_config() -> tuple[str, str]:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    _load_env(env_path)
    base = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not base or not service_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)
    return base, service_key


def _headers(service_key: str) -> dict:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


# ── Counting ─────────────────────────────────────────────────────────────────


def _check_workspace(base: str, svc: str) -> dict | None:
    url = f"{base}/rest/v1/workspaces?slug=eq.{DEMO_SLUG}&select=id,name,slug"
    resp = requests.get(url, headers=_headers(svc), timeout=15)
    if resp.ok and resp.json():
        return resp.json()[0]
    return None


def _count_tickets(base: str, svc: str) -> int | None:
    url = f"{base}/rest/v1/chamados_tickets?workspace_id=eq.{DEMO_WORKSPACE_ID}&select=id"
    resp = requests.get(url, headers=_headers(svc), timeout=15)
    if not resp.ok:
        return None
    return len(resp.json())


def _count_events(base: str, svc: str) -> int | None:
    url = f"{base}/rest/v1/ticket_events?workspace_id=eq.{DEMO_WORKSPACE_ID}&select=id"
    resp = requests.get(url, headers=_headers(svc), timeout=15)
    if not resp.ok:
        return None
    return len(resp.json())


def _count_feedback(base: str, svc: str) -> int | None:
    url = f"{base}/rest/v1/chamados_tickets?workspace_id=eq.{DEMO_WORKSPACE_ID}&feedbackRating=not.is.null&select=id"
    resp = requests.get(url, headers=_headers(svc), timeout=15)
    if not resp.ok:
        return None
    return len(resp.json())


# ── Deletion ─────────────────────────────────────────────────────────────────


def _delete_by_workspace(base: str, svc: str, table: str) -> bool:
    """Delete all rows with workspace_id = DEMO_WORKSPACE_ID."""
    url = f"{base}/rest/v1/{table}?workspace_id=eq.{DEMO_WORKSPACE_ID}"
    resp = requests.delete(url, headers=_headers(svc), timeout=30)
    return resp.ok


def _delete_workspace(base: str, svc: str, ws_id: str) -> bool:
    url = f"{base}/rest/v1/workspaces?id=eq.{ws_id}"
    resp = requests.delete(url, headers=_headers(svc), timeout=15)
    return resp.ok in (200, 204)


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dry-run", action="store_true", help="Show what would be removed without deleting")
    args = parser.parse_args()

    base, svc = _get_config()

    print(f"Workspace ID: {DEMO_WORKSPACE_ID}")
    print(f"Workspace slug: {DEMO_SLUG}\n")

    # Check workspace
    ws = _check_workspace(base, svc)
    if not ws:
        print(f"Workspace '{DEMO_SLUG}' not found. Nothing to clean up.")
        return

    print(f"Workspace found: {ws['name']} (id={ws['id']})\n")

    # Count everything
    n_tickets = _count_tickets(base, svc) or 0
    n_events = _count_events(base, svc) or 0
    n_feedback = _count_feedback(base, svc) or 0

    print("Records to remove:")
    print(f"  Workspace:  1 ({ws['name']})")
    print(f"  Tickets:    {n_tickets}")
    print(f"  Events:     {n_events}")
    print(f"  Feedbacks:  {n_feedback} (inline in tickets)")
    print(f"  Photos:     0 (base64 inline, removed with tickets)")
    print(f"  Other:      0")

    if args.dry_run:
        print("\n[DRY RUN] No data deleted.")
        return

    # Confirmation
    print()
    confirm = input("Type DEMO-DELETE to confirm: ").strip()
    if confirm != "DEMO-DELETE":
        print("Aborted.")
        return

    # Delete in order: events -> tickets -> workspace
    print("\nCleaning up...")

    print("  Removing ticket_events...", end=" ")
    ok = _delete_by_workspace(base, svc, "ticket_events")
    print("OK" if ok else "FAILED")

    print("  Removing chamados_tickets...", end=" ")
    ok = _delete_by_workspace(base, svc, "chamados_tickets")
    print("OK" if ok else "FAILED")

    print("  Removing workspace...", end=" ")
    ok = _delete_workspace(base, svc, ws["id"])
    print("OK" if ok else "FAILED")

    # Verify
    print("\nVerifying cleanup...")
    ws_check = _check_workspace(base, svc)
    tk_check = _count_tickets(base, svc)
    ev_check = _count_events(base, svc)

    ws_gone = ws_check is None
    tk_gone = tk_check is None or tk_check == 0
    ev_gone = ev_check is None or ev_check == 0

    print(f"  Workspace removed: {'YES' if ws_gone else 'NO'}")
    print(f"  Tickets removed:   {'YES' if tk_gone else f'NO ({tk_check} remaining)'}")
    print(f"  Events removed:    {'YES' if ev_gone else f'NO ({ev_check} remaining)'}")

    if ws_gone and tk_gone and ev_gone:
        print("\nCleanup complete. All DEMO data removed.")
        print("  Production data was not affected.")
    else:
        print("\nSome records may remain. Check manually.")
        sys.exit(1)


if __name__ == "__main__":
    main()
