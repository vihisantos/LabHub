import time
import json
import hmac
from flask import Flask, jsonify, request, g
from openpyxl import load_workbook
from datetime import date, timedelta, datetime, timezone, time as datetime_time
from flask_cors import CORS
import os
import sys
import logging
import requests
import re
import hashlib
import secrets
import uuid
import ipaddress
import socket
import tempfile
from zoneinfo import ZoneInfo
from urllib.parse import quote, urlparse, urljoin
from io import BytesIO
from dotenv import load_dotenv
from pywebpush import webpush, WebPushException

# Authorization layer
sys.path.insert(0, os.path.dirname(__file__))
from auth import (
    require_auth,
    require_workspace,
    require_module as require_module_auth,
    require_cron,
    require_admin,
    _verify_jwt,
    _get_token_from_request,
    _get_user_profile,
    _get_user_workspace_ids,
    _get_workspace,
    _user_in_workspace,
    _is_module_enabled,
    _SUPABASE_SERVICE_KEY as _AUTH_SERVICE_KEY,
)
from rbac import require_action as require_action_rbac
from upstash_redis import create_redis_client

# Detecta caminho correto quando rodando de exe
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Carrega .env do diretório do exe
env_path = os.path.join(BASE_DIR, '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

def get_now_sp():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo('America/Sao_Paulo'))
    except Exception:
        from datetime import timezone
        return datetime.now(timezone(timedelta(hours=-3)))

def get_today_sp():
    return get_now_sp().date()


class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        })

logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)
for h in logger.handlers:
    h.setFormatter(JSONFormatter())

CACHE_TTL = 60  # segundos

def _excel_time_to_text(value):
    """Normaliza horário nativo do openpyxl sem descartar segundos informados."""
    if value.second or value.microsecond:
        return value.isoformat()
    return value.isoformat(timespec='minutes')


class DateEncoder(json.JSONEncoder):
    """Serializa datas e horários nativos de células Excel."""
    def default(self, obj):
        if isinstance(obj, datetime_time):
            return _excel_time_to_text(obj)
        if isinstance(obj, (date, datetime)):
            return obj.strftime('%d/%m/%Y')
        return super().default(obj)


def _cache_key_for(workspace_slug=None):
    """Chave de cache por workspace — cada campus tem sua própria planilha/cache."""
    return f"reservas_{workspace_slug or 'default'}"


def _cache_path(cache_key):
    """Caminho do cache em arquivo (fallback quando Redis não está configurado).

    Usa um hash do cache_key no nome do arquivo: o cache_key deriva de dados
    externos (workspace_slug da query string) e nunca deve virar caminho de
    arquivo direto (proteção contra path traversal / injection).
    """
    if not isinstance(cache_key, str) or not cache_key:
        raise ValueError("Invalid cache key")
    safe = hashlib.sha256(cache_key.encode('utf-8')).hexdigest()[:24]
    filename = f'.cache_{safe}.json'
    # Garante que o nome seja estritamente um basename simples
    filename = os.path.basename(filename)
    base_dir = os.path.abspath('/tmp' if os.environ.get('VERCEL') else BASE_DIR)
    target = os.path.abspath(os.path.join(base_dir, filename))
    # Defesa em profundidade: garante confinamento estrito dentro de base_dir
    if os.path.commonpath([base_dir, target]) != base_dir:
        raise ValueError("Invalid cache path")
    return target


def get_cached_reservas(cache_key):
    """Lê o cache por chave. Redis (Upstash) primeiro; arquivo local como fallback."""
    if redis:
        try:
            raw = redis.get(f'cache:{cache_key}')
            if raw:
                cache = json.loads(raw) if isinstance(raw, str) else raw
                if cache and time.time() - cache.get('timestamp', 0) < CACHE_TTL:
                    return cache.get('data')
        except Exception as e:
            logger.error(f"Erro ao ler cache Redis: {e}")
    try:
        path = _cache_path(cache_key)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            if time.time() - cache.get('timestamp', 0) < CACHE_TTL:
                return cache.get('data')
    except Exception as e:
        logger.error(f"Erro ao ler cache em arquivo: {e}")
    return None


def set_cached_reservas(cache_key, data):
    """Grava JSON válido no Redis e substitui o arquivo de forma atômica."""
    payload = {'data': data, 'timestamp': time.time()}
    # Serializar ANTES de escrever evita sobrescrever o cache com JSON parcial.
    try:
        serialized = json.dumps(payload, cls=DateEncoder)
    except (TypeError, ValueError) as exc:
        logger.error("Erro ao serializar cache de reservas: %s", exc)
        return
    if redis:
        try:
            redis.set(f'cache:{cache_key}', serialized, ex=CACHE_TTL)
        except Exception as e:
            logger.error(f"Erro ao salvar cache Redis: {e}")

    temp_path = None
    try:
        cache_path = _cache_path(cache_key)
        # Mesmo diretório: os.replace() é atômico e não expõe escrita incompleta.
        with tempfile.NamedTemporaryFile(
            mode='w', encoding='utf-8', dir=os.path.dirname(cache_path),
            prefix='.cache_', suffix='.tmp', delete=False,
        ) as temp_file:
            temp_path = temp_file.name
            temp_file.write(serialized)
        os.replace(temp_path, cache_path)
        temp_path = None
    except Exception as e:
        logger.error("Erro ao salvar cache em arquivo: %s", e)
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

app = Flask(__name__)
CORS(app)

# VAPID — apenas env vars (Vercel/.env). Sem as chaves, o push falha com warning
# (best-effort, não derruba o app).
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
    logger.warning("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nao configuradas — push desabilitado")
VAPID_CLAIMS = {"sub": "mailto:admin@reservaslab.com"}

# Upstash Redis é uma camada operacional compartilhada: cache de planilhas,
# rate limits distribuídos e operações temporárias. Dados duráveis de Push,
# inscrições e histórico continuam no PostgreSQL.
try:
    redis = create_redis_client()
    if redis:
        logger.info("Upstash Redis configurado para operações distribuídas")
    else:
        logger.info("Upstash Redis ausente; fallbacks locais permanecem ativos")
except Exception as exc:
    # Falha de configuração não deve impedir o app de iniciar. Cada operação
    # Redis tem fallback explícito ou falha fechada no respectivo subsistema.
    logger.error("Não foi possível inicializar Upstash Redis: %s", exc)
    redis = None

import pg_store  # módulo local: caminho inserido em sys.path no topo do arquivo

push_store = pg_store.push_store
dedup_store = pg_store.dedup_store


class _LegacyPushSubsStore:
    """Adapter para clientes legados que só falam `smembers('push:subscribers')`.

    Mantém a compatibilidade de leitura com fakes/clients antigos sem trazer
    Redis de volta ao subsistema de Push: é apenas uma ponte de contrato.
    """

    def __init__(self, client):
        self._client = client

    def push_subs_list(self):
        try:
            raw = self._client.smembers('push:subscribers') or []
        except Exception:
            return []
        result = []
        for item in raw:
            if isinstance(item, (bytes, bytearray)):
                try:
                    item = item.decode('utf-8')
                except Exception:
                    continue
            if isinstance(item, str):
                try:
                    item = json.loads(item)
                except (TypeError, ValueError):
                    continue
            if isinstance(item, dict):
                result.append(item)
        return result

    def push_subs_remove(self, endpoint):
        srem = getattr(self._client, 'srem', None)
        if callable(srem):
            try:
                srem('push:subscribers', endpoint)
            except Exception:
                pass

    def push_subs_expire(self, endpoint, seconds):
        expire = getattr(self._client, 'expire', None)
        if callable(expire):
            try:
                expire('push:subscribers', seconds)
            except Exception:
                pass


def _active_push_store():
    """Store ativo de inscrições (fake injetado, adapter legado ou PostgreSQL)."""
    if redis is not None:
        if hasattr(redis, 'push_subs_list'):
            return redis
        if hasattr(redis, 'smembers'):
            return _LegacyPushSubsStore(redis)
    return push_store


def _active_dedup_store():
    """Store ativo de dedup (fake injetado nos testes ou PostgreSQL)."""
    if redis is not None and hasattr(redis, 'dedup_reserve'):
        return redis
    return dedup_store


def _push_store_ready():
    """True se há store de Push utilizável.

    Um cliente legado injetado (inclusive um objeto simples usado por testes de
    rota) é aceito por compatibilidade. Em produção, `redis` é sempre None e a
    disponibilidade depende da configuração do Supabase.
    """
    if redis is not None and (
        hasattr(redis, 'push_subs_list') or hasattr(redis, 'smembers')
    ):
        return True
    return pg_store.is_configured()


ARQUIVO_URL = os.environ.get('SHAREPOINT_URL', '')
if not ARQUIVO_URL:
    logger.warning("URL da planilha no .env nao configurada — usando URLs por workspace")

_SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
_SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

def _get_workspace_spreadsheet_url(workspace_slug):
    """Busca a spreadsheet_url de um workspace no Supabase."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return None
    try:
        headers = {'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}'}
        url = (
            f"{_SUPABASE_URL}/rest/v1/workspaces"
            f"?select=spreadsheet_url"
            f"&slug=eq.{quote(workspace_slug)}"
        )
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok and resp.json():
            return resp.json()[0].get('spreadsheet_url') or None
    except Exception as e:
        logger.error(f"Erro ao buscar URL do workspace '{workspace_slug}': {e}")
    return None

def _extract_labs(raw_lab, lab_count):
    """Normaliza a coluna 'Lab' da planilha em ['LAB01', 'LAB03', ...].

    Entende "Lab 01 e 02", "LAB 1", "01/02" etc. e limita aos labs existentes
    no campus (lab_count). Números fora da faixa (ex.: "Lab 10" num campus de
    2 labs) são ignorados.
    """
    lab_list = []
    partes = re.split(r'\s*(?:e|,|&|\+|/| ou | - )\s*', raw_lab, flags=re.IGNORECASE)
    for parte in partes:
        p = parte.strip()
        m = re.search(r'lab\s*0?(\d+)', p, re.IGNORECASE)
        numero = int(m.group(1)) if m else None
        if numero is None:
            m2 = re.match(r'0*(\d+)$', p)
            numero = int(m2.group(1)) if m2 else None
        if numero and 1 <= numero <= lab_count:
            nome = f'LAB{numero:02d}'
            if nome not in lab_list:
                lab_list.append(nome)
    return lab_list


def _ensure_workspaces_lab_count():
    """Não executa DDL em runtime.

    A criação e a evolução do schema são responsabilidade das migrations
    versionadas do Supabase (000_bootstrap_baseline.sql linha 56 e
    028_authorization_consolidation.sql linha 83). Esta função é mantida como
    no-op por compatibilidade com chamadores existentes.
    """
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return
    logger.info("pg_sql lab_count: pulado (DDL coberto pelas migrations 000/028)")


def _get_workspace_lab_count(workspace_slug):
    """Busca a quantidade de labs de um workspace (padrão 2).

    Não executa DDL nem tenta inicializar o schema em tempo de execução.
    """
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return 2
    try:
        headers = {'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}'}
        url = (
            f"{_SUPABASE_URL}/rest/v1/workspaces"
            f"?select=lab_count"
            f"&slug=eq.{quote(workspace_slug)}"
        )
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok and resp.json():
            return int(resp.json()[0].get('lab_count') or 2)
    except Exception as e:
        logger.error(f"Erro ao buscar lab_count do workspace '{workspace_slug}': {e}")
    return 2


def _is_safe_url(url):
    """Bloqueia URLs que possam apontar para endereços internos (proteção SSRF).

    Aceita apenas http/https e rejeita IPs privados/loopback/link-local/reservados
    (ex.: 10.x, 192.168.x, 169.254.169.254 de metadata da cloud).
    """
    if not url:
        return False
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        host = (parsed.hostname or '').lower()
        if not host:
            return False
        if host in ('localhost', '127.0.0.1', '::1') or host.endswith('.local'):
            return False
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        except ValueError:
            pass  # hostname (não-IP): aceito — a validação cobre IPs literais e localhost
    except Exception:
        return False
    return True


# ── Fetch externo endurecido (#193) ────────────────────────────────────────────
#
# Havia aqui um `requests.get(spreadsheet_url, timeout=30)` que confiava em
# `_is_safe_url` sozinho. Três furos, todos reais:
#
#   1. `_is_safe_url` valida o HOSTNAME LITERAL, não o IP resolvido. Um domínio
#      público apontado para 10.x/127.0.0.1 passava inteiro — o bypass clássico
#      de SSRF por DNS.
#   2. `requests.get` segue redirects sozinho. `https://dominio-ok/...` podia
#      responder `302 → http://127.0.0.1/...` e o `requests` obedeceria, sem
#      revalidar nada.
#   3. `response.content` lia o corpo inteiro em memória, sem teto. A URL vem da
#      configuração do workspace, então um servidor apontado por ela podia
#      alocar o processo.
#
# As helpers abaixo são o padrão endurecido, e é o MESMO código que a TV já usa
# (`api/app.py` delega para cá — o módulo legado é importado por aquele, então a
# dependência fica na direção que já existe e não nasce circular). Cada chamador
# passa seus próprios limites.
#
# Por que genérico e não uma cópia local: duas implementações de proteção SSRF
# divergem, e a que diverge é a que esquece de um hop de redirect. Uma só
# implementação significa que o que a TV prova vale para o ReservaLab por
# construção, não por semelhança de texto.

EXT_SOURCE_MAX_URL_LEN = 2048
EXT_SOURCE_MAX_BYTES = 8 * 1024 * 1024  # 8 MB
EXT_SOURCE_TIMEOUT = (10, 30)  # (conexão, leitura)
EXT_SOURCE_MAX_REDIRECTS = 3


def _ext_validate_source_url(url, max_url_len=EXT_SOURCE_MAX_URL_LEN):
    """Valida URL de fonte externa com proteção SSRF em profundidade.

    Camadas: string/tamanho → HTTPS only → `_is_safe_url` (bloqueia localhost,
    IPs literais privados/loopback/link-local/reservados e esquemas não-HTTP) →
    resolução DNS validando **TODOS** os IPs retornados.

    Validar todos, e não só o primeiro, é o ponto: `getaddrinfo` pode devolver
    uma resposta com um endereço público e outro privado, e o `requests` pode
    escolher qualquer um dos dois na hora de conectar.
    """
    if not isinstance(url, str) or not url or len(url) > max_url_len:
        return False
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme != 'https':
        return False
    if not _is_safe_url(url):
        return False
    host = (parsed.hostname or '').lower()
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    if not infos:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr.split('%')[0])
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local \
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def _ext_fetch_source_bytes(url, max_bytes=EXT_SOURCE_MAX_BYTES,
                            timeout=EXT_SOURCE_TIMEOUT,
                            max_redirects=EXT_SOURCE_MAX_REDIRECTS):
    """Baixa bytes de fonte externa revalidando a SSRF a cada hop de redirect.

    Retorna `(bytes | None, erro | None)`. O erro é uma mensagem CURTA e já
    sanitizada: nada de URL resolvida, DNS, header ou exceção original. Quem
    chama registra o detalhe técnico no log; a resposta HTTP continua genérica.

    ── DNS rebinding / TOCTOU: limitação CONHECIDA e AVALIADA (#193) ───────────

    A sequência real é:

        getaddrinfo(host)  →  valida TODOS os IPs  →  requests.get(hostname)
                                                          ↓
                                            urllib3 chama create_connection
                                            → getaddrinfo DE NOVO

    A validação e a conexão usam **resoluções diferentes**. Um autoritativo DNS
    sob controle do atacante pode responder IP público na primeira e `127.0.0.1`
    na segunda. A janela existe e NÃO é fechada por este código. Dizê-lo de outro
    jeito seria afirmar uma garantia que não existe.

    **Por que a Opção B (pinning) não foi implementada aqui:** ela não é uma
    troca de parâmetro, é uma troca de transporte. Verificado nesta base
    (requests 2.32.3 / urllib3 2.7.0):

      · `urllib3.HTTPSConnectionPool` NÃO aceita `server_hostname` — só
        `host`, `assert_hostname` e `assert_fingerprint`;
      · `HTTPSConnection.connect()` usa `server_hostname = self.host`, e o pool
        vem construído com `host = <IP pinado>`;
      · logo, via `requests` daria verificação de certificado CORRETA
        (`assert_hostname`) com **SNI errado** (o IP, não o hostname), e um CDN ou
        SharePoint rejeita ou roteia para o vhost errado;
      · pinning correto exige construir a `HTTPSConnection` com
        `server_hostname` — ou seja, usar `urllib3` direto e reimplementar
        aqui o streaming com teto, os timeouts por fase e o manual de redirect.

    Isso reescreveria o transporte de um helper compartilhado com a TV, cujos 42
    testes montam o `requests` falso. Fazer isso só para marcar a caixa seria
    trocar um risco estreito e bem compreendido por um risco largo de regressão,
    sem fechar o problema.

    **Por que o risco residual é aceitável NESTE modelo de ameaça:**

    1. A URL é resolvida da configuração do workspace (ou do env global), não de
       entrada do request. Chegar a este ponto exige já controlar a
       configuração — ou controlar o DNS do host legitimamente configurado.
    2. Quem controla o DNS desse host já controla os BYTES que o servidor vai
       receber e parsear. O pinning não muda isso: não acrescenta capacidade
       nenhuma a quem já escolhe o conteúdo.
    3. O corpo baixado **nunca é devolvido a quem chamou**: vai para `openpyxl` e
       vira linhas de reserva ou é descartado. Não há primitiva de leitura — o
       atacante do DNS não obtém a resposta da rede interna, nem por timing, porque
       o endpoint devolve as reservas, não o corpo.

    O item 3 é a premissa que sustenta tudo, e a que mais facilmente se corrói
    sem ninguém perceber. Se um dia algum caminho devolver ou
    ecoar o corpo baixado, o SSRF vira primitiva de leitura e ESTA avaliação
    deixa de valer. `test_sem_primitiva_de_leitura_na_planilha` fixa essa
    invariável para que a premissa não se perca em silêncio.
    """
    session = requests.Session()
    current = url
    for _hop in range(max_redirects + 1):
        if not _ext_validate_source_url(current):
            return None, 'URL inválida ou não permitida (proteção SSRF)'
        try:
            resp = session.get(
                current, timeout=timeout, allow_redirects=False, stream=True,
            )
        except requests.exceptions.Timeout:
            return None, 'Tempo esgotado ao contatar a fonte'
        except requests.exceptions.RequestException as exc:
            # Só o NOME da classe: a mensagem original carrega host, porta e
            # às vezes credencial na query string.
            return None, f'Falha de rede ({exc.__class__.__name__})'
        if resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get('Location', '')
            resp.close()
            if not loc:
                return None, 'Redirect sem destino'
            try:
                current = urljoin(current, loc)
            except Exception:
                return None, 'Redirect inválido'
            continue
        if not resp.ok:
            resp.close()
            return None, f'A fonte respondeu HTTP {resp.status_code}'
        chunks, total = [], 0
        try:
            for chunk in resp.iter_content(64 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    return None, 'Arquivo maior que o limite permitido'
                chunks.append(chunk)
        except requests.exceptions.Timeout:
            return None, 'Tempo esgotado ao ler a fonte'
        except requests.exceptions.RequestException as exc:
            return None, f'Falha de rede ({exc.__class__.__name__})'
        finally:
            resp.close()
        return b''.join(chunks), None
    return None, 'Excesso de redirects'


# Limites da planilha de reservas. Mesmos valores da TV porque a fonte é do
# mesmo tipo (uma planilha XLSX); ficam nomeados aqui para que divergir, se
# algum dia, seja uma decisão visível e não um número trocado em silêncio.
SPREADSHEET_MAX_URL_LEN = EXT_SOURCE_MAX_URL_LEN
SPREADSHEET_MAX_BYTES = EXT_SOURCE_MAX_BYTES  # 8 MB
SPREADSHEET_TIMEOUT = EXT_SOURCE_TIMEOUT  # (10, 30)
SPREADSHEET_MAX_REDIRECTS = EXT_SOURCE_MAX_REDIRECTS


# ── Log sem segredo (#193) ───────────────────────────────────────────────────
#
# A URL da planilha é, com frequência, uma URL ASSINADA: o link de
# compartilhamento do SharePoint/OneDrive/Drive carrega o token em `?share=…`,
# `?sig=…` ou no próprio path (`/d/<id>/view`). Escrever a URL inteira no log
# deposita a credencial num sistema que costuma ter retenção longa, backup e
# acesso mais amplo que a aplicação — e o log passa a ser um destino de vazamento
# com vida útil maior que o do bug.
#
# O que o diagnóstico realmente precisa saber é *qual* host recusou, se é o
# esperado, e se o erro foi de DNS, redirect ou tamanho. Nada disso exige query
# string, fragmento, userinfo ou path.
#
# Por que o PATH também é descartado, e não só query/fragment: em link de
# compartilhamento o identificador opaco frequently vai no path
# (`…/download.aspx?share=` é comum, mas `…/d/<id>` e `/_layouts/15/Doc.aspx?s=`
# também existem). Preservar o path seria guardar o segredo comProbability alta.
# Host + porta sozinhos bastam para diagnosticar, e não são segredo.

# Teto do host no log: um hostname patológico não deve poder inchar o log.
_LOG_HOST_MAX = 120


def _safe_url_for_log(url):
    """Representação de uma URL segura para log: `scheme://host[:porta]`.

    Descarta query string, fragment, userinfo, credenciais e path. `hostname` do
    `urlparse` já vem sem userinfo e sem porta, o que evita ter de remontar a
    string — e evita reintroduzir a senha de `https://user:pass@host/`.

    Devolve um marcador quando a URL não é interpretável, para nunca ecoar
    entrada crua como fallback.
    """
    if not isinstance(url, str) or not url:
        return '<sem url>'
    try:
        parsed = urlparse(url)
    except Exception:
        return '<url invalida>'
    scheme = (parsed.scheme or '').lower()
    try:
        # `.hostname` já exclui userinfo; `.port` pode levantar em porta inválida.
        host = parsed.hostname or ''
        port = parsed.port
    except ValueError:
        return '<url invalida>'
    if not host:
        return '<sem host>'
    if len(host) > _LOG_HOST_MAX:
        host = host[:_LOG_HOST_MAX] + '…'
    if not scheme:
        return host
    return f'{scheme}://{host}' if not port else f'{scheme}://{host}:{port}'


def _is_spreadsheet_link_access_error(error):
    """Só HTTP 401/403/404 é evidência suficiente para alertar sobre acesso."""
    return bool(re.search(r'HTTP (401|403|404)\b', str(error or '')))


def _is_spreadsheet_login_response(content):
    """Reconhece HTML de login; bytes inválidos genéricos não provam link expirado."""
    if not isinstance(content, (bytes, bytearray)):
        return False
    sample = bytes(content[:4096]).lstrip().lower()
    return (
        sample.startswith(b'<!doctype html')
        or sample.startswith(b'<html')
        or b'<html' in sample[:512]
    )


_SPREADSHEET_LINK_ERRORS = {}
_SPREADSHEET_LINK_SUCCESSES = set()
_SPREADSHEET_WORKSPACE_STATUS_KEYS = {}
_SPREADSHEET_ALERT_ACTIVE = set()


def _spreadsheet_status_key(spreadsheet_url):
    # Só o hash fica em memória; a URL pode conter o token do compartilhamento.
    digest = hashlib.sha256(str(spreadsheet_url or '').encode('utf-8')).hexdigest()[:24]
    return f'reservalab:spreadsheet-status:{digest}'


def _spreadsheet_alert_key(workspace_slug):
    safe_slug = str(workspace_slug or 'default').strip().lower()
    digest = hashlib.sha256(safe_slug.encode('utf-8')).hexdigest()[:24]
    return f'reservalab:spreadsheet-link-alert:{digest}'


def _clear_spreadsheet_link_alert(workspace_slug):
    key = _spreadsheet_alert_key(workspace_slug)
    _SPREADSHEET_ALERT_ACTIVE.discard(key)
    if redis:
        try:
            redis.delete(key)
        except Exception:
            pass


def _notify_super_admin_spreadsheet_link(workspace_slug, access_error):
    """Emite um único alerta por incidente de acesso, somente para super admin."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return
    key = _spreadsheet_alert_key(workspace_slug)
    claimed = False
    if redis:
        try:
            result = redis.set(key, '1', nx=True)
            claimed = result in (True, 'OK', 'ok', 1)
        except Exception:
            claimed = key not in _SPREADSHEET_ALERT_ACTIVE
            _SPREADSHEET_ALERT_ACTIVE.add(key)
    else:
        claimed = key not in _SPREADSHEET_ALERT_ACTIVE
        _SPREADSHEET_ALERT_ACTIVE.add(key)
    if not claimed:
        return

    workspace_label = str(workspace_slug or 'padrão')
    notification_id = str(uuid.uuid4())
    payload = {
        'id': notification_id,
        'workspace_id': None,
        'title': 'ReservaLab: link da planilha precisa ser verificado',
        'body': (
            f'A planilha de reservas do workspace "{workspace_label}" está inacessível '
            f'({access_error}). Verifique se o link do SharePoint expirou ou perdeu '
            'permissão; gere um novo link e atualize a configuração do workspace.'
        ),
        'type': 'sync',
        'severity': 'critical',
        'module': 'reservalab',
        'audience': 'role',
        'target_role': None,
        'target_super_admin': True,
        'target_user_id': None,
        'action_url': '/admin/workspaces',
    }
    try:
        response = requests.post(
            f'{_SUPABASE_URL}/rest/v1/app_notifications',
            headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
            json=payload,
            timeout=10,
        )
        if not response.ok:
            _clear_spreadsheet_link_alert(workspace_slug)
            logger.error(
                'Falha ao persistir alerta de link do ReservaLab (HTTP %s)',
                response.status_code,
            )
    except Exception:
        _clear_spreadsheet_link_alert(workspace_slug)
        logger.error('Falha ao persistir alerta de link do ReservaLab')


def _parse_spreadsheet(spreadsheet_url, lab_count=2, *, strict=False):
    """Baixa e parseia uma planilha Excel, retornando (reservas_hoje, reservas_semana)."""
    wb = None
    reservas_hoje = []
    reservas_semana = []
    status_key = _spreadsheet_status_key(spreadsheet_url)
    _SPREADSHEET_LINK_SUCCESSES.discard(status_key)
    if not spreadsheet_url:
        if strict:
            raise RuntimeError('reservation spreadsheet unavailable or invalid')
        return reservas_hoje, reservas_semana
    # Só a representação segura: a URL original pode carregar token de
    # compartilhamento, e este log é sobre a RECUSA, não sobre a credencial.
    origem = _safe_url_for_log(spreadsheet_url)
    if not _ext_validate_source_url(spreadsheet_url, SPREADSHEET_MAX_URL_LEN):
        logger.error("URL da planilha rejeitada (proteção SSRF): %s", origem)
        if strict:
            raise RuntimeError('reservation spreadsheet unavailable or invalid')
        return reservas_hoje, reservas_semana
    logger.info("Baixando planilha de %s", origem)
    content, fetch_error = _ext_fetch_source_bytes(
        spreadsheet_url,
        max_bytes=SPREADSHEET_MAX_BYTES,
        timeout=(4, 6) if strict else SPREADSHEET_TIMEOUT,
        max_redirects=SPREADSHEET_MAX_REDIRECTS,
    )
    if fetch_error:
        # O detalhe técnico fica no log; o contrato de retorno é lista vazia, como
        # antes. `origem` já é a forma sanitizada — a URL crua nunca entra aqui.
        logger.error("Falha ao baixar a planilha de %s (%s)", origem, fetch_error)
        if _is_spreadsheet_link_access_error(fetch_error):
            status_match = re.search(r'HTTP (401|403|404)\b', str(fetch_error))
            _SPREADSHEET_LINK_ERRORS[status_key] = f'HTTP {status_match.group(1)}'
        if strict:
            raise RuntimeError('reservation spreadsheet unavailable or invalid')
        return reservas_hoje, reservas_semana
    # Daqui para baixo é o parser de antes, byte a byte: o `try` externo continua
    # sendo a rede de segurança do laço de linhas.
    try:
        try:
            # read_only + data_only: lê só os valores (sem fórmulas/render), bem mais rápido
            # SharePoint pode devolver HTML com HTTP 200 quando exige autenticação.
            # Bytes inválidos genéricos não provam que o link expirou.
            # Nunca registrar o corpo nem a URL completa, que pode conter token.
            if not content.startswith(b'PK'):
                logger.error("A fonte não retornou um XLSX válido: %s", origem)
                if _is_spreadsheet_login_response(content):
                    _SPREADSHEET_LINK_ERRORS[status_key] = (
                        'resposta HTML inesperada (possível autenticação ou link de compartilhamento)'
                    )
                else:
                    _SPREADSHEET_LINK_ERRORS.pop(status_key, None)
                if strict:
                    raise RuntimeError('reservation spreadsheet unavailable or invalid')
                return reservas_hoje, reservas_semana
            wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
            logger.info("Planilha carregada!")
            _SPREADSHEET_LINK_ERRORS.pop(status_key, None)
            _SPREADSHEET_LINK_SUCCESSES.add(status_key)
        except Exception as e:
            logger.error(f"Erro ao carregar planilha: {e}")
            if strict:
                raise RuntimeError('reservation spreadsheet unavailable or invalid')
            return reservas_hoje, reservas_semana
        try:
            ws = wb['RESERVA LAB. INFORMÁTICA']
        except KeyError:
            logger.error("Aba 'RESERVA LAB. INFORMÁTICA' não encontrada")
            if strict:
                raise RuntimeError('reservation spreadsheet unavailable or invalid')
            return reservas_hoje, reservas_semana
        hoje = get_today_sp()
        # Janela do calendário exibido no app: próximos 30 dias (antes eram 7).
        fim_janela = hoje + timedelta(days=30)
        for row in ws.iter_rows(min_row=2, values_only=True):
            try:
                reserva_feita_por = row[0]
                professor_resp = row[1]
                email = row[2]
                data_reserva = row[3]
                horario = row[4]
                # openpyxl entrega células formatadas como hora em datetime.time;
                # manter o objeto na resposta causava HTTP 500 ao montar o JSON.
                if isinstance(horario, datetime_time):
                    horario = _excel_time_to_text(horario)
                alunos = row[5]
                obs = row[6]
                lab = row[8]
                if data_reserva is None:
                    continue
                data = None
                if hasattr(data_reserva, 'date'):
                    try:
                        data = data_reserva.date()
                    except:
                        pass
                if data is None and isinstance(data_reserva, str):
                    for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y']:
                        try:
                            data = datetime.strptime(data_reserva, fmt).date()
                            break
                        except:
                            continue
                if data is None:
                    continue
                lab_normalizado = re.sub(r'\s+', ' ', str(lab)).strip() if lab else ''
                lab_list = _extract_labs(lab_normalizado, lab_count)
                horario_inicio = parse_horario_inicio(horario)
                horario_fim = parse_horario_fim(horario)
                reserva = {
                    'responsavel': professor_resp,
                    'email': email,
                    'horario': horario,
                    'alunos': alunos,
                    'observacao': obs,
                    'lab': lab,
                    'labs': lab_list,
                    'data': data,
                    'reserva_feita_por': reserva_feita_por,
                    'origem': 'planilha',
                    # Horário local do campus (America/Sao_Paulo), minutos desde meia-noite.
                    'horario_inicio': horario_inicio,
                    'horario_fim': horario_fim,
                    # Identificador determinístico da reserva (sem ID estável na planilha).
                    'reservation_id': _reservation_key(data, lab_list, horario, professor_resp,
                                                       email, reserva_feita_por,
                                                       horario_inicio, horario_fim),
                }
                if data == hoje:
                    reservas_hoje.append(reserva)
                elif hoje < data <= fim_janela:
                    reservas_semana.append(reserva)
            except Exception as e:
                logger.warning(f"Erro processando linha: {e}")
                if strict:
                    raise RuntimeError('reservation spreadsheet row invalid') from e
                continue
    except Exception as e:
        logger.error(f"Erro ao processar planilha: {e}")
        if strict:
            raise RuntimeError('reservation spreadsheet parse failed') from e
    finally:
        if wb is not None:
            wb.close()
    return reservas_hoje, reservas_semana

_UNSET = object()


def _resolve_spreadsheet_url(workspace_slug):
    """Resolve a planilha de um campus. Retorna (url, origem).

    origem: 'workspace' (planilha própria do campus) | 'fallback' (global do env)
            | 'missing' (nenhuma configurada).
    """
    if workspace_slug:
        url = _get_workspace_spreadsheet_url(workspace_slug)
        if url:
            return url, 'workspace'
    if ARQUIVO_URL:
        return ARQUIVO_URL, 'fallback'
    return None, 'missing'


def get_reservas(workspace_slug=None, spreadsheet_url=_UNSET, lab_count=2):
    cache_key = _cache_key_for(workspace_slug)
    # Cache por workspace: cada campus tem sua própria planilha e não pode
    # receber o cache de outro campus (nem do fallback global).
    cached = get_cached_reservas(cache_key)
    if cached:
        status_key = _SPREADSHEET_WORKSPACE_STATUS_KEYS.get(str(workspace_slug or 'default'))
        link_error = _SPREADSHEET_LINK_ERRORS.get(status_key)
        if link_error:
            _notify_super_admin_spreadsheet_link(workspace_slug, link_error)
        return cached
    
    if spreadsheet_url is _UNSET:
        spreadsheet_url, _ = _resolve_spreadsheet_url(workspace_slug)
    
    if spreadsheet_url and workspace_slug:
        logger.info(f"Usando planilha do workspace '{workspace_slug}'")
    
    reservas_hoje, reservas_semana = _parse_spreadsheet(spreadsheet_url, lab_count=lab_count)
    status_key = _spreadsheet_status_key(spreadsheet_url)
    _SPREADSHEET_WORKSPACE_STATUS_KEYS[str(workspace_slug or 'default')] = status_key
    link_error = _SPREADSHEET_LINK_ERRORS.get(status_key)
    if link_error:
        _notify_super_admin_spreadsheet_link(workspace_slug, link_error)
    if status_key in _SPREADSHEET_LINK_SUCCESSES:
        _clear_spreadsheet_link_alert(workspace_slug)
        _SPREADSHEET_LINK_SUCCESSES.discard(status_key)
    
    logger.info(f"Planilha[{cache_key}]: {len(reservas_hoje)} hoje, {len(reservas_semana)} semana")
    result = (reservas_hoje, reservas_semana)
    set_cached_reservas(cache_key, result)
    return result

@app.route('/api/reservas', methods=['GET'])
def api_reservas():
    try:
        workspace_slug = request.args.get('workspace')
        spreadsheet_url, spreadsheet_source = _resolve_spreadsheet_url(workspace_slug)
        lab_count = _get_workspace_lab_count(workspace_slug) if workspace_slug else 2
        reservas_hoje, reservas_semana = get_reservas(workspace_slug, spreadsheet_url=spreadsheet_url, lab_count=lab_count)
        
        for r in reservas_hoje:
            if isinstance(r.get('data'), (date, datetime)):
                r['data'] = r['data'].strftime('%d/%m/%Y')
        
        for r in reservas_semana:
            if isinstance(r.get('data'), (date, datetime)):
                r['data'] = r['data'].strftime('%d/%m/%Y')

        lab1 = [r for r in reservas_hoje if 'LAB01' in r.get('labs', [])]
        lab2 = [r for r in reservas_hoje if 'LAB02' in r.get('labs', [])]
        lab_reservas = {}
        for r in reservas_hoje:
            for lab in r.get('labs', []):
                lab_reservas.setdefault(lab, []).append(r)
        labs_ordenados = sorted(lab_reservas.keys(), key=lambda x: int(re.sub(r'\D', '', x) or 0))
        
        meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
        hoje = get_today_sp()
        data_formatada = f"{hoje.day:02d} de {meses[hoje.month-1]} de {hoje.year}"
        
        cache_info = {}
        cache_path = _cache_path(_cache_key_for(workspace_slug))
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                    cache_info = {'timestamp': cache_data.get('timestamp', 0)}
            except Exception:
                pass

        return jsonify({
            'lab1_reservas': lab1,
            'lab2_reservas': lab2,
            'lab_reservas': lab_reservas,
            'labs': labs_ordenados,
            'lab_count': lab_count,
            'reservas_semana': reservas_semana,
            'data': data_formatada,
            'cache_info': cache_info,
            'spreadsheet': spreadsheet_source
        })
    except Exception as e:
        logger.error("Erro na rota api_reservas: %s", e)
        return jsonify({'error': 'Erro ao processar reservas'}), 500

@app.route('/api/health')
def health():
    cache_data = None
    path = _cache_path(_cache_key_for())
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
        except Exception:
            pass
    return jsonify({
        'status': 'ok',
        'cache': {
            'ativo': True,
            'ttl': CACHE_TTL,
            'timestamp': cache_data.get('timestamp', 0) if cache_data else 0
        },
        'url_configurada': bool(ARQUIVO_URL)
    })

# ─── Push Notifications ──────────────────────────────────────────

def parse_horario_inicio(horario):
    if not horario:
        return None
    s = str(horario).strip().lower()
    # Pega apenas a primeira parte do horário (antes de "até", "as", "às", "a", "-", etc.)
    parts = re.split(r'\s+(?:até|ate|as|às|a)\s+|(?:\s+-\s+)|-', s)
    s = parts[0].strip() if parts else s
    
    # Formatos: "11:30", "11h30", "11h", "11", "09:35h"
    match = re.match(r'^(\d{1,2})(?:\s*[:h]\s*(\d{2}))?', s)
    if match:
        hora = int(match.group(1))
        minuto = int(match.group(2)) if match.group(2) else 0
        return hora * 60 + minuto
    return None

def parse_horario_fim(horario):
    """Minutos desde meia-noite do FIM do intervalo ("07h30 às 09h20" → 560).

    Espelho de parse_horario_inicio: pega a ÚLTIMA parte do intervalo. Só retorna
    um valor quando o texto contém um separador de intervalo ("às"/"até"/"a"/"−");
    sem intervalo (ex.: "11h30" avulso) retorna None para não mentir um fim.
    """
    if not horario:
        return None
    s = str(horario).strip().lower()
    # Sem separador de intervalo → não há fim declarado.
    if not re.search(r'\s+(?:até|ate|as|às|a)\s+|(?:\s+-\s+)|-', s):
        return None
    parts = re.split(r'\s+(?:até|ate|as|às|a)\s+|(?:\s+-\s+)|-', s)
    s = parts[-1].strip() if parts else s
    match = re.match(r'^(\d{1,2})(?:\s*[:h]\s*(\d{2}))?', s)
    if match:
        hora = int(match.group(1))
        minuto = int(match.group(2)) if match.group(2) else 0
        return hora * 60 + minuto
    return None

def _reservation_key(data, labs, horario, responsavel, email, reserva_feita_por,
                     horario_inicio=None, horario_fim=None):
    """Chave determinística da reserva (a planilha NÃO tem ID estável).

    Identidade de uma reserva = quando (data) + onde (labs normalizados) + horário
    (normalizado em minutos; fallback texto bruto) + professor + email + quem reservou.
    O escopo por campus é garantido no banco (tv_events UNIQUE(workspace_id,
    reservation_id)), então a chave é campus-agnóstica. Estável entre re-fetches da
    planilha; qualquer mudança real de data/lab/horário/professor gera nova reserva.
    """
    if horario_inicio is not None and horario_fim is not None:
        horario_norm = f"{horario_inicio}-{horario_fim}"
    else:
        horario_norm = str(horario or '').strip()
    labs_norm = ','.join(sorted({str(l).strip() for l in (labs or []) if l}))
    seed = '|'.join([
        data.isoformat() if hasattr(data, 'isoformat') else str(data or ''),
        labs_norm,
        horario_norm,
        str(responsavel or '').strip(),
        str(email or '').strip(),
        str(reserva_feita_por or '').strip(),
    ])
    return hashlib.md5(seed.encode('utf-8')).hexdigest()

@app.route('/api/push/subscribe', methods=['POST'])
@require_auth
def push_subscribe():
    """Registra inscrição de push do dispositivo.

    Requer JWT (Authorization: Bearer): a identidade do usuário NÃO é mais
    aceita do body — o `g.user` vem do token verificado no servidor e o perfil
    é re-buscado no Supabase (SEC-03). O cliente envia apenas o payload da
    subscription + preferências de notificação (notify_settings).
    """
    if not _push_store_ready():
        return jsonify({'error': 'Push store not configured'}), 500
    try:
        body = request.get_json() or {}
        endpoint = body.get('endpoint', '')
        if not endpoint:
            return jsonify({'error': 'Missing endpoint'}), 400

        # Identidade autoritativa: JWT (g.user) → profiles no servidor.
        # Client-supplied `user` é ignorado para id/role/workspaces.
        user = body.get('user') or {}
        user_id = str((g.user or {}).get('id', '') or '')

        server_user = {
            'id': user_id,
            'name': str((g.user or {}).get('name', '') or user.get('name', '') or ''),
            'role': '',
            'is_super_admin': False,
            # 9.3-B: workspace_ids NÃO é mais persistido (resolução direta por
            # memberships em _target_subs/auditoria); apps/notify_settings
            # seguem no registro (preferências e níveis conhecidos no ato).
            'apps': user.get('apps') or {},
            'notify_settings': user.get('notify_settings') or {},
        }
        if user_id and _SUPABASE_URL and _SUPABASE_SERVICE_KEY:
            try:
                prof_resp = requests.get(
                    f'{_SUPABASE_URL}/rest/v1/profiles',
                    params={
                        'id': f'eq.{user_id}',
                        'select': 'role,is_super_admin',
                    },
                    headers={
                        'apikey': _SUPABASE_SERVICE_KEY,
                        'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
                    },
                    timeout=5,
                )
                if prof_resp.ok:
                    rows = prof_resp.json()
                    if rows:
                        p = rows[0]
                        server_user['role'] = p.get('role') or ''
                        server_user['is_super_admin'] = bool(p.get('is_super_admin'))
                        # Inscrição espelha memberships ativas (9.2-D.1); a coluna
                        # legada nunca decide o targeting de push.
                        server_user['workspace_ids'] = _get_user_workspace_ids(user_id)
            except Exception:
                pass

        sub = {
            'key': hashlib.sha256(endpoint.encode()).hexdigest(),
            'endpoint': endpoint,
            'expirationTime': body.get('expirationTime'),
            'keys': body.get('keys') or {},
            'user': server_user,
        }

        # A RPC faz o dedupe por dispositivo (CONFLICT(endpoint) DO UPDATE),
        # substituindo o payload anterior sem apagar as demais inscrições.
        _active_push_store().push_subs_save(sub)
        logger.info(f"Push subscriber added: {sub['key'][:8]}... role={sub['user']['role']}")
        return jsonify({'status': 'ok'})
    except Exception as e:
        logger.error("Push subscribe error: %s", e)
        return jsonify({'error': 'Erro ao registrar inscrição de push'}), 500

@app.route('/api/push/test-device', methods=['POST'])
@require_auth
def push_test_device():
    """Envia um Push de diagnóstico somente à inscrição do próprio dispositivo.

    O endpoint informado pelo cliente é validado contra a inscrição no store e
    contra o user_id obtido da sessão autenticada; não permite testar dispositivos
    de terceiros nem usa o endpoint administrativo de envio em massa.
    """
    if not _push_store_ready():
        return jsonify({'error': 'Serviço de notificações indisponível'}), 503
    try:
        body = request.get_json(silent=True) or {}
        endpoint = str(body.get('endpoint') or '').strip()
        user_id = str((g.user or {}).get('id') or '').strip()
        if not endpoint:
            return jsonify({'error': 'Inscrição do dispositivo não informada'}), 400
        if not user_id:
            return jsonify({'error': 'Sessão inválida'}), 401

        subscription = next((
            sub for sub in _get_subs()
            if sub.get('endpoint') == endpoint
            and str((sub.get('user') or {}).get('id') or '') == user_id
        ), None)
        if not subscription:
            return jsonify({'error': 'Inscrição deste dispositivo não encontrada. Ative as notificações novamente.'}), 404

        outcome = _push_outcome(push_notify(
            subscription,
            'Teste de notificações do LabHub',
            'Se esta mensagem apareceu, o Push chegou a este dispositivo.',
            url='/chamados/settings',
        ))
        if outcome == PUSH_REJECTED:
            return jsonify({
                'sent': False,
                'status': 'rejected',
                'error': 'O serviço Push rejeitou a inscrição deste dispositivo. Reative as notificações.',
            }), 502
        if outcome != PUSH_ACCEPTED:
            return jsonify({
                'sent': False,
                'status': 'unknown',
                'error': 'O servidor não conseguiu confirmar a aceitação do Push. Confira o dispositivo antes de repetir.',
            }), 503
        # HTTP 2xx do provedor = aceito para entrega, NÃO exibido no dispositivo.
        return jsonify({'sent': True, 'status': 'accepted'})
    except Exception as e:
        logger.error('Push device test error: %s', e)
        return jsonify({'error': 'Não foi possível testar as notificações'}), 500

# Contrato interno do Push. `accepted` = o serviço respondeu 2xx (aceitação
# para entrega, NÃO exibição no dispositivo); `rejected` = há evidência de que
# a requisição não foi aceita; `unknown` = não é possível determinar se o
# provedor aceitou. Nunca transforme `unknown` em confirmação de envio.
# 5xx é `unknown`: um erro interno pode acontecer após a aceitação.
PUSH_ACCEPTED = 'accepted'
PUSH_REJECTED = 'rejected'
PUSH_UNKNOWN = 'unknown'


class _PushRejectedExpired(str):
    """`PUSH_REJECTED` com evidência documentada de inscrição inválida.

    É um `str` para preservar o contrato público de `push_notify` (comparações
    com `PUSH_REJECTED` continuam valendo). O atributo distingue HTTP 404/410 —
    endpoint removido/expirado — de uma rejeição genérica, que NÃO autoriza
    remover a inscrição de listas por chamado.
    """
    invalid_subscription = True


def _push_rejected_expired():
    """Resultado rejeitado com evidência suficiente para remover a inscrição."""
    return _PushRejectedExpired(PUSH_REJECTED)


# Limite por envio nos callers em massa (cron/endpoints), para que uma
# requisição travada não mantenha o processo preso indefinidamente.
PUSH_BULK_TIMEOUT_SECONDS = 20


class _PushTransmissionSession:
    """Proxy mínimo passado ao pywebpush para marcar o início do POST.

    O pywebpush usa `requests_session.post(...)` para a transmissão. Registrar
    a entrada nesse método permite distinguir falha local (antes do envio) de
    falha durante/depois da transmissão — sem depender do texto da exceção.
    """

    def __init__(self):
        self.transmitted = False

    def post(self, *args, **kwargs):
        self.transmitted = True
        return requests.post(*args, **kwargs)


def _push_outcome(result):
    """Normaliza o resultado para o contrato tripartite.

    Os literais booleanos são aceitos apenas por compatibilidade com chamadores
    e mocks legados; `push_notify` nunca deve retornar bool.
    """
    if result is True:
        return PUSH_ACCEPTED
    if result is False:
        return PUSH_REJECTED
    if result in (PUSH_ACCEPTED, PUSH_REJECTED, PUSH_UNKNOWN):
        return result
    return PUSH_UNKNOWN


# 4xx com evidência documentada de rejeição pelo provedor Web Push.
# 5xx NÃO entra: um erro interno pode ocorrer depois da aceitação.
_PUSH_REJECTABLE_4XX = frozenset({400, 401, 403, 404, 410})


def _classify_push_exception(exc, transmitted):
    """Devolve (resultado, remover_inscricao) para uma exceção do pywebpush."""
    resp = getattr(exc, 'response', None)
    status = getattr(resp, 'status_code', None)
    if status is not None:
        try:
            code = int(status)
        except (TypeError, ValueError):
            return PUSH_UNKNOWN, False
        if code in (404, 410):
            return PUSH_REJECTED, True
        if code in _PUSH_REJECTABLE_4XX:
            return PUSH_REJECTED, False
        # 5xx e 4xx fora da lista documentada são indeterminados: o provedor
        # pode ter processado a mensagem antes de falhar. Nunca inferir
        # aceitação apenas porque uma resposta foi recebida.
        return PUSH_UNKNOWN, False

    # Timeout/queda de conexão são incertos por definição, mesmo se a biblioteca
    # tiver levantado antes de o proxy registrar o POST.
    if isinstance(exc, requests.exceptions.RequestException):
        return PUSH_UNKNOWN, False
    if transmitted:
        return PUSH_UNKNOWN, False

    # Sem resposta e sem transmissão: a falha é comprovadamente anterior ao
    # envio (subscription inválida, VAPID, serialização, criptografia).
    if isinstance(exc, (WebPushException, ValueError, TypeError,
                        KeyError, AttributeError, json.JSONDecodeError)):
        return PUSH_REJECTED, False
    return PUSH_UNKNOWN, False


def push_notify(sub, title, body, url='/', actions=None, user_id=None, timeout=None, module=None, tag=None):
    """Envia Web Push e devolve `PUSH_ACCEPTED`, `PUSH_REJECTED` ou `PUSH_UNKNOWN`.

    `timeout` é opcional e repassado ao pywebpush/requests. Callers que precisam
    de limites rígidos (ex.: lembretes, que renovam lock) devem passar um valor
    explícito. HTTP 2xx significa que o serviço aceitou a mensagem para entrega;
    não é confirmação de exibição no dispositivo. Timeout/queda após a
    transmissão resultam em `PUSH_UNKNOWN`, nunca em aceitação confirmada.
    """
    session = _PushTransmissionSession()
    try:
        data = {'title': title, 'body': body, 'url': url}
        if module:
            data['module'] = str(module)[:40]
        if tag:
            data['tag'] = str(tag)[:128]
        if actions:
            data['actions'] = actions
        if user_id:
            data['userId'] = user_id
        webpush(
            subscription_info=sub,
            data=json.dumps(data),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=dict(VAPID_CLAIMS),
            ttl=86400,
            timeout=timeout,
            requests_session=session,
        )
        logger.info("[push] aceito (2xx) para entrega; exibição no dispositivo não é confirmada")
        return PUSH_ACCEPTED
    except Exception as e:
        outcome, remove_sub = _classify_push_exception(e, session.transmitted)
        if remove_sub:
            # HTTP 404/410 é evidência de inscrição inválida. A remoção é
            # best-effort: falha do store nunca altera o resultado do envio.
            try:
                endpoint = str((sub or {}).get('endpoint') or '')
                if endpoint:
                    _active_push_store().push_subs_remove(endpoint)
                logger.info("[push] inscrição removida do store (HTTP 404/410)")
            except Exception as rm_err:
                logger.error(f"Push: falha ao remover inscrição do store: {rm_err}")
        if outcome == PUSH_REJECTED and remove_sub:
            logger.warning("[push] rejeitado: inscrição inválida (404/410): %s", e)
            return _push_rejected_expired()
        if outcome == PUSH_REJECTED:
            logger.warning("[push] rejeitado: %s", e)
        else:
            logger.warning(
                "[push] resultado desconhecido (transmitido=%s): %s — não registrar como aceito",
                session.transmitted, e,
            )
        return outcome


def _push_notify_subs(subs, title, body, url='/', actions=None, user_id=None,
                      timeout=PUSH_BULK_TIMEOUT_SECONDS):
    """Notifica vários destinatários e devolve (accepted, rejected, unknown).

    Chamadores que gravam deduplicação ou contabilizam `sent` só devem fazê-lo
    quando `rejected == 0 and unknown == 0`: `unknown` (resposta perdida/timeout)
    não é sucesso confirmado e não pode marcar a notificação como já entregue.
    """
    accepted = rejected = unknown = 0
    kwargs = {'timeout': timeout} if timeout is not None else {}
    if url != '/':
        kwargs['url'] = url
    if actions:
        kwargs['actions'] = actions
    if user_id:
        kwargs['user_id'] = user_id
    for sub in subs:
        outcome = _push_outcome(push_notify(sub, title, body, **kwargs))
        if outcome == PUSH_ACCEPTED:
            accepted += 1
        elif outcome == PUSH_REJECTED:
            rejected += 1
        else:
            unknown += 1
    return accepted, rejected, unknown


def _push_sub_dedup_identity(sub):
    """Identificador estável e não sensível de um destinatário push."""
    sub = sub or {}
    endpoint = str(sub.get('endpoint') or '').strip()
    if endpoint:
        return hashlib.sha256(endpoint.encode('utf-8')).hexdigest()[:16]
    uid = str((sub.get('user') or {}).get('id') or sub.get('key') or '').strip()
    if not uid:
        return ''
    return 'uid:' + hashlib.sha256(uid.encode('utf-8')).hexdigest()[:16]


def _push_dedup_key(event_id, sub, workspace_id=None, context=None):
    """Chave individual: evento + destinatário + workspace/contexto.

    Nunca é uma chave global do lote: um destinatário aceito não pode suprimir
    a tentativa dos demais, nem um resultado incerto pode apagar a marca de
    quem já foi aceito.
    """
    identity = _push_sub_dedup_identity(sub)
    if not identity:
        return None
    parts = ['push:sent', str(event_id), identity]
    if workspace_id:
        parts.append('ws:' + str(workspace_id))
    if context:
        parts.append(str(context))
    return ':'.join(parts)


# A existência da chave, sozinha, NÃO prova envio. O valor carrega o estado:
# `reserved:<token>` é uma reserva temporária; `accepted:<token>` é a marca
# definitiva. O formato legado `'1'` (se existir em uma chave individual)
# apenas bloqueia nova reserva; NÃO é prova de 2xx e nunca é contado como
# aceitação confirmada.
_PUSH_DEDUP_RESERVED = 'reserved'
_PUSH_DEDUP_ACCEPTED = 'accepted'

# A confirmação/liberação atômicas vivem no PostgreSQL (`push_dedup_confirm` /
# `push_dedup_release` em pg_store). O parser abaixo permanece como função pura
# para compatibilidade com quem inspeciona valores brutos em testes/diagnóstico;
# o fluxo real usa `dedup_state(key)` do store ativo.


def _push_dedup_state(raw):
    """Classifica um valor bruto legado sem depender só da existência da chave.

    Devolve `(estado, token)`, onde estado é `absent`, `reserved`, `accepted`
    ou `unknown`. Valores corrompidos são `unknown` (fail-closed: nunca são
    aceitos como confirmação, mas também não são apagados por esta leitura).
    """
    if raw is None:
        return 'absent', None
    # `'1'` é tentativa legada, não aceitação confirmada: classificá-lo como
    # `unknown` mantém o fail-closed sem falsificar 2xx por destinatário.
    value = str(raw)
    if ':' not in value:
        return 'unknown', None
    state, token = value.split(':', 1)
    if token and state == _PUSH_DEDUP_RESERVED:
        return _PUSH_DEDUP_RESERVED, token
    if token and state == _PUSH_DEDUP_ACCEPTED:
        return _PUSH_DEDUP_ACCEPTED, token
    return 'unknown', None


def _push_dedup_release(key, token):
    """Libera uma reserva somente se o token ainda pertencer a esta execução."""
    if not key or not token:
        return False
    try:
        return bool(_active_dedup_store().dedup_release(key, token))
    except Exception as e:
        logger.warning("[push] falha ao liberar reserva de dedup: %s", e)
        return False


def _push_legacy_dedup_key(event_id):
    """Chave global da implementação antiga: `push:sent:{notify_id}`."""
    return f'push:sent:{event_id}'


def _push_legacy_dedup_state(raw):
    """Classifica a chave global antiga SEM atribuir aceitação a ela.

    Esta chave nunca é gravada pela versão atual. O código antigo escrevia
    `'1'` após tentar o lote inteiro, sem verificar 2xx por destinatário:
    portanto `'1'` é uma TENTATIVA, não uma confirmação. Qualquer outro valor
    é desconhecido/corrompido e nunca autoriza envio.
    """
    if raw is None:
        return 'absent'
    if str(raw) == '1':
        return 'attempted'
    return 'unknown'


def _push_check_legacy_dedup(event_id, total):
    """Política explícita de migração da dedup global antiga.

    A chave `push:sent:{notify_id}` é apenas um sinal de migração, não uma
    prova de entrega. A implementação anterior gravava `'1'` mesmo quando os
    envios individuais não tinham sido aceitos, então este valor NÃO pode ser
    contado como aceitação e NÃO pode ser transformado em marca individual.

    Política adotada (at-least-once, sem confusão entre tentativa e aceitação):

      · chave ausente => fluxo individual normal;
      · `'1'` (tentativa antiga) => NÃO pula o lote e NÃO marca destinatários.
        O fluxo individual segue com reserva/confirmação por destinatário.
        Efeito: destinatários realmente notificados pela versão antiga podem
        receber uma duplicata, limitada ao TTL das marcas individuais; em
        troca não perdemos notificações para quem nunca foi alcançado e não
        falsificamos `accepted`;
      · qualquer outro valor (inclusive `reserved:`/`accepted:`) => valor
        desconhecido/corrompido: fail-closed, nenhum envio;
      · falha ao ler o store => fail-closed, nenhum envio.

    Esta função NÃO cria, reescreve nem exclui a chave global: isso
    restauraria a supressão global que a correção individual veio eliminar.
    """
    if total <= 0:
        return 0, 0
    if not _push_store_ready():
        return 0, total
    key = _push_legacy_dedup_key(event_id)
    try:
        # Leitura via store (não `get` direto): o PostgreSQL devolve o estado
        # já classificado. Esta chave NUNCA é escrita/removida por aqui.
        state, _token = _active_dedup_store().dedup_state(key)
    except Exception as e:
        logger.warning("[push] falha ao ler dedup legada %s: %s", key, e)
        return 0, total
    if state == 'absent':
        return 0, 0
    if state == 'attempted':
        logger.info(
            "[push] chave legada %s registra tentativa antiga; seguindo dedup individual",
            key,
        )
        return 0, 0
    logger.warning("[push] valor desconhecido na dedup legada %s; fail-closed", key)
    return 0, total


def _push_notify_subs_dedup(subs, event_id, ttl, title, body, url='/', actions=None,
                            user_id=None, workspace_id=None, context=None, module=None, tag=None):
    """Envia com dedup individual reservada e confirmada atomicamente.

    Devolve (accepted, rejected, unknown, skipped, dedup_failed).

    A reserva é criada atomicamente (equivalente a SET NX EX) antes do envio:
    duas execuções concorrentes nunca enviam ao mesmo (evento, destinatário). Um
    token aleatório exclusivo por execução faz o fencing de todas as operações
    seguintes. Somente `PUSH_ACCEPTED` confirma a reserva, via RPC PostgreSQL,
    para `accepted:<token>` preservando o TTL original. `PUSH_REJECTED` e
    `PUSH_UNKNOWN` liberam apenas a reserva desta execução; falha na liberação
    deixa a reserva expirar pelo TTL. Falha do store na reserva ou na confirmação
    é fail-closed: nenhum envio sem reserva atômica e nenhuma confirmação falsa.

    Antes do loop há a política de migração de `push:sent:{notify_id}` (ver
    `_push_check_legacy_dedup`): o valor antigo `'1'` é apenas uma tentativa,
    não uma aceitação, e NÃO suprime o lote. Somente as marcas individuais
    reservadas/confirmadas nesta execução controlam duplicidade.

    `sent`, nos callers, significa destinatários com aceitação confirmada
    (`PUSH_ACCEPTED`); attempted/rejected/unknown/skipped nunca entram nessa
    contagem. Os cron endpoints mantêm a chave `sent` por compatibilidade, mas
    o valor é esse número de aceitações confirmadas.
    """
    accepted = rejected = unknown = skipped = dedup_failed = 0
    if not _push_store_ready():
        return accepted, rejected, unknown, skipped, len(subs)

    legacy_skipped, legacy_failed = _push_check_legacy_dedup(event_id, len(subs))
    if legacy_skipped or legacy_failed:
        return 0, 0, 0, legacy_skipped, legacy_failed

    kwargs = {'timeout': PUSH_BULK_TIMEOUT_SECONDS}
    if module:
        kwargs['module'] = module
    if tag:
        kwargs['tag'] = tag
    if url != '/':
        kwargs['url'] = url
    if actions:
        kwargs['actions'] = actions
    if user_id:
        kwargs['user_id'] = user_id

    ttl_seconds = int(ttl)
    for sub in subs:
        key = _push_dedup_key(event_id, sub, workspace_id=workspace_id, context=context)
        if not key:
            logger.warning("[push] destinatário sem identidade estável; envio pulado (fail-closed)")
            skipped += 1
            continue
        token = secrets.token_hex(16)
        try:
            # Equivalente a SET NX EX: uma única execução consegue a reserva.
            claimed = _active_dedup_store().dedup_reserve(key, token, ttl_seconds)
        except Exception as e:
            logger.warning("[push] falha do store ao reservar dedup individual: %s", e)
            dedup_failed += 1
            continue
        if not claimed:
            skipped += 1
            continue
        try:
            outcome = _push_outcome(push_notify(sub, title, body, **kwargs))
        except Exception as e:
            logger.warning("[push] falha inesperada no envio individual: %s", e)
            outcome = PUSH_UNKNOWN

        if outcome == PUSH_ACCEPTED:
            try:
                # A RPC preserva o TTL original da reserva e só confirma se o
                # token desta execução ainda estiver vigente.
                confirmed = _active_dedup_store().dedup_confirm(key, token)
            except Exception as e:
                logger.warning("[push] falha do store ao confirmar dedup individual: %s", e)
                confirmed = False
            if confirmed:
                accepted += 1
            else:
                # O provedor aceitou, mas não há marca confirmada. Não
                # reportar aceitação; liberar a reserva fenciada para que a
                # política at-least-once permita nova tentativa.
                dedup_failed += 1
                _push_dedup_release(key, token)
            continue

        _push_dedup_release(key, token)
        if outcome == PUSH_REJECTED:
            rejected += 1
        else:
            unknown += 1
    return accepted, rejected, unknown, skipped, dedup_failed


def _queue_push_event(
    event_id, title, body, *, module, workspace_id=None, user_id=None,
    role=None, min_level=None, target_super_admin=None, url='/', ttl=86400,
    context=None, actions=None, expires_at=None, reservation_id=None, persist_inapp=False,
    exclude_user_id=None,
):
    """Registra evento Push no outbox; None indica fallback legado seguro."""
    if not pg_store.is_configured():
        return None
    payload = {
        'title': str(title or '')[:160],
        'body': str(body or '')[:2000],
        'module': module,
        'workspace_id': workspace_id,
        'target_user_id': user_id,
        'target_role': role,
        'target_super_admin': target_super_admin,
        'min_level': min_level,
        'action_url': url or '/',
        'ttl': max(60, min(int(ttl), 604800)),
        'context': context or module or 'app-notification',
        'actions': actions if isinstance(actions, list) else None,
    }
    if exclude_user_id:
        payload['exclude_user_id'] = str(exclude_user_id)
    if expires_at is not None:
        payload['expires_at'] = expires_at
    if reservation_id is not None:
        payload['reservation_id'] = str(reservation_id)
    if persist_inapp:
        payload['persist_inapp'] = True
    try:
        inserted = pg_store.store.notification_outbox_enqueue(
            str(event_id), None, payload,
        )
        return 'queued' if inserted else 'duplicate'
    except Exception as exc:
        # Compatibilidade de rollout: antes da migration 113 ou em falha
        # transitória do Postgres, o caller mantém o envio legado síncrono.
        logger.warning('[push-outbox] enqueue indisponível; fallback legado: %s', exc)
        return None


@app.route('/api/push/test', methods=['GET'])
@require_auth
@require_admin
def push_test():
    if not _push_store_ready():
        return jsonify({'error': 'Push store not configured'}), 500
    subs = _get_subs()
    if not subs:
        return jsonify({'message': 'No subscribers'})
    count = 0
    for sub in subs:
        ok = _push_outcome(push_notify(sub, 'Teste Reservas Lab', 'Notificação push funcionando! 🔔'))
        if ok == PUSH_ACCEPTED:
            count += 1
    return jsonify({'sent': count, 'total': len(subs)})


@app.route('/api/push/send', methods=['POST'])
@require_auth
@require_admin
@require_action_rbac('reservelab.push.manage', scope='global')
def push_send():
    """Envia um push para os subscribers (filtrando por módulo, workspace, cargo e usuário)."""
    if not _push_store_ready():
        return jsonify({'error': 'Push store not configured'}), 500
    try:
        body = request.get_json() or {}
        title = body.get('title', 'LabHub')
        msg = body.get('body', '')
        url = body.get('url', '/')
        actions = body.get('actions') or None
        user_id = body.get('userId') or None
        role = body.get('role') or None
        module = body.get('module') or None
        workspace_id = body.get('workspace_id') or None

        event_id = f"manual:{uuid.uuid4().hex}"
        status = _queue_push_event(
            event_id, title, msg,
            module=module, workspace_id=workspace_id, user_id=user_id,
            role=role, url=url, context='manual-admin-push', actions=actions,
        )
        if status is None:
            return jsonify({'error': 'Não foi possível registrar o Push na fila'}), 503
        return jsonify({'status': status, 'queued': status == 'queued', 'event_id': event_id}), 202
    except Exception as e:
        logger.error("Push send error: %s", e)
        return jsonify({'error': 'Erro ao enviar notificação push'}), 500


def _is_valid_uuid(value: str) -> bool:
    """True se a string é um UUID válido (aceito pelo tipo `uuid` do Postgres).

    Guarda do lote de memberships (22P02): um id não-UUID (ex.: "user-1")
    dentro de `profile_id=in.(...)` faz o PostgREST rejeitar a query inteira
    com 400, derrubando TODA a seleção de destinatários (fail-closed).
    Aceita qualquer formato que o Postgres aceite (com/sem hífens, caixa
    alta/baixa); valores claramente inválidos retornam False.
    """
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _resolve_batch_memberships(subs):
    """Workspaces ativos por user id, resolvidos na hora via memberships.

    9.3-B: o targeting de push não lê mais o campo gravado na inscrição
    (payload legado); resolve memberships ativas por lote (service_role).
    IDs que não são UUIDs válidos são ignorados — nunca entram na query
    PostgREST (impede o 400/22P02 que derrubava o batch inteiro); os UUIDs
    válidos continuam sendo consultados normalmente.
    Falha real na consulta ⇒ {} (fail-closed: sem workspace resolvido,
    sem envio).
    """
    ids = sorted({str((s.get('user') or {}).get('id') or '') for s in subs})
    ids = [i for i in ids if i]
    if not ids or not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return {}
    try:
        valid_ids = [i for i in ids if _is_valid_uuid(i)]
        invalid_ids = [i for i in ids if not _is_valid_uuid(i)]
        if invalid_ids:
            logger.warning(
                "push: %d user_id(s) não-UUID ignorados no batch de memberships",
                len(invalid_ids),
            )
        if not valid_ids:
            return {}
        in_list = ','.join(f'"{i}"' for i in valid_ids)
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/memberships'
            f'?profile_id=in.({quote(in_list)})&status=eq.active'
            '&select=profile_id,workspace_id',
            headers={
                'apikey': _SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
            },
            timeout=10,
        )
        if not resp.ok:
            return {}
        out = {}
        for r in (resp.json() or []):
            uid, ws = r.get('profile_id'), r.get('workspace_id')
            if uid and ws and r.get('status', 'active') == 'active':
                out.setdefault(str(uid), set()).add(str(ws))
        return out
    except Exception:
        return {}


# ── Targeting de push por módulo (RBAC2, resolução no servidor) ─────────────
# Ações exigidas por módulo para receber push. Fonte: catálogo de Actions
# (docs/architecture/rbac2.0-actions-catalog.md) + seeds 036/040/078. O campo
# `apps` do snapshot da inscrição NUNCA decide o targeting — a autoridade é a
# membership ativa + as Actions do role (service_role). A chave é o antigo
# `min_level` ('full' = somente Actions operacionais; None = qualquer Action do
# módulo). Módulo ou nível sem critério cadastrado ⇒ fail-closed (somente super
# admin recebe).
_MODULE_PUSH_ACTIONS = {
    'chamados': {
        None: frozenset({
            'ticket.create', 'ticket.view', 'ticket.edit', 'ticket.status',
            'ticket.assign', 'ticket.comment', 'ticket.close', 'ticket.reopen',
            'ticket.delete', 'ticket.qr', 'ticket.report',
        }),
        'full': frozenset({
            'ticket.edit', 'ticket.status', 'ticket.assign', 'ticket.comment',
            'ticket.close', 'ticket.reopen', 'ticket.delete', 'ticket.qr',
        }),
        # Apenas quem pode ASSUMIR chamados deve receber alertas de
        # novo chamado e cobranças por falta de técnico.
        'claim': frozenset({'ticket.claim'}),
    },
    'reservalab': {
        'full': frozenset({'reservelab.tablet.reserve', 'reservelab.tablet.cancel'}),
    },
    'stock': {
        None: frozenset({
            'stock.item.create', 'stock.item.edit', 'stock.item.delete',
            'stock.movement.create', 'stock.movement.manage', 'stock.kit.audit',
            'stock.inventory.run', 'stock.maintenance.manage', 'stock.export',
        }),
    },
    'pc-care': {
        None: frozenset({
            'pcare.asset.create', 'pcare.asset.edit', 'pcare.asset.manage',
            'pcare.part.create', 'pcare.part.edit', 'pcare.part.delete',
            'pcare.maintenance.manage', 'pcare.export', 'pcare.import',
        }),
    },
    'tv': {
        None: frozenset({
            'tv.content.manage', 'tv.urgentAnnouncement', 'music.request',
            'music.moderate', 'tv.settings.manage', 'tv.device.manage',
        }),
    },
}


def _resolve_batch_rbac(subs, *, strict=False):
    """Memberships ativas com papel por usuário: {uid: {ws: {'membership_id', 'role_id'}}}.

    Mesma guarda de UUID do batch de workspaces (`_resolve_batch_memberships`):
    IDs não-UUID são ignorados (nunca entram na query PostgREST — 22P02) e
    falha real na consulta ⇒ {} (fail-closed: sem membership resolvida, sem
    envio). SELECT carrega id + role_id — a base para resolver as Actions de
    cada papel por lote no targeting de push.
    """
    ids = sorted({str((s.get('user') or {}).get('id') or '') for s in subs})
    ids = [i for i in ids if i]
    if not ids or not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return {}
    try:
        valid_ids = [i for i in ids if _is_valid_uuid(i)]
        invalid_ids = [i for i in ids if not _is_valid_uuid(i)]
        if invalid_ids:
            logger.warning(
                "push: %d user_id(s) não-UUID ignorados no batch de RBAC",
                len(invalid_ids),
            )
        if not valid_ids:
            return {}
        in_list = ','.join(f'"{i}"' for i in valid_ids)
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/memberships'
            f'?profile_id=in.({quote(in_list)})&status=eq.active'
            '&select=profile_id,workspace_id,id,role_id',
            headers={
                'apikey': _SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
            },
            timeout=10,
        )
        if not resp.ok:
            if strict:
                raise RuntimeError('push RBAC lookup failed')
            return {}
        rows = resp.json()
        if not isinstance(rows, list) or (strict and len(rows) >= 1000):
            raise RuntimeError('push RBAC response invalid or incomplete')
        out = {}
        for r in rows:
            uid, ws = r.get('profile_id'), r.get('workspace_id')
            if uid and ws:
                entry = out.setdefault(str(uid), {}).setdefault(str(ws), {})
                entry['membership_id'] = r.get('id')
                entry['role_id'] = r.get('role_id')
        return out
    except Exception:
        if strict:
            raise
        return {}


def _resolve_batch_role_permissions(role_ids, *, strict=False):
    """Actions por role (escopo 'workspace' apenas): {role_id: {action}}.

    Falha/impossível ⇒ {} (fail-closed). Ações de outro escopo (global/self)
    não entram — push é segmentação por workspace.
    """
    role_ids = sorted({str(r) for r in (role_ids or []) if r})
    if not role_ids or not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return {}
    try:
        in_list = ','.join(f'"{r}"' for r in role_ids)
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/role_permissions'
            f'?role_id=in.({quote(in_list)})&select=role_id,action,scope',
            headers={
                'apikey': _SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
            },
            timeout=10,
        )
        if not resp.ok:
            if strict:
                raise RuntimeError('push RBAC lookup failed')
            return {}
        rows = resp.json()
        if not isinstance(rows, list) or (strict and len(rows) >= 1000):
            raise RuntimeError('push RBAC response invalid or incomplete')
        out = {}
        for r in rows:
            if str(r.get('scope') or 'workspace') != 'workspace':
                continue
            action = str(r.get('action') or '').strip()
            if action:
                out.setdefault(str(r.get('role_id')), set()).add(action)
        return out
    except Exception:
        if strict:
            raise
        return {}


def _resolve_batch_overrides(membership_ids, *, strict=False):
    """Overrides por membership: {membership_id: {action: 'allow'|'deny'}}.

    Falha ⇒ None (não confundir falha com ausência de override).
    """
    membership_ids = sorted({str(m) for m in (membership_ids or []) if m})
    if not membership_ids or not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return {}
    try:
        in_list = ','.join(f'"{m}"' for m in membership_ids)
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/membership_overrides'
            f'?membership_id=in.({quote(in_list)})&select=membership_id,action,effect',
            headers={
                'apikey': _SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
            },
            timeout=10,
        )
        if not resp.ok:
            if strict:
                raise RuntimeError('push RBAC lookup failed')
            return None
        rows = resp.json()
        if not isinstance(rows, list) or (strict and len(rows) >= 1000):
            raise RuntimeError('push RBAC response invalid or incomplete')
        out = {}
        for r in rows:
            if r.get('effect') in ('allow', 'deny') and r.get('action'):
                out.setdefault(str(r.get('membership_id')), {})[str(r['action'])] = r['effect']
        return out
    except Exception:
        if strict:
            raise
        return None


def _module_action_ok(u, module, min_level, rbac_members, role_actions, overrides, workspace_id=None):
    """Tem Action do módulo numa membership ativa (resolução no servidor)?

    - super admin ⇒ True (bypass preservado);
    - módulo ou nível sem critério cadastrado ⇒ False (fail-closed);
    - com workspace_id, a Action é exigida NAQUELE workspace; sem workspace_id,
      qualquer membership ativa do usuário conta.
    """
    # Alertas de chamado sem responsável são destinados a quem tem a Action
    # ticket.claim no campus, não a administradores só pelo bypass global.
    # O bypass do super admin permanece intacto nos outros canais/módulos.
    if u.get('is_super_admin') and not (module == 'chamados' and min_level == 'claim'):
        return True
    criteria = _MODULE_PUSH_ACTIONS.get(module)
    actions = (criteria or {}).get(min_level) if criteria else None
    if not actions:
        return False
    uid = str(u.get('id') or '')
    user_ws = rbac_members.get(uid) or {}
    if workspace_id:
        memberships = {}
        if workspace_id in user_ws:
            memberships[workspace_id] = user_ws[workspace_id]
    else:
        memberships = user_ws
    for mem in memberships.values():
        if not mem:
            continue
        role_id = mem.get('role_id')
        base = role_actions.get(role_id, set()) if role_id else set()
        override_map = overrides.get(mem.get('membership_id') or '', {})
        for action in actions:
            effect = override_map.get(action)
            if effect == 'deny':
                continue
            if effect == 'allow':
                return True
            if action in base:
                return True
    return False


def _target_subs(module=None, workspace_id=None, user_id=None, role=None, *, min_level=None, strict=False):
    """Filtra os subscribers pela segmentação de notificações (RBAC2).

    - módulo: destinatário precisa de membership ATIVA + Action do módulo
      (`_MODULE_PUSH_ACTIONS`), resolvidas no servidor por lote. O campo `apps`
      do snapshot NUNCA decide; módulo/nível sem critério ⇒ só super admin.
    - min_level: camada do módulo (ex.: 'full' ⇒ somente Actions operacionais).
    - workspace: super admin vê todos; demais precisam de membership ATIVA
      resolvida na hora (9.3-B). Com módulo+workspace, a Action é exigida NESSE
      workspace.
    - user_id/role: filtros operacionais preservados (destinatário direto).
    - notify_settings: mudo global e canal `push` por app são respeitados.
    """
    # O push de chamados não pode virar broadcast intercampi, inclusive
    # para super admins que não pertencem ao workspace do chamado.
    if module == 'chamados' and min_level == 'claim' and not workspace_id:
        return []
    subs = _get_subs(strict=True) if strict else _get_subs()
    if strict:
        # Subscription snapshots are not authoritative for status, admin or preferences.
        ids = sorted({str((sub.get('user') or {}).get('id') or '') for sub in subs})
        ids = [uid for uid in ids if _is_valid_uuid(uid)]
        profiles = {}
        for offset in range(0, len(ids), 100):
            batch = ids[offset:offset + 100]
            response = requests.get(
                f'{_SUPABASE_URL}/rest/v1/profiles',
                params={'id': 'in.(' + ','.join(batch) + ')', 'status': 'eq.active',
                        'select': 'id,status,is_super_admin,notify_settings'},
                headers=_supabase_headers(), timeout=6,
            )
            if not response.ok:
                raise RuntimeError('push profile lookup failed')
            rows = response.json()
            if not isinstance(rows, list):
                raise RuntimeError('invalid push profiles')
            profiles.update({str(row['id']): row for row in rows if row.get('status') == 'active'})
        subs = [{**sub, 'user': {**(sub.get('user') or {}), **profiles[str(sub['user']['id'])]}}
                for sub in subs if str((sub.get('user') or {}).get('id') or '') in profiles]
    needs_rbac = bool(module)
    if needs_rbac:
        rbac_members = _resolve_batch_rbac(subs, strict=True) if strict else _resolve_batch_rbac(subs)
        role_ids = {
            m.get('role_id') for ws in rbac_members.values()
            for m in ws.values() if m.get('role_id')
        }
        role_actions = _resolve_batch_role_permissions(role_ids, strict=True) if strict else _resolve_batch_role_permissions(role_ids)
        membership_ids = {
            m.get('membership_id') for ws in rbac_members.values()
            for m in ws.values() if m.get('membership_id')
        }
        overrides = _resolve_batch_overrides(membership_ids, strict=True) if strict else _resolve_batch_overrides(membership_ids)
        if overrides is None:
            raise RuntimeError('push membership overrides unavailable')
        member_ws = {uid: set(ws_map.keys()) for uid, ws_map in rbac_members.items()}
    elif workspace_id:
        if strict:
            member_ws = {uid: set(ws_map) for uid, ws_map in _resolve_batch_rbac(subs, strict=True).items()}
        else:
            member_ws = _resolve_batch_memberships(subs)
        rbac_members, role_actions, overrides = {}, {}, {}
    else:
        rbac_members, role_actions, overrides = {}, {}, {}
        member_ws = {}
    out = []
    for s in subs:
        u = s.get('user') or {}
        if user_id and u.get('id') != user_id:
            continue
        if role and u.get('role') != role:
            continue
        if module:
            if not _module_action_ok(u, module, min_level, rbac_members, role_actions, overrides, workspace_id):
                continue
            ns = u.get('notify_settings') or {}
            if ns.get('muted'):
                continue
            ch = (ns.get('apps') or {}).get(module)
            if ch is not None and not ch.get('push', True):
                continue
        if workspace_id:
            must_be_member = (module == 'chamados' and min_level == 'claim')
            if (must_be_member or not u.get('is_super_admin')) and workspace_id not in member_ws.get(str(u.get('id') or ''), set()):
                continue
        out.append(s)
    return out


def _supabase_headers():
    return {
        'apikey': _SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
    }


# ═════════════════════════════════════════════════════════════════════════════
# Rejeição de conta (estado terminal + ban da identidade Auth) — helpers
# COMPARTILHADAS com `api/app.py` (PR-4D-A). Vivem aqui porque `api/app.py`
# importa este módulo primeiro (linha 7); movê-las só para `api/app.py`
# criaria import circular. A semântica é idêntica ao endpoint
# POST /api/admin/users/<id>/reject (#286 PR-1, migration 074):
#   · o profile NUNCA é apagado (DELETE removido porque não revoga sessão);
#   · a identidade `auth.users` NUNCA é apagada — só desativada por ban;
#   · a transição é `pending -> rejected`, condicionada no próprio UPDATE
#     (PostgREST: id + status na mesma instrução — sem corrida);
#   · em falha do ban, a operação COMPENSA (volta o status anterior); se a
#     compensação também falha, o `rejected` permanece e o `require_auth`
#     continua negando (nada fica operacional pela metade).
# ==============================================================================

_REJECTABLE_STATUS = 'pending'
_REJECTED_STATUS = 'rejected'

# Ban de 100 anos: suficiente para impedir emissão de nova sessão e reversível
# (basta um PUT com ban_duration="none" no futuro). A garantia real de bloqueio
# é dupla: o ban no Auth E o `rejected` barrado pelo `require_auth`.
_REJECT_BAN_DURATION = '876000h'


def _auth_admin_ban(user_id, duration):
    """Desativa a identidade Auth via Admin API (PUT /auth/v1/admin/users/<id>).

    NUNCA faz DELETE: a identidade é preservada (UUID, histórico, FKs).
    """
    return requests.put(
        f'{_SUPABASE_URL}/auth/v1/admin/users/{user_id}',
        headers=_supabase_headers(),
        json={'ban_duration': duration},
        timeout=30,
    )


def _profiles_patch(user_id, payload, expected_status=None):
    """PATCH em `profiles` (service_role).

    Quando `expected_status` é informado, o filtro vai PARA A MESMA INSTRUÇÃO
    do UPDATE (PostgREST: `?id=eq.X&status=eq.<esperado>`), o que equivale a
        UPDATE public.profiles SET ... WHERE id = <id> AND status = <esperado>
    isto é, a pré-condição é garantida pelo BANCO, na escrita atômica — e não
    por uma segunda leitura em Python (que abriria corrida).

    `Prefer: return=representation` devolve as linhas EFETIVAMENTE alteradas:
    lista vazia significa que a condição não casou (outro fluxo já mudou o
    registro). O chamador DEVE interpretar a contagem, nunca só o HTTP 200.
    """
    params = {'id': f'eq.{user_id}'}
    if expected_status is not None:
        params['status'] = f'eq.{expected_status}'
    return requests.patch(
        f'{_SUPABASE_URL}/rest/v1/profiles',
        params=params,
        headers={**_supabase_headers(), 'Prefer': 'return=representation'},
        json=payload,
        timeout=30,
    )


def _log_rejection_audit(actor, target, prev_status):
    """Grava a auditoria explícita da rejeição em `app_audit_logs`.

    O gatilho `trg_app_audit_profiles` (054/065) já registra `status_changed`,
    porém com `auth.uid()` NULL quando a escrita usa `service_role` — o ator se
    perde. Aqui o ator é gravado. Mesma tabela, nenhuma infra nova.
    """
    actor_id = (actor or {}).get('id')
    workspace_id = None
    try:
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/memberships',
            params={
                'profile_id': f'eq.{target["id"]}',
                'status': 'eq.active',
                'select': 'workspace_id',
                'limit': '1',
            },
            headers=_supabase_headers(),
            timeout=15,
        )
        if resp.ok and resp.json():
            workspace_id = resp.json()[0].get('workspace_id')
    except Exception as e:  # noqa: BLE001 - auditoria nunca derruba a operação
        logger.warning("[reject] workspace_id para auditoria indisponivel: %s", e)

    payload = {
        'workspace_id': workspace_id,
        'actor_id': actor_id,
        'actor_name': (actor or {}).get('name') or (actor or {}).get('email') or '',
        'action': 'account_rejected',
        'entity': 'user',
        'entity_id': str(target.get('id') or ''),
        'entity_label': target.get('name') or target.get('email') or '',
        'meta': {
            'prev_status': prev_status,
            'new_status': _REJECTED_STATUS,
            'auth_disabled': True,
        },
    }
    try:
        resp = requests.post(
            f'{_SUPABASE_URL}/rest/v1/app_audit_logs',
            headers=_supabase_headers(),
            json=payload,
            timeout=30,
        )
        if not resp.ok:
            logger.error("[reject] falha ao gravar auditoria: %s %s",
                         resp.status_code, resp.text[:300])
            return False
        return True
    except Exception as e:  # noqa: BLE001 - auditoria nunca derruba a operação
        logger.error("[reject] excecao ao gravar auditoria: %s", e)
        return False


@app.route('/api/push/action', methods=['POST'])
@require_auth
@require_admin
def push_action():
    """Aprova ou rejeita um usuário pendente. Requer super admin.

    PR-4D-A (fechamento das escritas legadas):
      · approve → grava SOMENTE `status='active'`. NÃO escreve role/app_access
        (cargo/overrides são configurados depois via RBAC 2.0 — memberships +
        role_permissions) e NÃO cria membership.
      · reject → NÃO apaga o profile (DELETE nunca revogou a sessão Auth).
        Transição condicional `pending -> rejected` + ban da identidade Auth
        (helpers `_auth_admin_ban`/`_profiles_patch`/`_log_rejection_audit`
        compartilhadas com o endpoint /api/admin/users/<id>/reject).
    """
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return jsonify({'error': 'Supabase not configured'}), 503
    try:
        body = request.get_json() or {}
        action = body.get('action')
        user_id = body.get('userId') or ''
        if action not in ('approve', 'reject') or not user_id:
            return jsonify({'error': 'action (approve|reject) e userId são obrigatórios'}), 400

        if action == 'approve':
            payload = {
                'status': 'active',
                'updated_at': datetime.now().isoformat(),
            }
            resp = requests.patch(
                f"{_SUPABASE_URL}/rest/v1/profiles?id=eq.{quote(user_id)}",
                headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                json=payload,
                timeout=10,
            )
            if not resp.ok:
                logger.error(f"Approve profile error: {resp.status_code} {resp.text}")
                return jsonify({'error': f'Erro ao aprovar: {resp.status_code}'}), resp.status_code
            logger.info(f"Push action: approved user {user_id[:8]} (status-only)")
            return jsonify({'status': 'approved'})
        else:
            actor = g.user or {}
            # 1. Carrega o alvo (service_role, ignora RLS).
            resp = requests.get(
                f'{_SUPABASE_URL}/rest/v1/profiles',
                params={'id': f'eq.{quote(user_id)}', 'select': 'id,email,name,status'},
                headers=_supabase_headers(),
                timeout=15,
            )
            if not resp.ok:
                logger.error(f"Reject profile read error: {resp.status_code} {resp.text}")
                return jsonify({'error': 'Não foi possível ler a conta'}), 502
            rows = resp.json() or []
            if not rows:
                return jsonify({'error': 'Conta não encontrada'}), 404

            target = rows[0]
            current = target.get('status')

            # 2. Valida a transição.
            if current == _REJECTED_STATUS:
                return jsonify({'status': 'rejected', 'idempotent': True})
            if current != _REJECTABLE_STATUS:
                return jsonify({
                    'error': 'Conta não está pendente; rejeição só se aplica a contas aguardando decisão',
                    'status': current,
                }), 409

            # 3. pending -> rejected CONDICIONAL (a condição mora no UPDATE).
            upd = _profiles_patch(user_id, {
                'status': _REJECTED_STATUS,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }, expected_status=_REJECTABLE_STATUS)
            if not upd.ok:
                logger.error(f"Reject profile update error: {upd.status_code} {upd.text}")
                return jsonify({'error': 'Não foi possível rejeitar a conta'}), 502

            # 3b. HTTP 200 pode significar condição não casada (corrida).
            try:
                updated_rows = upd.json() or []
            except Exception:  # noqa: BLE001 - resposta inesperada do PostgREST
                updated_rows = []
            if not updated_rows:
                logger.warning("[reject] transicao condicional nao casou (id=%s, status lido=%s); conflito concorrente, sem ban", user_id, current)
                fresh = requests.get(
                    f'{_SUPABASE_URL}/rest/v1/profiles',
                    params={'id': f'eq.{quote(user_id)}', 'select': 'id,status'},
                    headers=_supabase_headers(),
                    timeout=15,
                )
                fresh_rows = (fresh.json() if fresh.ok else []) or []
                if not fresh_rows:
                    return jsonify({'error': 'Conta não encontrada'}), 404
                now = fresh_rows[0].get('status')
                if now == _REJECTED_STATUS:
                    return jsonify({'status': 'rejected', 'idempotent': True})
                return jsonify({
                    'error': 'Conta não está pendente; rejeição só se aplica a contas aguardando decisão',
                    'status': now,
                }), 409

            # 4. Desativa a identidade Auth (nunca apaga).
            ban = _auth_admin_ban(user_id, _REJECT_BAN_DURATION)
            if not ban.ok:
                auth_err = (ban.text or '')[:300]
                logger.error(f"Reject auth ban error: {ban.status_code} {auth_err}")
                back = _profiles_patch(user_id, {
                    'status': current,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }, expected_status=_REJECTED_STATUS)
                try:
                    back_rows = (back.json() if back.ok else []) or []
                except Exception:  # noqa: BLE001
                    back_rows = []
                if back.ok and back_rows:
                    return jsonify({
                        'error': 'Não foi possível desativar a identidade da conta',
                        'auth_disabled': False,
                        'rolled_back': True,
                    }), 502
                # Compensação falhou: fail-closed. O profile segue `rejected` e o
                # require_auth já o nega — a conta NÃO fica operacional no LabHub.
                return jsonify({
                    'error': 'Rejeição aplicada, mas a identidade não pôde ser desativada nem revertida; conta não tem acesso ao LabHub',
                    'auth_disabled': False,
                    'rolled_back': False,
                }), 502

            # 5. Auditoria (não derruba a operação; o estado já está correto).
            _log_rejection_audit(actor, target, current)
            return jsonify({'status': 'rejected', 'auth_disabled': True})
    except Exception as e:
        logger.error("Push action error: %s", e)
        return jsonify({'error': 'Erro ao processar ação de usuário'}), 500


@app.route('/api/push/check', methods=['GET'])
@require_cron
def push_check():
    """Check de reservas próximas (janela configurável, default 30 min). Protegido por CRON_SECRET."""
    result = _internal_push_check()
    if isinstance(result, dict) and 'error' in result:
        return jsonify(result), 500
    return jsonify(result)


# ── Configuração da janela/dedup do push (env, com defaults históricos) ──
# PUSH_ADVANCE_MINUTES: aviso antecedido de reserva (minutos antes do início; default 30)
# PUSH_DEDUP_SECONDS:   TTL das marcas individuais `push:sent:{evento}:{destinatário}...`
def _push_advance_minutes() -> int:
    try:
        return max(1, int(os.environ.get('PUSH_ADVANCE_MINUTES', '30')))
    except (TypeError, ValueError):
        return 30


def _push_dedup_seconds() -> int:
    try:
        return max(60, int(os.environ.get('PUSH_DEDUP_SECONDS', '7200')))
    except (TypeError, ValueError):
        return 7200


def _workspaces_with_spreadsheet():
    """Workspaces com planilha própria configurada (id, slug, spreadsheet_url).

    Usado para direcionar o alerta de reserva de lab apenas aos assinantes do
    campus. Retorna [] se o Supabase não estiver configurado ou a consulta
    falhar — nesse caso o check usa o fallback legado da planilha global.
    """
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return []
    try:
        headers = {'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}'}
        url = (
            f"{_SUPABASE_URL}/rest/v1/workspaces"
            f"?select=id,slug,spreadsheet_url"
            f"&spreadsheet_url=not.is.null"
        )
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.ok and isinstance(resp.json(), list):
            return [
                {'id': w.get('id'), 'slug': w.get('slug'), 'spreadsheet_url': w.get('spreadsheet_url')}
                for w in resp.json()
                if w.get('id') and w.get('slug') and w.get('spreadsheet_url')
            ]
    except Exception as e:
        logger.error("Erro ao listar workspaces com planilha: %s", e)
    return []


def _internal_push_check(*, strict_scope=False):
    """Core logic for push check — reservas + tablets. Returns dict."""
    if not _push_store_ready():
        return {'error': 'Push store not configured'}
    try:
        today = get_today_sp()
        window_start = get_now_sp()
        window_end = window_start + timedelta(minutes=_push_advance_minutes())

        # Reserva de lab: a planilha é POR CAMPUS. Quando há workspaces com
        # planilha própria, agrega as reservas de hoje de cada campus. O
        # targeting de Push é resolvido pelo worker no momento da entrega.
        # Sem nenhum workspace
        # configurado, mantém o fallback legado da planilha global.
        reservas_hoje = []
        errors = 0
        _lab_workspaces = _workspaces_with_spreadsheet()
        if _lab_workspaces:
            def read_campus(_ws):
                _lab_count = _get_workspace_lab_count(_ws['slug'])
                if strict_scope:
                    current, upcoming = _parse_spreadsheet(_ws['spreadsheet_url'], lab_count=_lab_count, strict=True)
                    if window_end.date() != today:
                        current = [*current, *upcoming]
                else:
                    current, _ = get_reservas(_ws['slug'], spreadsheet_url=_ws['spreadsheet_url'], lab_count=_lab_count)
                return [{**r, '_scope': _ws['id']} for r in current]

            if strict_scope:
                # Independent source reads, bounded concurrency; do not let a
                # single slow campus serialize all other campus downloads.
                from concurrent.futures import ThreadPoolExecutor, as_completed
                with ThreadPoolExecutor(max_workers=3) as pool:
                    futures = {pool.submit(read_campus, ws): ws for ws in _lab_workspaces}
                    for future in as_completed(futures):
                        try:
                            reservas_hoje.extend(future.result())
                        except Exception as exc:
                            errors += 1
                            logger.warning("Push check: campus source failed: %s", type(exc).__name__)
            else:
                for ws in _lab_workspaces:
                    try:
                        reservas_hoje.extend(read_campus(ws))
                    except Exception as exc:
                        errors += 1
                        logger.warning("Push check: campus source failed: %s", type(exc).__name__)
        elif not strict_scope:
            reservas_hoje, _ = get_reservas()
        else:
            # A global fallback could disclose campus-specific reservation data.
            errors += 1

        agora = get_now_sp()
        agora_min = agora.hour * 60 + agora.minute
        limite_min = agora_min + _push_advance_minutes()

        sent = 0
        queued = 0
        
        for r in reservas_hoje:
            data_reserva = r.get('data')
            if isinstance(data_reserva, str):
                try:
                    data_reserva = datetime.strptime(data_reserva, '%d/%m/%Y').date()
                except:
                    continue
            if isinstance(data_reserva, datetime):
                data_reserva = data_reserva.date()
            if not isinstance(data_reserva, date):
                continue
            if not strict_scope and data_reserva != today:
                continue
            
            inicio = parse_horario_inicio(r.get('horario', ''))
            if inicio is None:
                continue
            
            reservation_start = datetime.combine(data_reserva, datetime.min.time(), tzinfo=ZoneInfo('America/Sao_Paulo')) + timedelta(minutes=inicio)
            eligible = (window_start < reservation_start <= window_end) if strict_scope else (agora_min <= inicio <= limite_min)
            if eligible:
                if strict_scope and not r.get('_scope'):
                    errors += 1
                    continue
                expires_at = reservation_start.isoformat()
                reserva_data_key = (
                    data_reserva.isoformat() if hasattr(data_reserva, 'isoformat')
                    else str(data_reserva)
                )
                notify_id = hashlib.md5(
                    f"{r.get('_scope') or ''}|{reserva_data_key}|{r['lab']}|"
                    f"{r['horario']}|{r.get('responsavel','')}".encode()
                ).hexdigest()

                if strict_scope:
                    reservation_id = r.get('reservation_id')
                    if not reservation_id:
                        errors += 1
                        continue
                    notify_id = hashlib.md5(f"lab-reserva|{r['_scope']}|{reservation_id}".encode()).hexdigest()
                title = f"{' '.join(r.get('labs', [r.get('lab', 'Lab')]))}"
                alunos = r.get('alunos', '')
                evento = str(r.get('observacao') or '').strip()
                body = f"{r['horario']} — {r.get('responsavel', 'Professor') or 'Sem professor'}"
                if evento:
                    body += f" — {evento}"
                if alunos:
                    body += f" — {alunos} alunos"
                
                queue_status = _queue_push_event(
                    notify_id, title, body, module='reservalab',
                    workspace_id=r.get('_scope') or None, min_level='full',
                    ttl=_push_dedup_seconds(), context='lab-reserva',
                    **({'expires_at': expires_at, 'reservation_id': reservation_id, 'persist_inapp': True} if strict_scope else {}),
                )
                if queue_status == 'queued':
                    queued += 1
                elif queue_status is None and strict_scope:
                    errors += 1
                elif queue_status is None:
                    accepted, rejected, unknown, skipped, dedup_failed = _push_notify_subs_dedup(
                        _target_subs(
                            module='reservalab',
                            workspace_id=r.get('_scope') or None,
                            min_level='full',
                        ), notify_id, _push_dedup_seconds(), title, body,
                        workspace_id=r.get('_scope') or None, context='lab-reserva',
                    )
                    sent += accepted
                    if rejected or unknown or skipped or dedup_failed:
                        logger.info(
                            "Push legado não confirmado para %s: rejected=%s unknown=%s skipped=%s "
                            "dedup_failed=%s", title, rejected, unknown, skipped, dedup_failed,
                        )
        
        # ─── Push para reservas de tablets ──────────────────────────
        supabase_url = os.environ.get('SUPABASE_URL', '')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
        if supabase_url and supabase_key:
            try:
                today_str = today.strftime('%Y-%m-%d')
                tomorrow_str = (today + timedelta(days=1)).strftime('%Y-%m-%d')
                if strict_scope:
                    from_ts = window_start.isoformat()
                    to_ts = window_end.isoformat()
                else:
                    from_ts, to_ts = today_str + 'T00:00:00Z', tomorrow_str + 'T00:00:00Z'
                tablet_url = (
                    f"{supabase_url}/rest/v1/tablet_reservations"
                    f"?select=*&order=horario_inicio.asc"
                    f"&status=eq.{quote('ativa')}"
                    f"&horario_inicio=gte.{quote(from_ts)}"
                    f"&horario_inicio={'lte' if strict_scope else 'lt'}.{quote(to_ts)}"
                )
                tablet_resp = requests.get(
                    tablet_url,
                    headers={
                        'apikey': supabase_key,
                        'Authorization': f'Bearer {supabase_key}',
                    },
                    timeout=10
                )
                if tablet_resp.ok:
                    tablets_hoje = tablet_resp.json()
                    agora = get_now_sp()
                    agora_min = agora.hour * 60 + agora.minute
                    limite_min = agora_min + _push_advance_minutes()
                    
                    for t in tablets_hoje:
                        inicio_str = t.get('horario_inicio', '')
                        if not inicio_str:
                            continue
                        try:
                            dt = datetime.fromisoformat(inicio_str.replace('Z', '+00:00'))
                            dt_sp = dt.astimezone(ZoneInfo('America/Sao_Paulo'))
                            inicio_min = dt_sp.hour * 60 + dt_sp.minute
                        except:
                            continue
                        
                        eligible = (window_start < dt_sp <= window_end) if strict_scope else (dt_sp.date() == today and agora_min <= inicio_min <= limite_min)
                        if eligible:
                            key = f"tablet|{t['id']}"
                            if strict_scope:
                                # A genuinely rescheduled reservation is a new reminder.
                                key += f"|{dt_sp.isoformat()}"
                            notify_id = hashlib.md5(key.encode()).hexdigest()

                            title = f"Tablets — {t.get('sala', 'Sala')}"
                            evento = str(t.get('finalidade') or '').strip()
                            body = f"{t.get('professor', 'Professor')}"
                            if evento:
                                body += f" — {evento}"
                            body += f" — {t.get('quantidade_tablets', '?')} tablets"
                            
                            # Alerta do campus → só quem tem acesso àquele workspace
                            # (super admin vê todos; reserva sem workspace vai para todos).
                            # Só nível 'full' do reservalab recebe push de reserva.
                            ws_id = t.get('workspace_id')
                            if strict_scope and not ws_id:
                                errors += 1
                                continue
                            queue_status = _queue_push_event(
                                notify_id, title, body, module='reservalab',
                                workspace_id=ws_id, min_level='full', ttl=_push_dedup_seconds(),
                                context='tablet',
                                **({'expires_at': dt_sp.isoformat(), 'reservation_id': t['id'], 'persist_inapp': True} if strict_scope else {}),
                            )
                            if queue_status == 'queued':
                                queued += 1
                            elif queue_status is None and strict_scope:
                                errors += 1
                            elif queue_status is None:
                                target = _target_subs(
                                    module='reservalab', workspace_id=ws_id, min_level='full',
                                ) if ws_id else _target_subs(module='reservalab', min_level='full')
                                accepted, rejected, unknown, skipped, dedup_failed = _push_notify_subs_dedup(
                                    target, notify_id, _push_dedup_seconds(), title, body,
                                    workspace_id=ws_id, context='tablet',
                                )
                                sent += accepted
                                if rejected or unknown or skipped or dedup_failed:
                                    logger.info(
                                        "Push de tablet legado não confirmado: rejected=%s unknown=%s "
                                        "skipped=%s dedup_failed=%s",
                                        rejected, unknown, skipped, dedup_failed,
                                    )
                elif strict_scope:
                    errors += 1
            except Exception as e:
                errors += 1
                logger.error(f"Tablet push check error: {e}")
        elif strict_scope:
            errors += 1
        
        result = {'checked': True, 'queued': queued, 'sent': sent}
        if strict_scope and errors:
            result.update(error='reservation checks incomplete', failures=errors)
        return result
    except Exception as e:
        logger.error("Push check error: %s", e)
        return {'error': 'Erro ao verificar push'}

# ─── Notificações de Empréstimos (Stock) ─────────────────────────

def _get_subs(*, strict=False):
    """Lista as inscrições ativas. Falha de leitura não derruba o chamador."""
    try:
        raw = _active_push_store().push_subs_list()
    except Exception as e:
        logger.warning("[push] falha ao listar inscrições do store: %s", e)
        if strict:
            raise RuntimeError("push subscriptions unavailable") from e
        return []
    subs = []
    for item in raw:
        if isinstance(item, str):
            try:
                subs.append(json.loads(item))
            except (TypeError, ValueError):
                # Registro legado/corrompido não pode derrubar o lote inteiro.
                logger.warning("[push] inscrição com payload inválido ignorada")
                continue
        else:
            subs.append(item)
    return subs


@app.route('/api/push/admin/subscriptions', methods=['GET'])
@require_auth
@require_admin
def push_admin_subscriptions():
    """Auditoria das inscrições push por usuário/workspace (super admin).

    Devolve todas as inscrições com o payload de segmentação que o backend
    usa ao filtrar envios (_target_subs): apps, workspace_ids, notify_settings
    e o workspace do dispositivo. Sem dispositivo nunca é exposto o endpoint
    bruto (chaves de criptografia ficam no registro, não na resposta).
    """
    if not _push_store_ready():
        return jsonify({'error': 'Push store not configured'}), 500
    try:
        user_filter = (request.args.get('user_id') or '').strip()
        ws_filter = (request.args.get('workspace_id') or '').strip()

        subs = _get_subs()
        # Diagnóstico fiel ao envio: workspaces resolvidos na hora (9.3-B),
        # não o que foi gravado na inscrição.
        member_ws = _resolve_batch_memberships(subs)
        out = []
        for s in subs:
            u = s.get('user') or {}
            uid = u.get('id') or ''
            if user_filter and uid != user_filter:
                continue
            ws_ids = sorted(member_ws.get(uid, set()))
            if ws_filter and not u.get('is_super_admin') and ws_filter not in ws_ids:
                continue
            out.append({
                'key': s.get('key', ''),
                'user_id': uid,
                'name': u.get('name') or '',
                'role': u.get('role') or '',
                'is_super_admin': bool(u.get('is_super_admin')),
                'workspace_ids': ws_ids,
                'apps': u.get('apps') or {},
                'notify_settings': u.get('notify_settings') or {},
                'expirationTime': s.get('expirationTime'),
            })
        out.sort(key=lambda r: (str(r.get('name') or '').lower(), str(r.get('key') or '')))
        return jsonify({'total': len(out), 'subscriptions': out})
    except Exception as e:
        logger.error("Push admin subscriptions error: %s", e)
        return jsonify({'error': 'Erro ao listar inscrições de push'}), 500


def _get_key(obj, *keys):
    """Busca valor em dict ignorando casing das chaves (PostgREST varia conforme o schema)."""
    if not isinstance(obj, dict):
        return None
    for k in keys:
        if k in obj:
            return obj.get(k)
    lower = {str(k).lower(): v for k, v in obj.items()}
    for k in keys:
        if k.lower() in lower:
            return lower[k.lower()]
    return None


def _enqueue_stock_movement_notice(expected_type):
    """Use the committed stock movement, never client-provided names or module."""
    body = request.get_json(silent=True) or {}
    if body.get('module') not in (None, 'stock'):
        return jsonify({'error': 'Invalid module'}), 400
    try:
        movement_id = str(uuid.UUID(str(body.get('movement_id') or '')))
        workspace_id = str(uuid.UUID(str(g.workspace_id)))
    except (ValueError, TypeError, AttributeError):
        return jsonify({'error': 'Movement ID required'}), 400
    try:
        response = requests.get(
            f'{_SUPABASE_URL}/rest/v1/stock_movements',
            params={'id': f'eq.{movement_id}', 'workspace_id': f'eq.{workspace_id}',
                    'type': f'eq.{expected_type}', 'deletedAt': 'is.null',
                    'select': 'id,itemName,borrowedBy,expectedReturnAt,performedBy,workspace_id,type'},
            headers={**_supabase_headers(), 'Accept-Profile': 'stock'}, timeout=8,
        )
        if not response.ok:
            return jsonify({'error': 'Stock movement lookup failed'}), 503
        rows = response.json()
        if not isinstance(rows, list):
            return jsonify({'error': 'Invalid stock movement response'}), 503
        if not rows:
            return jsonify({'error': 'Movement not found in workspace'}), 404
        row = rows[0]
        if str(row.get('workspace_id')) != workspace_id or row.get('type') != expected_type:
            return jsonify({'error': 'Movement not found in workspace'}), 404
        item = row.get('itemName') or 'Item'
        if expected_type == 'emprestimo':
            title = f'Empréstimo: {item}'
            message = f"Emprestado para {row.get('borrowedBy') or 'Responsável'}"
            if row.get('expectedReturnAt'):
                message += f" — Devolução até {str(row['expectedReturnAt'])[:10]}"
        else:
            title = f'Devolução: {item}'
            message = f"Devolvido por {row.get('performedBy') or 'Responsável'}"
        event_id = f'stock:movement:{movement_id}:{expected_type}'
        status = _queue_push_event(event_id, title, message, module='stock',
                                   workspace_id=workspace_id, context='stock-movement',
                                   url='/stock/loans')
        if status not in ('queued', 'duplicate'):
            return jsonify({'error': 'Could not persist stock notification'}), 503
        return jsonify({'status': status, 'event_id': event_id}), 202
    except Exception as exc:
        logger.warning('[notifications] stock movement notice failed: %s', type(exc).__name__)
        return jsonify({'error': 'Could not process stock notification'}), 503


@app.route('/api/push/notify-loan', methods=['POST'])
@require_auth
@require_workspace
@require_module_auth('stock')
@require_action_rbac('stock.movement.create', scope='workspace')
def push_notify_loan():
    return _enqueue_stock_movement_notice('emprestimo')


@app.route('/api/push/notify-return', methods=['POST'])
@require_auth
@require_workspace
@require_module_auth('stock')
@require_action_rbac('stock.movement.create', scope='workspace')
def push_notify_return():
    return _enqueue_stock_movement_notice('devolucao')


@app.route('/api/push/check-overdue', methods=['GET'])
@require_cron
def push_check_overdue():
    """Check de empréstimos com prazo próximo (12 h). Protegido por CRON_SECRET."""
    result = _internal_push_check_overdue()
    if isinstance(result, dict) and 'error' in result:
        return jsonify(result), 500
    return jsonify(result)


def _internal_push_check_overdue():
    """Core logic for overdue loan check. Returns dict."""
    if not _push_store_ready():
        return {'error': 'Push store not configured'}
    try:
        supabase_url = os.environ.get('SUPABASE_URL', '')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
        if not supabase_url or not supabase_key:
            return {'error': 'Supabase not configured'}

        _ensure_stock_schema(supabase_url, supabase_key)

        agora = get_now_sp()
        limite_12h = agora + timedelta(hours=12)

        headers = {'apikey': supabase_key, 'Authorization': f'Bearer {supabase_key}'}

        url = (
            f"{supabase_url}/rest/v1/stock_movements"
            f"?select=*"
            f"&type=eq.{quote('emprestimo')}"
            f"&returnedat=is.null"
        )
        headers2 = {**headers, 'Accept-Profile': 'stock'}
        resp = requests.get(url, headers=headers2, timeout=10)
        if not resp.ok:
            logger.error(f"check-overdue Supabase error: {resp.status_code} url={url} body={resp.text[:500]}")
            return {'error': 'Supabase query failed'}

        all_loans = resp.json()
        sent = 0
        queued = 0
        found = 0

        for loan in all_loans:
            expected_raw = loan.get('expectedreturnat')
            if not expected_raw:
                continue
            try:
                if 'T' in expected_raw:
                    dt = datetime.fromisoformat(expected_raw.replace('Z', '+00:00'))
                else:
                    dt = datetime.strptime(expected_raw[:10], '%Y-%m-%d').replace(hour=23, minute=59)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=ZoneInfo('America/Sao_Paulo'))
                else:
                    dt = dt.astimezone(ZoneInfo('America/Sao_Paulo'))
            except Exception:
                continue

            if not (agora <= dt <= limite_12h):
                continue

            found += 1
            overdue_bucket = int(agora.timestamp() // 43200)
            nid = hashlib.md5(
                f"overdue|{loan['id']}|{overdue_bucket}".encode()
            ).hexdigest()

            item_name = loan.get('itemname', 'Item')
            borrowed_by = loan.get('borrowedby', 'Alguém')

            title = f"⏰ Prazo de devolução: {item_name}"
            msg = f"Emprestado para {borrowed_by} — Vence {expected_raw[:10]}"
            queue_status = _queue_push_event(
                nid, title, msg, module='stock', ttl=43200,
                url=f"/stock/loans", context='overdue',
            )
            if queue_status == 'queued':
                queued += 1
            elif queue_status is None:
                subs = _target_subs(module='stock')
                accepted, rejected, unknown, skipped, dedup_failed = _push_notify_subs_dedup(
                    subs, nid, 43200, title, msg, context='overdue',
                )
                sent += accepted
                if rejected or unknown or skipped or dedup_failed:
                    logger.info(
                        "Overdue notify legado não confirmado: %s rejected=%s unknown=%s skipped=%s "
                        "dedup_failed=%s",
                        item_name, rejected, unknown, skipped, dedup_failed,
                    )

        return {'checked': True, 'queued': queued, 'sent': sent, 'found': found}
    except Exception as e:
        logger.error("check-overdue error: %s", e)
        return {'error': 'Erro ao verificar itens em atraso'}


@app.route('/api/push/check-pcare', methods=['GET'])
@require_cron
def push_check_pcare():
    """Check de estoque baixo de peças e manutenções agendadas. Protegido por CRON_SECRET."""
    result = _internal_push_check_pcare()
    if isinstance(result, dict) and 'error' in result:
        return jsonify(result), 500
    return jsonify(result)


def _internal_push_check_pcare():
    """Core logic for pcare low stock + maintenance check. Returns dict."""
    if not _push_store_ready():
        return {'error': 'Push store not configured'}
    try:
        supabase_url = os.environ.get('SUPABASE_URL', '')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
        if not supabase_url or not supabase_key:
            return {'error': 'Supabase not configured'}

        _ensure_stock_schema(supabase_url, supabase_key)

        agora = get_now_sp()
        hoje_str = agora.strftime('%Y-%m-%d')
        amanha_str = (agora + timedelta(days=1)).strftime('%Y-%m-%d')

        base_headers = {'apikey': supabase_key, 'Authorization': f'Bearer {supabase_key}'}
        sent = 0
        queued = 0

        # ── Estoque baixo de peças ──
        parts_headers = {**base_headers, 'Accept-Profile': 'pcare'}
        try:
            pr = requests.get(
                f"{supabase_url}/rest/v1/parts?select=*",
                headers=parts_headers, timeout=10
            )
            if pr.ok:
                for part in pr.json():
                    qty = part.get('quantity', 0)
                    min_qty = part.get('minquantity', 0)
                    if qty < min_qty:
                        nid = hashlib.md5(
                            f"pcare|part|{part['id']}|{hoje_str}".encode()
                        ).hexdigest()
                        title = f"🔧 Estoque baixo: {part.get('name', 'Peça')}"
                        msg = f"Quantidade: {qty} | Mínimo: {min_qty}"
                        queue_status = _queue_push_event(
                            nid, title, msg, module='pc-care', ttl=86400,
                            context='pcare-part',
                        )
                        if queue_status == 'queued':
                            queued += 1
                        elif queue_status is None:
                            subs = _target_subs(module='pc-care')
                            accepted, rejected, unknown, skipped, dedup_failed = _push_notify_subs_dedup(
                                subs, nid, 86400, title, msg, context='pcare-part',
                            )
                            sent += accepted
                            if rejected or unknown or skipped or dedup_failed:
                                logger.info(
                                    "Low stock legado não confirmado: %s rejected=%s unknown=%s "
                                    "skipped=%s dedup_failed=%s",
                                    part.get('name'), rejected, unknown, skipped, dedup_failed,
                                )
        except Exception as e:
            logger.error(f"check-pcare parts error: {e}")

        # ── Manutenções agendadas ──
        try:
            mr = requests.get(
                f"{supabase_url}/rest/v1/maintenance"
                f"?select=*"
                f"&completed=eq.false"
                f"&scheduleddate=gte.{quote(hoje_str)}"
                f"&scheduleddate=lte.{quote(amanha_str)}",
                headers=parts_headers, timeout=10
            )
            if mr.ok:
                for m in mr.json():
                    nid = hashlib.md5(
                        f"pcare|maint|{m['id']}|{str(m.get('scheduleddate') or '')[:10]}".encode()
                    ).hexdigest()
                    title = f"🔧 Manutenção: {m.get('pcnumber', 'PC')}"
                    msg = f"{m.get('labname', 'Lab')} — {m.get('type', '')} — {m.get('scheduleddate', '')[:10]}"
                    queue_status = _queue_push_event(
                        nid, title, msg, module='pc-care', ttl=86400,
                        context='pcare-maint',
                    )
                    if queue_status == 'queued':
                        queued += 1
                    elif queue_status is None:
                        subs = _target_subs(module='pc-care')
                        accepted, rejected, unknown, skipped, dedup_failed = _push_notify_subs_dedup(
                            subs, nid, 86400, title, msg, context='pcare-maint',
                        )
                        sent += accepted
                        if rejected or unknown or skipped or dedup_failed:
                            logger.info(
                                "Maintenance legado não confirmado: %s rejected=%s unknown=%s "
                                "skipped=%s dedup_failed=%s",
                                m.get('pcnumber'), rejected, unknown, skipped, dedup_failed,
                            )
        except Exception as e:
            logger.error(f"check-pcare maintenance error: {e}")

        return {'checked': True, 'queued': queued, 'sent': sent}
    except Exception as e:
        logger.error("check-pcare error: %s", e)
        return {'error': 'Erro ao verificar manutenções do PC Care'}


def _check_pending_users(*, require_outbox=False):
    """Push para admins quando existem usuários aguardando aprovação."""
    if not _push_store_ready():
        return {'error': 'Push store not configured'}
    supabase_url = os.environ.get('SUPABASE_URL', '')
    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not supabase_url or not supabase_key:
        return {'error': 'Supabase not configured'}
    try:
        headers = {'apikey': supabase_key, 'Authorization': f'Bearer {supabase_key}'}
        url = f"{supabase_url}/rest/v1/profiles?select=id,email,name,created_at&status=eq.{quote('pending')}"
        resp = requests.get(url, headers=headers, timeout=10)
        if not resp.ok:
            logger.error(f"check-pending error: {resp.status_code} {resp.text[:300]}")
            return {'error': f'Supabase query failed: {resp.status_code}'}

        pending = resp.json() or []
        # RBAC2: aprovação de pendentes é privilégio de plataforma
        # (`admin.user.approve`/`reject` são scope global ⇒ somente super admin).
        # Módulo 'auth' não tem Actions de workspace ⇒ fail-closed: só super
        # admin é destinatário (sem dependência do snapshot `profile.role`).
        sent = 0
        queued = 0
        errors = 0
        for u in pending:
            pending_week = get_today_sp().toordinal() // 7
            nid = hashlib.md5(
                f"pending|{u.get('id')}|{pending_week}".encode()
            ).hexdigest()
            nome = u.get('name') or u.get('email') or 'Usuário'
            title = 'Novo usuário pendente'
            body = f"{nome} ({u.get('email') or ''}) aguarda aprovação"
            # PR-4D-A (Option B): notificação INFORMATIVA. Sem botões
            # approve/reject — um Service Worker não consegue autenticar com
            # segurança uma ação crítica em segundo plano (o POST ficaria
            # também sem Authorization => 401). O click abre a fila de
            # pendentes: /admin/users?pending=<id> (AdminGuard + RLS).
            if require_outbox:
                # Persist both channels atomically. Stable weekly ID prevents
                # duplicate bell entries and duplicate outbox events on retries.
                if not pg_store.is_configured():
                    errors += 1
                    continue
                notification = {
                    'id': 'pending:' + nid,
                    'title': title, 'body': body,
                    'type': 'approval', 'severity': 'warning',
                    'module': 'auth', 'audience': 'role',
                    'target_super_admin': True,
                    'action_url': f"/admin/users?pending={u.get('id')}",
                }
                payload = {
                    'title': title, 'body': body,
                    'module': 'auth', 'target_super_admin': True,
                    'context': 'pending-user', 'ttl': 604800,
                    'action_url': notification['action_url'],
                }
                try:
                    if pg_store.store.notification_create_with_outbox(notification, payload):
                        queued += 1
                except Exception as exc:
                    logger.warning('[notifications] approval atomic persistence failed: %s', type(exc).__name__)
                    errors += 1
                continue

            queue_status = _queue_push_event(
                nid, title, body, module='auth', target_super_admin=True,
                ttl=604800, url=f"/admin/users?pending={u.get('id')}",
                context='pending-user',
            )
            if queue_status == 'queued':
                queued += 1
            elif queue_status is None:
                subs = _target_subs(module='auth')
                accepted, rejected, unknown, skipped, dedup_failed = _push_notify_subs_dedup(
                    subs, nid, 604800, title, body,
                    url=f"/admin/users?pending={u.get('id')}", context='pending-user',
                )
                sent += accepted
                if rejected or unknown or skipped or dedup_failed:
                    logger.info(
                        "Pending user notify legado não confirmado: %s rejected=%s unknown=%s "
                        "skipped=%s dedup_failed=%s",
                        (u.get('id') or '')[:8], rejected, unknown, skipped, dedup_failed,
                    )
        result = {'checked': True, 'found': len(pending), 'queued': queued, 'sent': sent}
        if errors:
            result.update(error='approval enqueue failed', failures=errors)
        return result
    except Exception as e:
        logger.error("check-pending error: %s", e)
        return {'error': 'Erro ao verificar usuários pendentes'}


def _check_stock_expiry():
    """Push para itens de stock vencidos ou com validade próxima (janela de 30 dias)."""
    if not _push_store_ready():
        return {'error': 'Push store not configured'}
    supabase_url = os.environ.get('SUPABASE_URL', '')
    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not supabase_url or not supabase_key:
        return {'error': 'Supabase not configured'}
    try:
        _ensure_stock_schema(supabase_url, supabase_key)

        headers = {
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
            'Accept-Profile': 'stock',
        }
        resp = requests.get(f"{supabase_url}/rest/v1/stock_items?select=*", headers=headers, timeout=10)
        if not resp.ok:
            logger.error(f"check-expiry error: {resp.status_code} {resp.text[:300]}")
            return {'error': f'Supabase query failed: {resp.status_code}'}

        items = resp.json() or []
        hoje = get_today_sp()
        sent = 0
        queued = 0
        for item in items:
            status = str(_get_key(item, 'status') or '').lower()
            if status == 'descartado':
                continue
            expires_raw = _get_key(item, 'expiresAt', 'expires_at')
            if not expires_raw:
                continue
            try:
                venc = datetime.strptime(str(expires_raw)[:10], '%Y-%m-%d').date()
            except Exception:
                continue
            dias = (venc - hoje).days
            if dias > 30:
                continue

            nid = hashlib.md5(
                f"expiry|{item.get('id')}|{hoje.isoformat()}".encode()
            ).hexdigest()

            nome = item.get('name') or 'Item'
            if dias < 0:
                title = 'Item vencido'
                msg = f"{nome} venceu em {venc.strftime('%d/%m/%Y')}"
            elif dias == 0:
                title = 'Validade próxima'
                msg = f"{nome} vence hoje"
            else:
                title = 'Validade próxima'
                msg = f"{nome} vence em {dias} {'dia' if dias == 1 else 'dias'} ({venc.strftime('%d/%m/%Y')})"

            ws = _get_key(item, 'workspace_id', 'workspaceId')
            queue_status = _queue_push_event(
                nid, title, msg, module='stock', workspace_id=ws,
                ttl=86400, url=f"/stock/items/{item.get('id')}",
                context='stock-expiry',
            )
            if queue_status == 'queued':
                queued += 1
            elif queue_status is None:
                subs = _target_subs(module='stock', workspace_id=ws)
                accepted, rejected, unknown, skipped, dedup_failed = _push_notify_subs_dedup(
                    subs, nid, 86400, title, msg,
                    url=f"/stock/items/{item.get('id')}",
                    workspace_id=ws, context='stock-expiry',
                )
                sent += accepted
                if rejected or unknown or skipped or dedup_failed:
                    logger.info(
                        "Stock expiry legado não confirmado: %s rejected=%s unknown=%s "
                        "skipped=%s dedup_failed=%s",
                        nome, rejected, unknown, skipped, dedup_failed,
                    )
        return {'checked': True, 'queued': queued, 'sent': sent}
    except Exception as e:
        logger.error("check-expiry error: %s", e)
        return {'error': 'Erro ao verificar validade de itens'}


@app.route('/api/push/tablets/cleanup', methods=['GET'])
@require_cron
def push_tablets_cleanup():
    """Remove reservas de tablets canceladas há mais de 1 mês (retention).

    Histórico: o frontend tinha `cleanupOldCancelledTablets()` (7 dias) montado
    nas páginas, mas foi removido dos mounts (bde8221) — as linhas canceladas
    passaram a se acumular no banco. A limpeza agora é responsabilidade do
    backend, com janela de retenção de 1 mês (PUSH_TABLET_RETENTION_DAYS).
    Protegido por CRON_SECRET e registrado no check-all.
    """
    result = _internal_tablets_cleanup()
    if isinstance(result, dict) and 'error' in result:
        return jsonify(result), 500
    return jsonify(result)


def _tablet_retention_days() -> int:
    """Retenção de reservas canceladas (dias). Default: 30 (1 mês)."""
    try:
        return max(1, int(os.environ.get('PUSH_TABLET_RETENTION_DAYS', '30')))
    except (TypeError, ValueError):
        return 30


def _internal_tablets_cleanup():
    """DELETE de tablet_reservations canceladas + 1 mês. Nunca levanta."""
    supabase_url = os.environ.get('SUPABASE_URL', '')
    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not (supabase_url and supabase_key):
        return {'checked': False, 'skipped': 'Supabase not configured'}
    try:
        agora_iso = get_now_sp().isoformat()
        headers_cron = {
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
        }
        # Backfill defensivo: canceladas sem cancelled_at (pré-051 ou cliente
        # sem carimbo) recebem now() como melhor aproximação — a retenção
        # passa a contar a partir daqui em vez de nunca se aplicar.
        stamped = 0
        try:
            resp_bf = requests.patch(
                f'{supabase_url}/rest/v1/tablet_reservations'
                f'?status=eq.{quote("cancelada")}&cancelled_at=is.null',
                headers={**headers_cron, 'Prefer': 'return=representation'},
                json={'cancelled_at': agora_iso},
                timeout=15,
            )
            if resp_bf.ok:
                stamped = len(resp_bf.json() or [])
                if stamped:
                    logger.info(f"Tablet cleanup backfill: {stamped} canceladas sem cancelled_at carimbadas com now()")
            else:
                logger.warning("Tablet cleanup backfill falhou (%s)", resp_bf.status_code)
        except Exception as e:
            logger.warning("Tablet cleanup backfill error: %s", e)

        cutoff = (get_now_sp() - timedelta(days=_tablet_retention_days())).isoformat()
        resp = requests.delete(
            f'{supabase_url}/rest/v1/tablet_reservations'
            f'?status=eq.{quote("cancelada")}&cancelled_at=lt.{quote(cutoff)}',
            headers={
                **headers_cron,
                'Prefer': 'return=representation',
                'Range': '0-499',
            },
            timeout=15,
        )
        if not resp.ok:
            return {'error': f'Erro ao limpar reservas canceladas ({resp.status_code})'}
        removed = len(resp.json() or [])
        if removed:
            logger.info(f"Tablet cleanup: {removed} reservas canceladas há mais de {_tablet_retention_days()}d removidas")
        return {'checked': True, 'removed': removed, 'stamped': stamped, 'retention_days': _tablet_retention_days()}
    except Exception as e:
        logger.error("tablets cleanup error: %s", e)
        return {'error': 'Erro ao limpar reservas canceladas'}


@app.route('/api/push/check-all', methods=['GET'])
@require_cron
def push_check_all():
    """Roda todos os checks de cron em uma única chamada (cron-jobs.org / Vercel Cron).

    Protegido por CRON_SECRET: o Vercel envia automaticamente o header
    `Authorization: Bearer ${CRON_SECRET}` nas invocações do cron.
    """

    results = {}
    for name, fn in [
        ('reservas', _internal_push_check),
        ('overdue', _internal_push_check_overdue),
        ('pcare', _internal_push_check_pcare),
        ('pendentes', _check_pending_users),
        ('validade', _check_stock_expiry),
        ('tablets_cleanup', _internal_tablets_cleanup),
    ]:
        try:
            out = fn()
            results[name] = out
        except Exception as e:
            logger.error("check-all: %s error: %s", name, e)
            results[name] = {'error': 'Erro na execução da verificação'}
    return jsonify({'checked': True, 'results': results})


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000, use_reloader=False)
