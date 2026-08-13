"""Apaga TODAS as linhas das tabelas operacionais no Supabase (stock, pcare, chamados, tv).

Lê SUPABASE_URL e SUPABASE_SERVICE_KEY do .env na raiz do repo (ou via variáveis de ambiente).
Workspaces, perfis e cargos são preservados (config essencial).

Uso:
    python scripts/wipe_supabase.py          # apaga tudo (com confirmação)
    python scripts/wipe_supabase.py --check  # só mostra contagens, não apaga
"""

import argparse
import os
import sys
from pathlib import Path

import requests

TABLES = [
    # public (filhos primeiro para respeitar FKs)
    ('public', 'tv_music_tracks'),
    ('public', 'tv_music_queues'),
    ('public', 'tv_gallery_photos'),
    ('public', 'tv_galleries'),
    ('public', 'tv_events'),
    ('public', 'tv_playlists'),
    ('public', 'tv_announcements'),
    ('public', 'tv_calendar_cache'),
    ('public', 'tv_urgent_announcements'),
    ('public', 'tv_activation_codes'),
    ('public', 'tablet_reservations'),
    ('public', 'chamados_tickets'),
    # schema stock
    ('stock', 'stock_movements'),
    ('stock', 'stock_maintenance'),
    ('stock', 'inventory_counts'),
    ('stock', 'inventory_cycles'),
    ('stock', 'stock_kits'),
    ('stock', 'notifications'),
    ('stock', 'stock_items'),
    # schema pcare
    ('pcare', 'action_logs'),
    ('pcare', 'pc_checklists'),
    ('pcare', 'checklist_templates'),
    ('pcare', 'part_usage'),
    ('pcare', 'maintenance'),
    ('pcare', 'parts'),
    ('pcare', 'pcs'),
]


def load_env(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip())


def headers_for(schema, service_key):
    h = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Prefer': 'return=minimal',
    }
    if schema in ('stock', 'pcare'):
        h['Accept-Profile'] = schema
        h['Content-Profile'] = schema
    return h


# Safeupdate no Supabase exige WHERE em DELETE. `id` existe em todas as tabelas.
WIPE_FILTER = 'id=neq.00000000-0000-0000-0000-000000000000'


def count(base, table, schema, service_key):
    url = f'{base}/rest/v1/{table}?select=id'
    h = headers_for(schema, service_key)
    resp = requests.get(url, headers=h, timeout=20)
    if resp.status_code in (403, 404):
        return None
    if not resp.ok:
        return None
    return len(resp.json())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='só mostra contagens')
    parser.add_argument('--env', default=str(Path(__file__).resolve().parents[1] / '.env'), help='caminho do .env')
    args = parser.parse_args()

    load_env(Path(args.env))
    base = os.environ.get('SUPABASE_URL', '')
    service_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not base or not service_key:
        print('SUPABASE_URL e SUPABASE_SERVICE_KEY não encontrados no .env')
        sys.exit(1)

    if args.check:
        total = 0
        for schema, table in TABLES:
            n = count(base, table, schema, service_key)
            if n is None:
                print(f'  {schema}.{table}: erro ao contar')
            elif n > 0:
                print(f'  {schema}.{table}: {n}')
                total += n
        print(f'TOTAL com dados: {total}')
        return

    print('Isso vai apagar TODAS as linhas das tabelas operacionais no Supabase.')
    if input('Digite APAGAR para confirmar: ') != 'APAGAR':
        print('Abortado.')
        return

    results = {}
    for schema, table in TABLES:
        url = f'{base}/rest/v1/{table}?{WIPE_FILTER}'
        try:
            resp = requests.delete(url, headers=headers_for(schema, service_key), timeout=20)
            if resp.status_code == 204:
                results[table] = 'ok'
            elif resp.status_code == 404:
                results[table] = 'sem-tabela'
            else:
                results[table] = f'HTTP {resp.status_code}'
        except Exception as e:
            results[table] = str(e)
        print(f'  {schema}.{table}: {results[table]}')

    ok = sum(1 for v in results.values() if v == 'ok')
    missing = sum(1 for v in results.values() if v == 'sem-tabela')
    print(f'\n{ok}/{len(results)} tabelas limpas ({missing} não existiam).')
    if ok < len(results) - missing:
        sys.exit(2)


if __name__ == '__main__':
    main()
