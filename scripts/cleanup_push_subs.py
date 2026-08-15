"""Limpa inscrições push do Upstash Redis: deduplica por endpoint e remove órfãs.

Lê UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN do .env na raiz do repo
(ou via variáveis de ambiente).

O que faz:
- Dedupe por endpoint: o mesmo dispositivo pode ter se inscrito 2x (a mais
  recente vence; a mais antiga é removida). Ao deduplicar, prefere a inscrição
  com `user` preenchido (registro mais completo).
- Remove órfãs evidentes: inscrições sem `user` e sem `keys` (registro
  incompleto, normalmente falha no envio). Opcional (padrão: só lista; use
  --delete para remover de verdade).

Uso:
    python scripts/cleanup_push_subs.py             # mostra o que faria (dry-run)
    python scripts/cleanup_push_subs.py --delete    # aplica a limpeza
"""

import argparse
import json
import os
import sys
from pathlib import Path

import requests

KEY = 'push:subscribers'


def load_env(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip())


def get_subs(base, token):
    url = f'{base}/smembers/{KEY}'
    resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=20)
    resp.raise_for_status()
    raw = resp.json().get('result', [])
    subs = []
    for r in raw:
        try:
            subs.append(json.loads(r) if isinstance(r, str) else r)
        except Exception:
            continue
    return subs


def save_subs(base, token, subs, backup):
    """Substitui o set inteiro pela lista limpa.

    O REST do Upstash aceita UM valor por comando, então cada inscrição é
    adicionada com sua própria chamada SADD. Se qualquer SADD falhar, o set é
    restaurado a partir do `backup` (estado original) para nunca ficar vazio.
    """
    h = {'Authorization': f'Bearer {token}'}

    requests.post(f'{base}/del/{KEY}', headers=h, timeout=20)
    added = 0
    try:
        for s in subs:
            encoded = json.dumps(s, ensure_ascii=False)
            resp = requests.post(
                f'{base}/sadd/{KEY}',
                data=encoded.encode('utf-8'),
                headers={**h, 'Content-Type': 'text/plain'},
                timeout=20,
            )
            resp.raise_for_status()
            added += 1
    except Exception as e:
        print(f'  ERRO ao reescrever o set ({e}) — restaurando estado original...')
        for s in backup:
            encoded = json.dumps(s, ensure_ascii=False)
            try:
                requests.post(
                    f'{base}/sadd/{KEY}',
                    data=encoded.encode('utf-8'),
                    headers={**h, 'Content-Type': 'text/plain'},
                    timeout=20,
                )
            except Exception:
                pass
        raise
    print(f'  Set reescrito com {added} inscrições.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--delete', action='store_true',
        help='aplica a limpeza de fato (sem a flag, apenas mostra o que faria)',
    )
    parser.add_argument(
        '--env', default=str(Path(__file__).resolve().parents[1] / '.env'),
        help='caminho do .env',
    )
    args = parser.parse_args()

    load_env(Path(args.env))
    base = os.environ.get('UPSTASH_REDIS_REST_URL', '')
    token = os.environ.get('UPSTASH_REDIS_REST_TOKEN', '')
    if not base or not token:
        print('UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN não encontrados no .env')
        sys.exit(1)

    subs = get_subs(base, token)
    print(f'Inscrições atuais: {len(subs)}')

    # ── Dedupe por endpoint ──────────────────────────────────────────────
    by_endpoint = {}
    for s in subs:
        ep = s.get('endpoint', '')
        if not ep:
            continue
        cur = by_endpoint.get(ep)
        if cur is None:
            by_endpoint[ep] = s
            continue
        # Prefere a inscrição com `user` preenchido (registro completo)
        has_user = bool(s.get('user'))
        cur_has_user = bool(cur.get('user'))
        if has_user and not cur_has_user:
            by_endpoint[ep] = s

    dups = len(subs) - len(by_endpoint)
    if dups:
        print(f'\nDuplicados por endpoint: {dups}')
        for ep, s in by_endpoint.items():
            if sum(1 for x in subs if x.get('endpoint') == ep) > 1:
                print(f'  - {ep[:70]}... (mantida: {bool(s.get("user")) and "com user" or "sem user"})')
    else:
        print('\nNenhum duplicado por endpoint.')

    # ── Órfãs (sem user e sem keys) ──────────────────────────────────────
    orphans = [s for s in by_endpoint.values() if not s.get('user') and not s.get('keys')]
    if orphans:
        print(f'\nÓrfãs (sem user e sem keys): {len(orphans)}')
        for s in orphans:
            print(f'  - {s.get("endpoint", "")[:70]}...')
    else:
        print('\nNenhuma inscrição órfã evidente (sem user/keys).')

    final = [s for s in by_endpoint.values() if s.get('user') or s.get('keys')]
    to_remove = len(subs) - len(final)

    if not args.delete:
        print(f'\n[DRY-RUN] Removeria {to_remove} inscrição(ões) ({len(subs)} -> {len(final)}).')
        print('Rode com --delete para aplicar.')
        return

    if to_remove == 0:
        print('\nNada a remover — set já está limpo.')
        return

    print(f'\nAplicando limpeza ({len(subs)} -> {len(final)})...')
    save_subs(base, token, final, backup=subs)
    print('Limpeza concluída.')


if __name__ == '__main__':
    main()
