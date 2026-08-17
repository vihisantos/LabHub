"""Teste definitivo de entrega push: webpush() real com VAPID do .env e inscrições reais do Redis.

Valida o caminho completo (VAPID + criptografia + FCM/Apple) sem depender do browser.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'apps', 'reservalab', 'api'))

# Carrega .env do root ou arquivo passado como argumento (ex.: /tmp/v.txt do vercel env pull)
from dotenv import load_dotenv
ROOT = Path(__file__).resolve().parent.parent
env_file = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / '.env')
load_dotenv(env_file)

from pywebpush import webpush

VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
# Importante: passa uma COPIA por chamada — o pywebpush muta o dict (aud/exp)
# e um dict compartilhado faria o aud do primeiro endpoint vazar para todos.
VAPID_CLAIMS = {"sub": "mailto:admin@reservaslab.com"}


def fresh_claims():
    return dict(VAPID_CLAIMS)

# Busca inscrições reais do Redis (Upstash)
UPSTASH_URL = os.environ.get('UPSTASH_REDIS_REST_URL', '')
UPSTASH_TOKEN = os.environ.get('UPSTASH_REDIS_REST_TOKEN', '')

def get_subs():
    import urllib.request
    req = urllib.request.Request(
        f'{UPSTASH_URL}/smembers/push:subscribers',
        headers={'Authorization': f'Bearer {UPSTASH_TOKEN}'},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    return [json.loads(raw) for raw in data['result']]

def main():
    if not VAPID_PRIVATE_KEY:
        print('FALHA: VAPID_PRIVATE_KEY ausente no .env')
        return 1

    subs = get_subs()
    # Seleciona inscrições reais (ignora a fake do headless)
    real = [s for s in subs if 'fake' not in s.get('endpoint', '')]
    print(f'Total inscrições: {len(subs)} | reais: {len(real)}')

    # Prioriza: uma FCM do admin e uma Apple do admin
    fcm = [s for s in real if 'fcm.googleapis.com' in s.get('endpoint', '')]
    apple = [s for s in real if 'web.push.apple.com' in s.get('endpoint', '')]

    targets = []
    # Testa TODAS as inscrições reais (mapear padrão de falha por inscrição)
    for i, s in enumerate(real):
        kind = 'Apple' if 'apple.com' in s.get('endpoint', '') else 'FCM'
        targets.append((f'{kind}[{i}]', s))

    if not targets:
        print('Nenhuma inscrição real para testar')
        return 1

    payload = json.dumps({
        'title': 'Teste de entrega — LabHub',
        'body': 'Validação do caminho VAPID/FCM via script local. 🔔',
        'url': '/chamados',
    })

    all_ok = True
    for name, sub in targets:
        endpoint = sub.get('endpoint', '')[:60]
        print(f'\n=== {name}: {endpoint}... ===')
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=fresh_claims(),
            ttl=86400,
            )
            print(f'{name}: OK - ENVIADO (HTTP 201)')
        except Exception as e:
            all_ok = False
            print(f'{name}: ERRO: {type(e).__name__}: {e}')
            # Detalhes úteis de erro comum do pywebpush
            resp = getattr(e, 'response', None)
            if resp is not None:
                try:
                    print(f'   status={resp.status_code} body={resp.text[:300]}')
                except Exception:
                    print(f'   response={str(resp)[:300]}')

    print('\nRESULTADO:', 'TUDO OK — entrega funciona' if all_ok else 'FALHOU — investigar erro acima')
    return 0 if all_ok else 1

if __name__ == '__main__':
    sys.exit(main())
