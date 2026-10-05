import time
import json
import hmac
from flask import Flask, jsonify, request, g
from openpyxl import load_workbook
from datetime import date, timedelta, datetime, timezone
from flask_cors import CORS
import os
import sys
import logging
import requests
import re
import hashlib
import uuid
import ipaddress
import socket
from zoneinfo import ZoneInfo
from urllib.parse import quote, urlparse, urljoin
from io import BytesIO
from dotenv import load_dotenv
from upstash_redis import Redis
from pywebpush import webpush

# Authorization layer
sys.path.insert(0, os.path.dirname(__file__))
from auth import (
    require_auth,
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

class DateEncoder(json.JSONEncoder):
    """Serializa objetos date/datetime para string ISO automaticamente."""
    def default(self, obj):
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
    """Grava o cache por chave (Redis + arquivo local para resiliência)."""
    payload = {'data': data, 'timestamp': time.time()}
    if redis:
        try:
            redis.set(f'cache:{cache_key}', json.dumps(payload, cls=DateEncoder), ex=CACHE_TTL)
        except Exception as e:
            logger.error(f"Erro ao salvar cache Redis: {e}")
    try:
        with open(_cache_path(cache_key), 'w', encoding='utf-8') as f:
            json.dump(payload, f, cls=DateEncoder)
    except Exception as e:
        logger.error(f"Erro ao salvar cache em arquivo: {e}")

app = Flask(__name__)
CORS(app)

# VAPID — apenas env vars (Vercel/.env). Sem as chaves, o push falha com warning
# (best-effort, não derruba o app).
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
    logger.warning("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nao configuradas — push desabilitado")
VAPID_CLAIMS = {"sub": "mailto:admin@reservaslab.com"}

_upstash_url = os.environ.get('UPSTASH_REDIS_REST_URL')
_upstash_token = os.environ.get('UPSTASH_REDIS_REST_TOKEN')
redis = Redis(url=_upstash_url, token=_upstash_token) if _upstash_url and _upstash_token else None

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
    """Cria a coluna lab_count em public.workspaces se ainda não existir."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return
    sql = 'ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS lab_count SMALLINT NOT NULL DEFAULT 2;'
    try:
        headers = {'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}'}
        r = requests.post(f"{_SUPABASE_URL}/rest/v1/rpc/pg_sql", json={'query': sql}, headers=headers, timeout=10)
        logger.info(f"pg_sql lab_count: {r.status_code}")
    except Exception as e:
        logger.info(f"pg_sql lab_count error: {e}")


def _get_workspace_lab_count(workspace_slug):
    """Busca a quantidade de labs de um workspace (padrão 2).

    Se a coluna lab_count ainda não existir no banco, garante a criação
    (self-healing) e tenta de novo.
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
        if not resp.ok:
            _ensure_workspaces_lab_count()
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
    current = url
    for _hop in range(max_redirects + 1):
        if not _ext_validate_source_url(current):
            return None, 'URL inválida ou não permitida (proteção SSRF)'
        try:
            resp = requests.get(
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


def _parse_spreadsheet(spreadsheet_url, lab_count=2):
    """Baixa e parseia uma planilha Excel, retornando (reservas_hoje, reservas_semana)."""
    reservas_hoje = []
    reservas_semana = []
    if not spreadsheet_url:
        return reservas_hoje, reservas_semana
    # Só a representação segura: a URL original pode carregar token de
    # compartilhamento, e este log é sobre a RECUSA, não sobre a credencial.
    origem = _safe_url_for_log(spreadsheet_url)
    if not _ext_validate_source_url(spreadsheet_url, SPREADSHEET_MAX_URL_LEN):
        logger.error("URL da planilha rejeitada (proteção SSRF): %s", origem)
        return reservas_hoje, reservas_semana
    logger.info("Baixando planilha de %s", origem)
    content, fetch_error = _ext_fetch_source_bytes(
        spreadsheet_url,
        max_bytes=SPREADSHEET_MAX_BYTES,
        timeout=SPREADSHEET_TIMEOUT,
        max_redirects=SPREADSHEET_MAX_REDIRECTS,
    )
    if fetch_error:
        # O detalhe técnico fica no log; o contrato de retorno é lista vazia, como
        # antes. `origem` já é a forma sanitizada — a URL crua nunca entra aqui.
        logger.error("Falha ao baixar a planilha de %s (%s)", origem, fetch_error)
        return reservas_hoje, reservas_semana
    # Daqui para baixo é o parser de antes, byte a byte: o `try` externo continua
    # sendo a rede de segurança do laço de linhas.
    try:
        try:
            # read_only + data_only: lê só os valores (sem fórmulas/render), bem mais rápido
            wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
            logger.info("Planilha carregada!")
        except Exception as e:
            logger.error(f"Erro ao carregar planilha: {e}")
            return reservas_hoje, reservas_semana
        try:
            ws = wb['RESERVA LAB. INFORMÁTICA']
        except KeyError:
            logger.error("Aba 'RESERVA LAB. INFORMÁTICA' não encontrada")
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
                continue
    except Exception as e:
        logger.error(f"Erro ao processar planilha: {e}")
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
        return cached
    
    if spreadsheet_url is _UNSET:
        spreadsheet_url, _ = _resolve_spreadsheet_url(workspace_slug)
    
    if spreadsheet_url and workspace_slug:
        logger.info(f"Usando planilha do workspace '{workspace_slug}'")
    
    reservas_hoje, reservas_semana = _parse_spreadsheet(spreadsheet_url, lab_count=lab_count)
    
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
    if not redis:
        return jsonify({'error': 'Redis not configured'}), 500
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

        # Remove qualquer inscrição anterior com o mesmo endpoint (dedupe por dispositivo)
        subs = _get_subs()
        others = [s for s in subs if s.get('endpoint') != endpoint]
        if len(others) != len(subs):
            redis.delete('push:subscribers')
            for s in others:
                redis.sadd('push:subscribers', json.dumps(s, ensure_ascii=False))

        redis.sadd('push:subscribers', json.dumps(sub, ensure_ascii=False))
        logger.info(f"Push subscriber added: {sub['key'][:8]}... role={sub['user']['role']}")
        return jsonify({'status': 'ok'})
    except Exception as e:
        logger.error("Push subscribe error: %s", e)
        return jsonify({'error': 'Erro ao registrar inscrição de push'}), 500

def push_notify(sub, title, body, url='/', actions=None, user_id=None):
    try:
        data = {'title': title, 'body': body, 'url': url}
        if actions:
            data['actions'] = actions
        if user_id:
            data['userId'] = user_id
        webpush(
            subscription_info=sub,
            data=json.dumps(data),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=dict(VAPID_CLAIMS),
            ttl=86400
        )
        return True
    except Exception as e:
        logger.warning(f"Push send error: {e}")
        # 404/410 = inscrição expirada/removida pelo navegador: remove do Redis
        # para não insistir no envio em toda rodada (auto-limpeza).
        resp = getattr(e, 'response', None)
        status = getattr(resp, 'status_code', None) if resp is not None else None
        if status in (404, 410) and redis is not None:
            try:
                redis.srem('push:subscribers', json.dumps(sub, ensure_ascii=False))
                logger.info(f"Push: inscrição removida do Redis (HTTP {status})")
            except Exception as rm_err:
                logger.error(f"Push: falha ao remover inscrição do Redis: {rm_err}")
        return False

@app.route('/api/push/test', methods=['GET'])
@require_auth
@require_admin
def push_test():
    if not redis:
        return jsonify({'error': 'Redis not configured'}), 500
    subs = redis.smembers('push:subscribers')
    if not subs:
        return jsonify({'message': 'No subscribers'})
    count = 0
    for raw in subs:
        sub = json.loads(raw) if isinstance(raw, str) else raw
        ok = push_notify(sub, 'Teste Reservas Lab', 'Notificação push funcionando! 🔔')
        if ok:
            count += 1
    return jsonify({'sent': count, 'total': len(subs)})


@app.route('/api/push/send', methods=['POST'])
@require_auth
@require_admin
@require_action_rbac('reservelab.push.manage', scope='global')
def push_send():
    """Envia um push para os subscribers (filtrando por módulo, workspace, cargo e usuário)."""
    if not redis:
        return jsonify({'error': 'Redis not configured'}), 500
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

        subs = _target_subs(module=module, workspace_id=workspace_id, user_id=user_id, role=role)

        if not subs:
            return jsonify({'sent': 0, 'total': 0})

        count = 0
        for sub in subs:
            ok = push_notify(sub, title, msg, url=url, actions=actions, user_id=user_id)
            if ok:
                count += 1
        return jsonify({'sent': count, 'total': len(subs)})
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


def _resolve_batch_rbac(subs):
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
            return {}
        out = {}
        for r in (resp.json() or []):
            uid, ws = r.get('profile_id'), r.get('workspace_id')
            if uid and ws:
                entry = out.setdefault(str(uid), {}).setdefault(str(ws), {})
                entry['membership_id'] = r.get('id')
                entry['role_id'] = r.get('role_id')
        return out
    except Exception:
        return {}


def _resolve_batch_role_permissions(role_ids):
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
            return {}
        out = {}
        for r in (resp.json() or []):
            if str(r.get('scope') or 'workspace') != 'workspace':
                continue
            action = str(r.get('action') or '').strip()
            if action:
                out.setdefault(str(r.get('role_id')), set()).add(action)
        return out
    except Exception:
        return {}


def _resolve_batch_overrides(membership_ids):
    """Overrides por membership: {membership_id: {action: 'allow'|'deny'}}.

    Falha ⇒ {} (fail-closed) — na ausência de override o papel base decide.
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
            return {}
        out = {}
        for r in (resp.json() or []):
            if r.get('effect') in ('allow', 'deny') and r.get('action'):
                out.setdefault(str(r.get('membership_id')), {})[str(r['action'])] = r['effect']
        return out
    except Exception:
        return {}


def _module_action_ok(u, module, min_level, rbac_members, role_actions, overrides, workspace_id=None):
    """Tem Action do módulo numa membership ativa (resolução no servidor)?

    - super admin ⇒ True (bypass preservado);
    - módulo ou nível sem critério cadastrado ⇒ False (fail-closed);
    - com workspace_id, a Action é exigida NAQUELE workspace; sem workspace_id,
      qualquer membership ativa do usuário conta.
    """
    if u.get('is_super_admin'):
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


def _target_subs(module=None, workspace_id=None, user_id=None, role=None, *, min_level=None):
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
    subs = _get_subs()
    needs_rbac = bool(module)
    if needs_rbac:
        rbac_members = _resolve_batch_rbac(subs)
        role_ids = {
            m.get('role_id') for ws in rbac_members.values()
            for m in ws.values() if m.get('role_id')
        }
        role_actions = _resolve_batch_role_permissions(role_ids)
        membership_ids = {
            m.get('membership_id') for ws in rbac_members.values()
            for m in ws.values() if m.get('membership_id')
        }
        overrides = _resolve_batch_overrides(membership_ids)
        member_ws = {uid: set(ws_map.keys()) for uid, ws_map in rbac_members.items()}
    elif workspace_id:
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
            if not u.get('is_super_admin') and workspace_id not in member_ws.get(str(u.get('id') or ''), set()):
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
# PUSH_DEDUP_SECONDS:   TTL da chave de deduplicação `push:sent:{id}` no Redis
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


def _internal_push_check():
    """Core logic for push check — reservas + tablets. Returns dict."""
    if not redis:
        return {'error': 'Redis not configured'}
    try:
        today = get_today_sp()

        subs_raw = redis.smembers('push:subscribers')
        if not subs_raw:
            return {'message': 'No subscribers', 'sent': 0}

        # Reserva de lab: a planilha é POR CAMPUS. Quando há workspaces com
        # planilha própria, agrega as reservas de hoje de cada campus e marca
        # os assinantes daquele campus em `_subs`. Sem nenhum workspace
        # configurado, mantém o fallback legado da planilha global.
        reservas_hoje = []
        _lab_workspaces = _workspaces_with_spreadsheet()
        if _lab_workspaces:
            for _ws in _lab_workspaces:
                _ws_subs = _target_subs(module='reservalab', workspace_id=_ws['id'], min_level='full')
                if not _ws_subs:
                    continue
                try:
                    _lab_count = _get_workspace_lab_count(_ws['slug'])
                    _reservas_ws, _ = get_reservas(
                        _ws['slug'], spreadsheet_url=_ws['spreadsheet_url'], lab_count=_lab_count,
                    )
                except Exception as e:
                    logger.error("Push check: falha ao ler planilha do campus %s: %s", _ws.get('slug'), e)
                    continue
                for _r in _reservas_ws:
                    _r['_subs'] = _ws_subs
                    _r['_scope'] = _ws['id']
                reservas_hoje.extend(_reservas_ws)
        else:
            reservas_hoje, _ = get_reservas()

        agora = get_now_sp()
        agora_min = agora.hour * 60 + agora.minute
        limite_min = agora_min + _push_advance_minutes()

        subs = _target_subs(module='reservalab', min_level='full')
        sent = 0
        
        for r in reservas_hoje:
            data_reserva = r.get('data')
            if isinstance(data_reserva, str):
                try:
                    data_reserva = datetime.strptime(data_reserva, '%d/%m/%Y').date()
                except:
                    continue
            if data_reserva != today:
                continue
            
            inicio = parse_horario_inicio(r.get('horario', ''))
            if inicio is None:
                continue
            
            if agora_min <= inicio <= limite_min:
                notify_id = hashlib.md5(f"{r.get('_scope') or ''}|{r['lab']}|{r['horario']}|{r.get('responsavel','')}".encode()).hexdigest()
                
                already = redis.get(f'push:sent:{notify_id}')
                if already:
                    continue
                
                title = f"{' '.join(r.get('labs', [r.get('lab', 'Lab')]))}"
                alunos = r.get('alunos', '')
                evento = r.get('observacao', '').strip()
                body = f"{r['horario']} — {r.get('responsavel', 'Professor') or 'Sem professor'}"
                if evento:
                    body += f" — {evento}"
                if alunos:
                    body += f" — {alunos} alunos"
                
                for sub in (r.get('_subs') or subs):
                    push_notify(sub, title, body)
                
                redis.setex(f'push:sent:{notify_id}', _push_dedup_seconds(), '1')
                sent += 1
                logger.info(f"Push sent for {title} at {r['horario']}")
        
        # ─── Push para reservas de tablets ──────────────────────────
        supabase_url = os.environ.get('SUPABASE_URL', '')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY', '')
        if supabase_url and supabase_key:
            try:
                today_str = today.strftime('%Y-%m-%d')
                tomorrow_str = (today + timedelta(days=1)).strftime('%Y-%m-%d')
                tablet_url = (
                    f"{supabase_url}/rest/v1/tablet_reservations"
                    f"?select=*&order=horario_inicio.asc"
                    f"&status=eq.{quote('ativa')}"
                    f"&horario_inicio=gte.{quote(today_str + 'T00:00:00Z')}"
                    f"&horario_inicio=lt.{quote(tomorrow_str + 'T00:00:00Z')}"
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
                        
                        if agora_min <= inicio_min <= limite_min:
                            notify_id = hashlib.md5(f"tablet|{t['id']}".encode()).hexdigest()
                            already = redis.get(f'push:sent:{notify_id}')
                            if already:
                                continue
                            
                            title = f"Tablets — {t.get('sala', 'Sala')}"
                            evento = t.get('finalidade', '').strip()
                            body = f"{t.get('professor', 'Professor')}"
                            if evento:
                                body += f" — {evento}"
                            body += f" — {t.get('quantidade_tablets', '?')} tablets"
                            
                            # Alerta do campus → só quem tem acesso àquele workspace
                            # (super admin vê todos; reserva sem workspace vai para todos).
                            # Só nível 'full' do reservalab recebe push de reserva.
                            ws_id = t.get('workspace_id')
                            target = _target_subs(module='reservalab', workspace_id=ws_id, min_level='full') if ws_id else subs
                            for sub in target:
                                push_notify(sub, title, body)
                            
                            redis.setex(f'push:sent:{notify_id}', _push_dedup_seconds(), '1')
                            sent += 1
                            logger.info(f"Push sent for tablet: {title} at {inicio_str}")
            except Exception as e:
                logger.error(f"Tablet push check error: {e}")
        
        return {'checked': True, 'sent': sent, 'subscribers': len(subs)}
    except Exception as e:
        logger.error("Push check error: %s", e)
        return {'error': 'Erro ao verificar push'}

# ─── Notificações de Empréstimos (Stock) ─────────────────────────

def _get_subs():
    raw = redis.smembers('push:subscribers') if redis else []
    return [json.loads(s) if isinstance(s, str) else s for s in raw]


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
    if not redis:
        return jsonify({'error': 'Redis not configured'}), 500
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


@app.route('/api/push/notify-loan', methods=['POST'])
@require_auth
@require_module_auth('stock')
def push_notify_loan():
    """Notify stock subscribers about a loan. Auth required, stock module required."""
    # Workspace validation: if workspace_id is provided, verify membership
    if request.is_json:
        body_json = request.get_json(silent=True) or {}
        ws_id = body_json.get('workspace_id')
        if ws_id and hasattr(g, 'user') and not _user_in_workspace(g.user, ws_id):
            return jsonify({'error': 'Access denied to this workspace'}), 403
    if not redis:
        return jsonify({'error': 'Redis not configured'}), 500
    try:
        body = request.get_json()
        item_name = body.get('itemName', 'Item')
        borrowed_by = body.get('borrowedBy', 'Alguém')
        expected_return = body.get('expectedReturnAt', '')

        title = f"📦 Empréstimo: {item_name}"
        msg = f"Emprestado para {borrowed_by}"
        if expected_return:
            msg += f" — Devolução até {expected_return[:10]}"

        subs = _target_subs(module=body.get('module') or 'stock', workspace_id=body.get('workspace_id'))
        for sub in subs:
            push_notify(sub, title, msg)

        logger.info(f"Loan notify: {title}")
        return jsonify({'sent': len(subs)})
    except Exception as e:
        logger.error("notify-loan error: %s", e)
        return jsonify({'error': 'Erro ao processar notificação de empréstimo'}), 500


@app.route('/api/push/notify-return', methods=['POST'])
@require_auth
@require_module_auth('stock')
def push_notify_return():
    """Notify stock subscribers about a return. Auth required, stock module required."""
    # Workspace validation: if workspace_id is provided, verify membership
    if request.is_json:
        body_json = request.get_json(silent=True) or {}
        ws_id = body_json.get('workspace_id')
        if ws_id and hasattr(g, 'user') and not _user_in_workspace(g.user, ws_id):
            return jsonify({'error': 'Access denied to this workspace'}), 403
    if not redis:
        return jsonify({'error': 'Redis not configured'}), 500
    try:
        body = request.get_json()
        item_name = body.get('itemName', 'Item')
        returned_by = body.get('returnedBy', 'Alguém')

        title = f"✅ Devolução: {item_name}"
        msg = f"Devolvido por {returned_by}"

        subs = _target_subs(module=body.get('module') or 'stock', workspace_id=body.get('workspace_id'))
        for sub in subs:
            push_notify(sub, title, msg)

        logger.info(f"Return notify: {title}")
        return jsonify({'sent': len(subs)})
    except Exception as e:
        logger.error("notify-return error: %s", e)
        return jsonify({'error': 'Erro ao processar notificação de devolução'}), 500


def _ensure_stock_schema(supabase_url, supabase_key):
    """Cria schema stock e tabelas se não existirem usando SQL direto no Postgres."""
    if not supabase_url or not supabase_key:
        return

    h = {'apikey': supabase_key, 'Authorization': f'Bearer {supabase_key}'}

    # Tenta criar via pg_sql RPC (colunas com aspas p/ preservar case)
    sql = """CREATE SCHEMA IF NOT EXISTS stock;
CREATE TABLE IF NOT EXISTS stock.stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT '',
    subcategory TEXT NOT NULL DEFAULT '', "serialNumber" TEXT NOT NULL DEFAULT '',
    room TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ativo',
    condition TEXT NOT NULL DEFAULT 'Bom', notes TEXT DEFAULT '',
    "linkedPcId" TEXT DEFAULT '', "linkedPcLabel" TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS stock.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "itemId" TEXT NOT NULL DEFAULT '', "itemName" TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '', "borrowedBy" TEXT DEFAULT '',
    "borrowedAt" TIMESTAMPTZ DEFAULT NOW(), "expectedReturnAt" TIMESTAMPTZ,
    "returnedAt" TIMESTAMPTZ, notes TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ DEFAULT NOW());"""
    try:
        r = requests.post(f"{supabase_url}/rest/v1/rpc/pg_sql", json={'query': sql}, headers=h, timeout=10)
        logger.info(f"pg_sql stock: {r.status_code} {r.text[:200]}")
    except Exception as e:
        logger.info(f"pg_sql stock error: {e}")

    sql_p = """CREATE SCHEMA IF NOT EXISTS pcare;
CREATE TABLE IF NOT EXISTS pcare.parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '', quantity INTEGER DEFAULT 0,
    "minQuantity" INTEGER DEFAULT 0, unit TEXT DEFAULT 'un',
    "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS pcare.maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "pcNumber" TEXT DEFAULT '', "labName" TEXT DEFAULT '',
    type TEXT DEFAULT '', description TEXT DEFAULT '',
    completed BOOLEAN DEFAULT FALSE, "scheduledDate" DATE,
    "createdAt" TIMESTAMPTZ DEFAULT NOW());"""
    try:
        r = requests.post(f"{supabase_url}/rest/v1/rpc/pg_sql", json={'query': sql_p}, headers=h, timeout=10)
        logger.info(f"pg_sql pcare: {r.status_code} {r.text[:200]}")
    except Exception as e:
        logger.info(f"pg_sql pcare error: {e}")

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
    if not redis:
        return {'error': 'Redis not configured'}
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
        subs = _target_subs(module='stock')
        sent = 0
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
            nid = hashlib.md5(f"overdue|{loan['id']}".encode()).hexdigest()
            if redis.get(f'push:sent:{nid}'):
                continue

            item_name = loan.get('itemname', 'Item')
            borrowed_by = loan.get('borrowedby', 'Alguém')

            title = f"⏰ Prazo de devolução: {item_name}"
            msg = f"Emprestado para {borrowed_by} — Vence {expected_raw[:10]}"
            for sub in subs:
                push_notify(sub, title, msg)

            redis.setex(f'push:sent:{nid}', 43200, '1')
            sent += 1
            logger.info(f"Overdue notify: {item_name}")

        return {'checked': True, 'sent': sent, 'found': found, 'subscribers': len(subs)}
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
    if not redis:
        return {'error': 'Redis not configured'}
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
        subs = _target_subs(module='pc-care')
        sent = 0

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
                        nid = hashlib.md5(f"pcare|part|{part['id']}".encode()).hexdigest()
                        if redis.get(f'push:sent:{nid}'):
                            continue
                        title = f"🔧 Estoque baixo: {part.get('name', 'Peça')}"
                        msg = f"Quantidade: {qty} | Mínimo: {min_qty}"
                        for sub in subs:
                            push_notify(sub, title, msg)
                        redis.setex(f'push:sent:{nid}', 86400, '1')
                        sent += 1
                        logger.info(f"Low stock: {part.get('name')}")
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
                    nid = hashlib.md5(f"pcare|maint|{m['id']}".encode()).hexdigest()
                    if redis.get(f'push:sent:{nid}'):
                        continue
                    title = f"🔧 Manutenção: {m.get('pcnumber', 'PC')}"
                    msg = f"{m.get('labname', 'Lab')} — {m.get('type', '')} — {m.get('scheduleddate', '')[:10]}"
                    for sub in subs:
                        push_notify(sub, title, msg)
                    redis.setex(f'push:sent:{nid}', 86400, '1')
                    sent += 1
                    logger.info(f"Maintenance: {m.get('pcnumber')}")
        except Exception as e:
            logger.error(f"check-pcare maintenance error: {e}")

        return {'checked': True, 'sent': sent, 'subscribers': len(subs)}
    except Exception as e:
        logger.error("check-pcare error: %s", e)
        return {'error': 'Erro ao verificar manutenções do PC Care'}


def _check_pending_users():
    """Push para admins quando existem usuários aguardando aprovação."""
    if not redis:
        return {'error': 'Redis not configured'}
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
        subs = _target_subs(module='auth')
        sent = 0
        for u in pending:
            nid = hashlib.md5(f"pending|{u.get('id')}".encode()).hexdigest()
            if redis.get(f'push:sent:{nid}'):
                continue
            nome = u.get('name') or u.get('email') or 'Usuário'
            title = 'Novo usuário pendente'
            body = f"{nome} ({u.get('email') or ''}) aguarda aprovação"
            for sub in subs:
                # PR-4D-A (Option B): notificação INFORMATIVA. Sem botões
                # approve/reject — um Service Worker não consegue autenticar com
                # segurança uma ação crítica em segundo plano (o POST ficaria
                # também sem Authorization => 401). O click abre a fila de
                # pendentes: /admin/users?pending=<id> (AdminGuard + RLS).
                push_notify(
                    sub, title, body,
                    url=f"/admin/users?pending={u.get('id')}",
                )
            redis.setex(f'push:sent:{nid}', 604800, '1')
            sent += 1
            logger.info(f"Pending user notify: {(u.get('id') or '')[:8]}")
        return {'checked': True, 'found': len(pending), 'sent': sent, 'subscribers': len(subs)}
    except Exception as e:
        logger.error("check-pending error: %s", e)
        return {'error': 'Erro ao verificar usuários pendentes'}


def _check_stock_expiry():
    """Push para itens de stock vencidos ou com validade próxima (janela de 30 dias)."""
    if not redis:
        return {'error': 'Redis not configured'}
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

            nid = hashlib.md5(f"expiry|{item.get('id')}".encode()).hexdigest()
            if redis.get(f'push:sent:{nid}'):
                continue

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
            subs = _target_subs(module='stock', workspace_id=ws)
            for sub in subs:
                push_notify(sub, title, msg, url=f"/stock/items/{item.get('id')}")

            redis.setex(f'push:sent:{nid}', 86400, '1')
            sent += 1
            logger.info(f"Stock expiry: {nome} ({dias}d)")
        return {'checked': True, 'sent': sent, 'subscribers': len(_target_subs(module='stock'))}
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
