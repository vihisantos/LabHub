"""#193 — hardening do fetch externo da planilha do ReservaLab (SSRF).

Este arquivo é a rede de segurança da #193. Ele pergunta três coisas distintas,
e todas as três importam:

  1. A URL externa é rejeitada quando aponta para dentro da rede?
  2. O download respeita teto de tamanho, timeout e limite de redirects, mesmo
     quando o servidor quer que não?
  3. **O parser continua funcionando?**

A terceira é a que mais importa e a que ninguém escreve. Uma proteção SSRF que
traga um `except` largo demais devolve lista vazia para sempre e o bug fica
invisível: a tela mostra "não tem reservas" e o produto inteiro parece quebrado.
Então há testes que constroem uma planilha XLSX de verdade, passam pelos bytes
endurecidos e esperam as reservas na saída — incluindo datas, horários,
laboratórios e a janela de 30 dias.

Também há teste de que o erro devolvido ao chamador não carrega detalhe interno
(DNS resolvido, host, credencial na query string). A resposta HTTP do endpoint
segue genérica por construção: `_parse_spreadsheet` devolve listas vazias, como
sempre devolveu.

Nenhum teste toca a internet: `socket.getaddrinfo` e `requests.get` são
substituídos por doubles, e o `FakeRequests` falha alto se alguma rota não
mockada for chamada — um teste que sairia para a rede falharia, não passaria.
"""

import importlib.util
import io
import socket
import sys
from datetime import timedelta
from pathlib import Path

import pytest
import requests as requests_lib
from openpyxl import Workbook

ROOT_API = Path(__file__).resolve().parents[1] / "app.py"
RESERVALAB_API = (
    Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"
)

VALID_URL = "https://planilhas.exemplo.com/reservas.xlsx"

ERR_SSRF = "URL inválida ou não permitida (proteção SSRF)"


# ── doubles ──────────────────────────────────────────────────────────────────

class FakeResponse:
    """Resposta de download externo com streaming controlável."""

    def __init__(self, content=b"", status_code=200, headers=None, chunks=None):
        self.status_code = status_code
        self.ok = 200 <= status_code < 400
        # `Content-Length` é opcional de propósito: a proteção não pode depender
        # dele, porque o servidor pode omitir ou mentir.
        self.headers = headers if headers is not None else {}
        self._chunks = chunks if chunks is not None else [content]
        self.closed = False
        self.content = content

    def iter_content(self, chunk_size=64 * 1024):
        for chunk in self._chunks:
            yield chunk

    def close(self):
        self.closed = True

    def raise_for_status(self):
        if not self.ok:
            raise requests_lib.exceptions.HTTPError(f"HTTP {self.status_code}")


class FakeRequests:
    """`requests.get` falso que registra as URLs chamadas."""

    # Mesma referência real de `requests.exceptions` que o harness da TV usa. Os
    # helpers fazem `except requests.exceptions.…`, e essa linha é resolvida no
    # módulo que os executa — aqui, o legado. Uma hierarquia falsa de exceção
    # quebraria o `except` silenciosamente, que é pior do que não ter.
    exceptions = requests_lib.exceptions

    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        if self.error is not None:
            raise self.error
        if self.response is None:
            raise AssertionError(f"sem resposta mockada para {url}")
        resp = self.response
        # Respostas em cadeia: uma lista sai na ordem, uma por hop.
        if isinstance(resp, list):
            if not resp:
                raise AssertionError("cadeia de respostas esgotada")
            return resp.pop(0)
        return resp

    def urls(self):
        return [c["url"] for c in self.calls]


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def legacy_module():
    """Carrega o módulo legado do ReservaLab sob a chave `reservalab_api`.

    É a mesma chave e o mesmo arquivo que `test_auth_layer.py` já usa — o módulo
    que contém `_is_safe_url` e, desde a #193, os helpers genéricos de fetch.
    Reaproveitar a chave evita duas instâncias do mesmo Flask app no mesmo
    processo, que é o que dispara `_check_setup_finished`.
    """
    target = RESERVALAB_API.resolve()
    for mod in list(sys.modules.values()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "reservalab_api"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, RESERVALAB_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    # Registra também sob `app`, que é o nome que `api/app.py` faz
    # `from app import …`. Sem isto, quem carrega `api/app.py` depois criaria uma
    # SEGUNDA instância deste módulo — e dois helpers `_ext_validate_source_url`
    # diferentes em memória, o que faria os testes de delegação da TV medirem a
    # cópia errada.
    sys.modules.setdefault("app", mod)
    return mod


@pytest.fixture(scope="session")
def root_api():
    """Carrega `api/app.py` sob a chave `root_api`, reutilizando o que já existe.

    Só é usada pelos testes que comparam o comportamento da TV com o genérico.
    A chave é a mesma de `test_tv_source.py`, e a instância é compartilhada —
    carregar duas registraria as rotas Flask duas vezes no mesmo app.
    """
    target = ROOT_API.resolve()
    for mod in list(sys.modules.values()):
        if getattr(mod, "app", None) is None:
            continue
        f = getattr(mod, "__file__", None)
        if f and Path(f).resolve() == target:
            return mod
    key = "root_api"
    if key in sys.modules:
        return sys.modules[key]
    spec = importlib.util.spec_from_file_location(key, ROOT_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def dns_allows(monkeypatch):
    """Resolve qualquer hostname para um IP público (nenhum teste usa a rede)."""
    def fake(host, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
    monkeypatch.setattr(socket, "getaddrinfo", fake)


@pytest.fixture()
def dns_to(monkeypatch):
    """Resolve para os IPs informados — inclusive vários, para o bypass real."""
    def factory(*addresses):
        def fake(host, *args, **kwargs):
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", (addr, 0))
                for addr in addresses
            ]
        monkeypatch.setattr(socket, "getaddrinfo", fake)
        return fake
    return factory


@pytest.fixture()
def fake_get(monkeypatch):
    """Injeta um `requests` falso no módulo legado e devolve a instância.

    Chamar de novo SEM argumentos devolve o MESMO fake — é assim que o teste
    consulta `urls()` depois de disparar a ação. Passar argumentos reconfigura a
    resposta (útil para encadear redirects num único teste).
    """
    state = {"fake": None}

    def factory(response=None, error=None):
        if state["fake"] is None or response is not None or error is not None:
            state["fake"] = FakeRequests(response=response, error=error)
            monkeypatch.setattr("app.requests", state["fake"])
        return state["fake"]

    return factory


@pytest.fixture()
def logs_de(legacy_module, monkeypatch):
    """Captura tudo que o módulo legado loga, para auditar o CONTEÚDO do log.

    A pergunta "o token aparece no log?" não é respondida pelo código, e sim pelo
    que chega ao handler de log. Este double acumula as mensagens já formatadas,
    que é exatamente o que um agregador de log veria.
    """
    registros = []

    class Captura:
        def _registra(self, nivel, msg, *args):
            try:
                registros.append((nivel, str(msg) % args if args else str(msg)))
            except Exception:
                registros.append((nivel, str(msg)))

        def error(self, msg, *a):
            self._registra('error', msg, *a)

        def warning(self, msg, *a):
            self._registra('warning', msg, *a)

        def info(self, msg, *a):
            self._registra('info', msg, *a)

        def debug(self, msg, *a):
            self._registra('debug', msg, *a)

    monkeypatch.setattr(legacy_module, 'logger', Captura())
    return registros


# ═══════════════════════════════════════════════════════════════════════════
# 1. Validação da URL
# ═══════════════════════════════════════════════════════════════════════════

class TestUrlValidation:
    """Cada URL é testada SEM rede: a validação acontece antes do request."""

    @pytest.mark.parametrize('url', [
        'https://planilhas.exemplo.com/reservas.xlsx',
        'https://sub.dominio.com/pasta/arquivo.xlsx?a=1',
        'https://exemplo.com:8443/x.xlsx',
    ])
    def test_https_publico_permitido(self, legacy_module, dns_allows, url):
        assert legacy_module._ext_validate_source_url(url) is True

    @pytest.mark.parametrize('url', [
        'http://planilhas.exemplo.com/reservas.xlsx',       # HTTP — downgrade
        'ftp://exemplo.com/x.xlsx',
        'file:///etc/passwd',
        'data:text/plain;base64,AAAA',
        'javascript:alert(1)',
        '//exemplo.com/x.xlsx',                              # sem esquema
        'xlsx',                                              # nem URL
        '',
        None,
    ])
    def test_esquema_nao_https_bloqueado(self, legacy_module, dns_allows, url):
        assert legacy_module._ext_validate_source_url(url) is False

    @pytest.mark.parametrize('url', [
        'https://localhost/x.xlsx',
        'https://LOCALHOST/x.xlsx',                         # caixa do hostname
        'https://localhost:8443/x.xlsx',
        'https://servidor.local/x.xlsx',                    # mDNS
        'https://qualquer.coisa.local/x.xlsx',
    ])
    def test_hostname_interno_bloqueado(self, legacy_module, dns_allows, url):
        assert legacy_module._ext_validate_source_url(url) is False

    @pytest.mark.parametrize('url', [
        'https://127.0.0.1/x.xlsx',
        'https://127.0.0.1:8443/x.xlsx',
        'https://10.0.0.1/x.xlsx',
        'https://172.16.0.1/x.xlsx',
        'https://192.168.1.1/x.xlsx',
        'https://169.254.169.254/latest/meta-data/',        # metadata da cloud
        'https://0.0.0.0/x.xlsx',
        'https://[::1]/x.xlsx',
        'https://[::ffff:127.0.0.1]/x.xlsx',                # IPv4 mapeado
        'https://[fe80::1]/x.xlsx',                         # IPv6 link-local
        'https://[fc00::1]/x.xlsx',                         # IPv6 ULA
        'https://[fd00::1]/x.xlsx',
        'https://[::]/x.xlsx',                              # unspecified
        'https://[ff02::1]/x.xlsx',                         # multicast
    ])
    def test_ip_interno_bloqueado(self, legacy_module, dns_allows, url):
        assert legacy_module._ext_validate_source_url(url) is False

    def test_url_vazia_ou_nao_string(self, legacy_module, dns_allows):
        assert legacy_module._ext_validate_source_url('') is False
        assert legacy_module._ext_validate_source_url(None) is False
        assert legacy_module._ext_validate_source_url(123) is False
        assert legacy_module._ext_validate_source_url(['https://x']) is False

    def test_url_acima_do_limite_bloqueada(self, legacy_module, dns_allows):
        longa = 'https://exemplo.com/' + ('a' * legacy_module.SPREADSHEET_MAX_URL_LEN)
        assert legacy_module._ext_validate_source_url(longa) is False
        ok = 'https://exemplo.com/' + ('a' * 1000)
        assert legacy_module._ext_validate_source_url(ok) is True

    # ── o bypass que a #193 fecha: DNS ──

    def test_hostname_que_resolve_para_ip_privado_bloqueado(
        self, legacy_module, dns_to,
    ):
        """O furo original: `_is_safe_url` validava o hostname literal e parava.

        Um domínio público apontado para 10.x passava inteiro.
        """
        dns_to('10.1.2.3')
        assert legacy_module._ext_validate_source_url(
            'https://oficial.example.com/x.xlsx') is False

        dns_to('127.0.0.1')
        assert legacy_module._ext_validate_source_url(
            'https://oficial.example.com/x.xlsx') is False

        dns_to('169.254.169.254')
        assert legacy_module._ext_validate_source_url(
            'https://oficial.example.com/x.xlsx') is False

    def test_todos_os_ips_sao_validados_nao_so_o_primeiro(
        self, legacy_module, dns_to,
    ):
        """`getaddrinfo` pode devolver público + privado. O `requests` conecta em
        qualquer um deles, então basta UM endereço proibido para bloquear."""
        dns_to('93.184.216.34', '10.0.0.5')
        assert legacy_module._ext_validate_source_url(
            'https://mix.example.com/x.xlsx') is False

        # Ordem invertida: o proibido vem primeiro, para não ser teste de ordem.
        dns_to('192.168.0.9', '93.184.216.34')
        assert legacy_module._ext_validate_source_url(
            'https://mix.example.com/x.xlsx') is False

    def test_resolucao_com_ipv6_mapeado_bloqueia(self, legacy_module, dns_to):
        dns_to('::ffff:10.0.0.1')
        assert legacy_module._ext_validate_source_url(
            'https://v6.example.com/x.xlsx') is False

    def test_resolucao_vazia_bloqueia(self, legacy_module, dns_to):
        dns_to()  # getaddrinfo retorna []
        assert legacy_module._ext_validate_source_url(
            'https://vazio.example.com/x.xlsx') is False

    def test_falha_de_dns_bloqueia(self, legacy_module, monkeypatch):
        """Falha de resolução é fail-closed — nunca "vou tentar e ver"."""
        def boom(*a, **k):
            raise socket.gaierror(-2, 'Name or service not known')
        monkeypatch.setattr(socket, "getaddrinfo", boom)
        assert legacy_module._ext_validate_source_url(
            'https://inexistente.example.com/x.xlsx') is False


# ═══════════════════════════════════════════════════════════════════════════
# 2. Redirects
# ═══════════════════════════════════════════════════════════════════════════

class TestRedirects:
    def test_redirect_https_para_https_publico_permitido(
        self, legacy_module, dns_allows, fake_get,
    ):
        fake_get(response=[
            FakeResponse(status_code=302,
                         headers={'Location': 'https://cdn.exemplo.com/final.xlsx'}),
            FakeResponse(content=b'CONTEUDO'),
        ])

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert err is None
        assert content == b'CONTEUDO'
        assert len(fake_get().urls()) == 2

    def test_redirect_relativo_resolvido(self, legacy_module, dns_allows, fake_get):
        fake_get(response=[
            FakeResponse(status_code=301, headers={'Location': '/outro/caminho/final.xlsx'}),
            FakeResponse(content=b'RELATIVO'),
        ])

        content, err = legacy_module._ext_fetch_source_bytes(
            'https://exemplo.com/pasta/original.xlsx')

        assert err is None
        assert content == b'RELATIVO'
        # `urljoin` resolveu contra a URL de origem, não contra a raiz.
        assert fake_get().urls()[1] == 'https://exemplo.com/outro/caminho/final.xlsx'

    def test_redirect_para_https_com_ip_interno_bloqueado(
        self, legacy_module, dns_allows, fake_get,
    ):
        """O bypass clássico: host público que responde 302 para a rede interna."""
        fake_get(response=[
            FakeResponse(status_code=302,
                         headers={'Location': 'https://169.254.169.254/latest/'}),
        ])

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert ERR_SSRF in err
        # O segundo hop NÃO chegou a ser requisitado.
        assert len(fake_get().urls()) == 1

    def test_redirect_para_localhost_bloqueado(
        self, legacy_module, dns_allows, fake_get,
    ):
        fake_get(response=[
            FakeResponse(status_code=302,
                         headers={'Location': 'http://localhost:9000/admin'}),
        ])

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert ERR_SSRF in err

    def test_downgrade_https_para_http_bloqueado(
        self, legacy_module, dns_allows, fake_get,
    ):
        """Enfraquecer o transporte no meio do caminho é SSRF também."""
        fake_get(response=[
            FakeResponse(status_code=302, headers={'Location': 'http://exemplo.com/x.xlsx'}),
        ])

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert ERR_SSRF in err

    def test_redirect_para_hostname_que_resolve_para_interno_bloqueado(
        self, legacy_module, fake_get, monkeypatch,
    ):
        """O segundo hop tem DNS próprio: o primeiro host resolve público, o
        destino resolve para 10.x. Revalidar só o primeiro host não bastaria."""
        respostas = {
            'planilhas.exemplo.com': [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
            ],
            'interno.example.com': [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.9.9.9", 0)),
            ],
        }

        def fake_dns(host, *a, **k):
            return respostas.get(host, respostas['planilhas.exemplo.com'])

        monkeypatch.setattr(socket, "getaddrinfo", fake_dns)
        fake_get(response=[
            FakeResponse(status_code=302,
                         headers={'Location': 'https://interno.example.com/x.xlsx'}),
        ])

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert ERR_SSRF in err

    def test_limite_de_redirects(self, legacy_module, dns_allows, fake_get):
        max_red = legacy_module.SPREADSHEET_MAX_REDIRECTS
        # Uma resposta a mais que o limite: deve ser recusado por excesso.
        fake_get(response=[
            FakeResponse(status_code=302, headers={'Location': f'https://exemplo.com/h{i}'})
            for i in range(max_red + 1)
        ] + [FakeResponse(content=b'NUNCA CHEGA')])

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert 'redirect' in err.lower()
        # Parou no limite: max_red + 1 requisições (a última já é o hop extra).
        assert len(fake_get().urls()) == max_red + 1

    def test_redirect_sem_location_bloqueado(self, legacy_module, dns_allows, fake_get):
        fake_get(response=[FakeResponse(status_code=302, headers={})])

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert err is not None

    def test_redirect_fecha_a_resposta_anterior(self, legacy_module, dns_allows, fake_get):
        primeira = FakeResponse(status_code=302,
                                headers={'Location': 'https://exemplo.com/f.xlsx'})
        fake_get(response=[primeira, FakeResponse(content=b'X')])

        legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert primeira.closed is True


# ═══════════════════════════════════════════════════════════════════════════
# 3. Payload
# ═══════════════════════════════════════════════════════════════════════════

class TestPayload:
    def test_arquivo_pequeno_permitido(self, legacy_module, dns_allows, fake_get):
        fake_get(response=FakeResponse(content=b'PK\x03\x04planilha'))

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert err is None
        assert content == b'PK\x03\x04planilha'

    def test_arquivo_acima_do_limite_rejeitado_no_streaming(
        self, legacy_module, dns_allows, fake_get,
    ):
        """O teto é aplicado DURANTE a leitura, não depois.

        Um corpo de 20 MB em memória seria o vetor; ler em chunks de 64 KB e
        abortar no primeiro excesso nunca materializa o arquivo inteiro.
        """
        limite = legacy_module.SPREADSHEET_MAX_BYTES
        chunk = b'x' * (64 * 1024)
        total_chunks = (limite // len(chunk)) + 2

        resp = FakeResponse(chunks=[chunk] * total_chunks)
        fake_get(response=resp)

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert 'limite' in err
        # A leitura abortou antes de consumir todos os chunks: o servidor não
        # conseguiu fazer o processo alocar o arquivo inteiro.
        assert resp.closed is True

    def test_ausencia_de_content_length_nao_permite_bypass(
        self, legacy_module, dns_allows, fake_get,
    ):
        """Sem `Content-Length` (ou com ele mentindo), o teto durante a leitura é
        o que segura."""
        limite = legacy_module.SPREADSHEET_MAX_BYTES
        chunk = b'y' * (64 * 1024)
        excesso = [chunk] * ((limite // len(chunk)) + 2)

        sem_header = FakeResponse(chunks=excesso, headers={})
        fake_get(response=sem_header)
        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)
        assert content is None
        assert 'limite' in err

        mentindo = FakeResponse(chunks=excesso, headers={'Content-Length': '10'})
        fake_get(response=mentindo)
        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)
        assert content is None
        assert 'limite' in err

    def test_exatamente_no_limite_e_aceito(self, legacy_module, dns_allows, fake_get):
        limite = legacy_module.SPREADSHEET_MAX_BYTES
        chunk = b'z' * (64 * 1024)
        n = limite // len(chunk)
        resto = limite - n * len(chunk)
        corpo = chunk * n + (b'r' * resto)

        fake_get(response=FakeResponse(content=corpo))

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert err is None
        assert len(content) == limite

    def test_content_length_ausente_e_corpo_pequeno_ok(
        self, legacy_module, dns_allows, fake_get,
    ):
        fake_get(response=FakeResponse(content=b'pequeno', headers={}))

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert err is None and content == b'pequeno'


# ═══════════════════════════════════════════════════════════════════════════
# 4. Timeout
# ═══════════════════════════════════════════════════════════════════════════

class TestTimeout:
    def test_timeout_na_conexao_vira_erro_controlado(
        self, legacy_module, dns_allows, fake_get,
    ):
        fake_get(error=requests_lib.exceptions.Timeout('Read timed out'))

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert 'Tempo esgotado' in err

    def test_timeout_na_leitura_vira_erro_controlado(
        self, legacy_module, dns_allows, fake_get,
    ):
        """Timeout no meio do streaming também precisa ser pego — sem isso a
        exceção escapa do helper e derruba quem chamou."""
        class LateTimeout(FakeResponse):
            def iter_content(self, chunk_size=64 * 1024):
                yield b'primeiro'
                raise requests_lib.exceptions.Timeout('Read timed out')

        fake_get(response=LateTimeout())

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert 'Tempo esgotado' in err

    def test_timeout_e_separado_por_fase(self, legacy_module, dns_allows, fake_get):
        """(conexão, leitura) — um único número não distingue connect travado de
        body lento, e os dois merecem limites diferentes."""
        assert isinstance(legacy_module.SPREADSHEET_TIMEOUT, tuple)
        connect, read = legacy_module.SPREADSHEET_TIMEOUT
        assert connect > 0 and read >= connect

        fake_get(response=FakeResponse(content=b'ok'))
        legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert fake_get().calls[0]['timeout'] == legacy_module.SPREADSHEET_TIMEOUT


# ═══════════════════════════════════════════════════════════════════════════
# 5. Erros sanitizados
# ═══════════════════════════════════════════════════════════════════════════

class TestErrorSanitization:
    def test_excecao_nao_vaza_mensagem_original(
        self, legacy_module, dns_allows, fake_get,
    ):
        """`str(exc)` de `requests` costuma carregar host, porta e query string —
        e a query string é onde vive a credencial de uma planilha assinada."""
        url = 'https://planilhas.exemplo.com/x.xlsx?sig=SEGREDO_COMPARTILHADO'
        exc = requests_lib.exceptions.ConnectionError(
            "HTTPSConnectionPool(host='planilhas.exemplo.com', port=443): "
            "Max retries exceeded with url: /x.xlsx?sig=SEGREDO_COMPARTILHADO")

        fake_get(error=exc)
        content, err = legacy_module._ext_fetch_source_bytes(url)

        assert content is None
        assert err is not None
        assert 'SEGREDO_COMPARTILHADO' not in err
        assert 'planilhas.exemplo.com' not in err
        assert 'Max retries' not in err
        # Só o nome da classe sobrevive — é técnico, mas não é segredo.
        assert 'ConnectionError' in err

    def test_http_error_nao_vaza_header_ou_corpo(
        self, legacy_module, dns_allows, fake_get,
    ):
        resp = FakeResponse(status_code=403)
        resp.headers = {'X-Debug-Interno': 'stacktrace-do-servidor'}
        fake_get(response=resp)

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert 'stacktrace' not in err
        assert 'X-Debug-Interno' not in err
        assert '403' in err

    def test_erro_nao_expoe_url_resolvida_nem_dns(
        self, legacy_module, dns_to, fake_get,
    ):
        dns_to('203.0.113.9')
        fake_get(error=requests_lib.exceptions.Timeout())

        content, err = legacy_module._ext_fetch_source_bytes(VALID_URL)

        assert content is None
        assert '203.0.113.9' not in err

    def test_mensagens_de_erro_estao_na_whitelist(self, legacy_module, dns_allows, fake_get):
        """Todo erro possível cabe numa frase curta e conhecida.

        É o que garante que nenhuma mensagem de exceção vá para o cliente: não há
        caminho que produza texto fora desta lista.
        """
        permitidos = {
            ERR_SSRF,
            'Tempo esgotado ao contatar a fonte',
            'Tempo esgotado ao ler a fonte',
            'Arquivo maior que o limite permitido',
            'Excesso de redirects',
            'Redirect sem destino',
            'Redirect inválido',
        }
        cenarios = [
            ('http://exemplo.com/x', None, ERR_SSRF),                       # downgrade
            ('https://10.0.0.1/x', None, ERR_SSRF),                         # RFC1918
            (VALID_URL, requests_lib.exceptions.Timeout(), 'Tempo esgotado ao contatar a fonte'),
            (VALID_URL, requests_lib.exceptions.ConnectionError(), 'Falha de rede'),
        ]
        for url, erro, esperado in cenarios:
            fake_get(response=FakeResponse(content=b'x') if erro is None else None,
                     error=erro)
            content, err = legacy_module._ext_fetch_source_bytes(url)
            assert content is None, url
            if esperado.startswith('Falha de rede'):
                assert err.startswith('Falha de rede (')
            else:
                assert err == esperado, url


# ═══════════════════════════════════════════════════════════════════════════
# 6. Regressão: o PARSER continua funcionando
# ═══════════════════════════════════════════════════════════════════════════

SHEET_TITLE = 'RESERVA LAB. INFORMÁTICA'
CABECALHO = ['Responsável', 'Professor', 'Email', 'Data', 'Horário',
             'Alunos', 'Obs', 'x', 'Laboratório']


def _planilha(rows, sheet_title=SHEET_TITLE):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title
    ws.append(CABECALHO)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture()
def hoje(legacy_module):
    return legacy_module.get_today_sp()


class TestParserStillWorks:
    def test_planilha_valida_vira_reservas(self, legacy_module, dns_allows, fake_get, hoje):
        """O caminho feliz inteiro: bytes endurecidos → XLSX → reservas.

        Sem este teste, uma proteção SSRF com `except` largo demais devolveria
        lista vazia para sempre e ninguém perceberia.
        """
        amanha = hoje + timedelta(days=1)
        corpo = _planilha([
            ['Prof. A', 'Responsável A', 'a@test.com', amanha, '08:00-10:00',
             30, 'Uso de aula', '', 'Lab 01 e 02'],
            ['Prof. B', 'Responsável B', 'b@test.com', amanha, '10:00-12:00',
             25, '', '', 'Lab 03'],
        ])
        fake_get(response=FakeResponse(content=corpo))

        hoje_r, semana = legacy_module._parse_spreadsheet(VALID_URL)

        assert hoje_r == []
        assert len(semana) == 2

        primeira = semana[0]
        assert primeira['responsavel'] == 'Responsável A'
        assert primeira['email'] == 'a@test.com'
        assert primeira['data'] == amanha
        assert primeira['labs'] == ['LAB01', 'LAB02']
        assert primeira['origem'] == 'planilha'
        assert primeira['reservation_id']
        assert primeira['horario_inicio'] == 8 * 60
        assert primeira['horario_fim'] == 10 * 60

    def test_hoje_cai_na_lista_de_hoje(self, legacy_module, dns_allows, fake_get, hoje):
        corpo = _planilha([
            ['Prof. A', 'Resp', 'a@test.com', hoje, '08:00-09:00',
             10, '', '', 'Lab 01'],
        ])
        fake_get(response=FakeResponse(content=corpo))

        hoje_r, semana = legacy_module._parse_spreadsheet(VALID_URL)

        assert len(hoje_r) == 1
        assert semana == []

    def test_fora_da_janela_de_30_dias_e_ignorado(
        self, legacy_module, dns_allows, fake_get, hoje,
    ):
        """A janela de 30 dias é comportamento de produto — não pode mudar."""
        corpo = _planilha([
            ['Prof. A', 'Resp', 'a@test.com', hoje + timedelta(days=31), '08:00-09:00',
             10, '', '', 'Lab 01'],
        ])
        fake_get(response=FakeResponse(content=corpo))

        hoje_r, semana = legacy_module._parse_spreadsheet(VALID_URL)

        assert hoje_r == [] and semana == []

    def test_workbook_invalido_vira_lista_vazia(self, legacy_module, dns_allows, fake_get):
        fake_get(response=FakeResponse(content=b'isto nao e um xlsx'))

        assert legacy_module._parse_spreadsheet(VALID_URL) == ([], [])

    def test_aba_inexistente_vira_lista_vazia(self, legacy_module, dns_allows, fake_get):
        corpo = _planilha([['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']],
                          sheet_title='OUTRA PLANILHA')
        fake_get(response=FakeResponse(content=corpo))

        assert legacy_module._parse_spreadsheet(VALID_URL) == ([], [])

    def test_url_bloqueada_vira_lista_vazia(self, legacy_module, dns_allows, fake_get):
        """Rejeitar é fail-closed: nada de reservas, e nada de exceção."""
        for url in ('http://planilhas.exemplo.com/x.xlsx',
                    'https://127.0.0.1/x.xlsx',
                    'https://10.0.0.1/x.xlsx'):
            assert legacy_module._parse_spreadsheet(url) == ([], [])
        # Nenhum request saiu.
        assert fake_get().calls == []

    def test_url_vazia_vira_lista_vazia(self, legacy_module, dns_allows, fake_get):
        assert legacy_module._parse_spreadsheet('') == ([], [])
        assert legacy_module._parse_spreadsheet(None) == ([], [])
        assert fake_get().calls == []

    def test_falha_no_download_vira_lista_vazia(self, legacy_module, dns_allows, fake_get):
        fake_get(error=requests_lib.exceptions.Timeout())

        assert legacy_module._parse_spreadsheet(VALID_URL) == ([], [])

    def test_http_404_da_fonte_vira_lista_vazia(self, legacy_module, dns_allows, fake_get):
        fake_get(response=FakeResponse(status_code=404))

        assert legacy_module._parse_spreadsheet(VALID_URL) == ([], [])

    def test_redirect_para_interno_nao_chega_ao_parser(
        self, legacy_module, dns_allows, fake_get,
    ):
        """Fail-closed ponta a ponta: o download é barrado e o parser nem vê
        bytes — não existe um caminho em que a planilha interna seja lida."""
        fake_get(response=[
            FakeResponse(status_code=302,
                         headers={'Location': 'https://10.0.0.5/plano.xlsx'}),
        ])

        assert legacy_module._parse_spreadsheet(VALID_URL) == ([], [])
        assert len(fake_get().urls()) == 1

    def test_lab_count_parametrado_continua_valendo(
        self, legacy_module, dns_allows, fake_get, hoje,
    ):
        corpo = _planilha([
            ['Prof. A', 'Resp', 'a@test.com', hoje + timedelta(days=1), '08:00-09:00',
             10, '', '', 'Lab 01, 02, 03 e 04'],
        ])
        fake_get(response=FakeResponse(content=corpo))

        _, semana = legacy_module._parse_spreadsheet(VALID_URL, lab_count=2)

        assert len(semana) == 1
        assert len(semana[0]['labs']) == 2


# ═══════════════════════════════════════════════════════════════════════════
# 7. Relação com o padrão da TV (a extração é real, não uma cópia)
# ═══════════════════════════════════════════════════════════════════════════

class TestSharedWithTv:
    def test_tv_delega_para_o_helper_generico(
        self, legacy_module, root_api, monkeypatch,
    ):
        """A TV usa a MESMA implementação, e isso é verificável: trocar o helper
        genérico muda o comportamento da TV.

        Duas proteções SSRF divergem, e a que diverge é a que esquece um hop de
        redirect. Delegar é o que garante que não divirjam.

        O monkeypatch é no NOME do módulo raiz, e não no atributo do legado:
        `api/app.py` faz `from app import _ext_validate_source_url`, então a
        referência fica presa no namespace dele. Patchear o atributo do legado
        não afetaria a TV — e o teste passaria sem provar nada.
        """
        monkeypatch.setattr(root_api, "_ext_validate_source_url",
                            lambda url, max_url_len=None: False)
        assert root_api._tv_validate_source_url(VALID_URL) is False

        monkeypatch.setattr(root_api, "_ext_validate_source_url",
                            lambda url, max_url_len=None: True)
        assert root_api._tv_validate_source_url('https://qualquer/x') is True

        # Os nomes antigos continuam existindo, para chamadores e para a suíte da TV.
        assert callable(root_api._tv_validate_source_url)
        assert callable(root_api._tv_fetch_source_bytes)

    def test_tv_e_reservalab_dao_o_mesmo_veredito(
        self, legacy_module, root_api, dns_allows,
    ):
        """Paridade de comportamento: TV e genérico concordam em toda URL — é a
        propriedade que importa quando se delega."""
        urls = [
            'https://exemplo.com/x.xlsx',
            'http://exemplo.com/x.xlsx',
            'https://localhost/x.xlsx',
            'https://127.0.0.1/x.xlsx',
            'https://10.0.0.1/x.xlsx',
            'https://169.254.169.254/x',
            'https://[::1]/x.xlsx',
            'https://[fe80::1]/x.xlsx',
            'https://a.local/x.xlsx',
            'ftp://exemplo.com/x',
            '',
        ]
        for url in urls:
            assert root_api._tv_validate_source_url(url) == \
                legacy_module._ext_validate_source_url(url), url

    def test_tv_e_reservalab_compartilham_os_limites(self, legacy_module, root_api):
        assert root_api.TV_SOURCE_MAX_REDIRECTS == legacy_module.SPREADSHEET_MAX_REDIRECTS
        assert root_api.TV_SOURCE_MAX_BYTES == legacy_module.SPREADSHEET_MAX_BYTES
        assert root_api.TV_SOURCE_MAX_URL_LEN == legacy_module.SPREADSHEET_MAX_URL_LEN
        assert root_api.TV_SOURCE_TIMEOUT == legacy_module.SPREADSHEET_TIMEOUT

    def test_validador_generico_aceita_limite_customizado(self, legacy_module, dns_allows):
        """Os limites são parâmetro, não constante global — foi o que permitiu
        extrair sem acoplar a TV ao número do ReservaLab."""
        assert legacy_module._ext_validate_source_url(VALID_URL, 2048) is True
        assert legacy_module._ext_validate_source_url(VALID_URL, 10) is False


# ═══════════════════════════════════════════════════════════════════════════
# 8. Log sem segredo (revisão da #193)
# ═══════════════════════════════════════════════════════════════════════════

# Token fictício. Não é segredo real — é o padrão de um link de compartilhamento
# de SharePoint/OneDrive/Drive, e é o que a revisão pediu para caçar no log.
TOKEN = 'SEGREDO_COMPARTILHADO_NAO_USAR'
ASSINADA = (
    f'https://tenant.sharepoint.com/sites/lab/_layouts/15/download.aspx'
    f'?share={TOKEN}&web=1#anchor'
)


class TestLogSemSegredo:
    @pytest.mark.parametrize('url,esperado', [
        ('https://exemplo.com/a/b.xlsx?x=1', 'https://exemplo.com'),
        ('https://exemplo.com:8443/a?x=1', 'https://exemplo.com:8443'),
        ('https://user:senha@exemplo.com/a', 'https://exemplo.com'),
        ('https://exemplo.com', 'https://exemplo.com'),
        ('https://[::1]:8443/x', 'https://::1:8443'),
        ('http://exemplo.com/x', 'http://exemplo.com'),
        ('', '<sem url>'),
        (None, '<sem url>'),
        ('nao-e-url', '<sem host>'),
        ('https:///x', '<sem host>'),
    ])
    def test_representacao_segura(self, legacy_module, url, esperado):
        assert legacy_module._safe_url_for_log(url) == esperado

    def test_representacao_segura_nao_estoura_tamanho(self, legacy_module):
        url = 'https://' + ('a' * 5000) + '.exemplo.com/x?sig=' + TOKEN
        saida = legacy_module._safe_url_for_log(url)
        assert len(saida) < 200
        assert TOKEN not in saida

    def test_url_rejeitada_nao_vaza_token_no_log(
        self, legacy_module, dns_allows, fake_get, logs_de,
    ):
        """Rejeição por SSRF: o log precisa dizer QUAL host recusou, sem o token.

        O host é interno para que a RECUSA aconteça de fato — é este o caminho que
        a revisão apontou.
        """
        rejeitada = f'https://169.254.169.254/latest/meta-data/?sig={TOKEN}'

        legacy_module._parse_spreadsheet(rejeitada)

        assert logs_de, 'a rejeição deveria ser logada'
        texto = ' '.join(m for _, m in logs_de)
        assert TOKEN not in texto
        assert 'sig=' not in texto
        # E o contexto útil sobreviveu: qual host recusou, e por quê.
        # O esperado vem do PRÓPRIO helper, e não de um literal repetido aqui —
        # assim o teste verifica que o log carrega a representação sanitizada de
        # verdade, e não uma segunda cópia que alguém esquece de atualizar.
        assert legacy_module._safe_url_for_log(rejeitada) in texto
        assert 'SSRF' in texto

    def test_falha_no_download_nao_vaza_token_no_log(
        self, legacy_module, dns_allows, fake_get, logs_de,
    ):
        """Falha de rede: mesmo caminho, mesma exigência."""
        fake_get(error=requests_lib.exceptions.ConnectionError(
            f'Max retries exceeded with url: /download.aspx?share={TOKEN}'))

        legacy_module._parse_spreadsheet(ASSINADA)

        texto = ' '.join(m for _, m in logs_de)
        assert TOKEN not in texto
        assert 'share=' not in texto
        assert 'Max retries' not in texto
        assert legacy_module._safe_url_for_log(ASSINADA) in texto

    def test_sucesso_nao_vaza_token_no_log(
        self, legacy_module, dns_allows, fake_get, logs_de, hoje,
    ):
        """O caminho feliz também loga a origem — e também não pode vazar."""
        corpo = _planilha([
            ['Prof. A', 'Resp', 'a@test.com', hoje + timedelta(days=1), '08:00-09:00',
             10, '', '', 'Lab 01'],
        ])
        fake_get(response=FakeResponse(content=corpo))

        legacy_module._parse_spreadsheet(ASSINADA)

        texto = ' '.join(m for _, m in logs_de)
        assert TOKEN not in texto
        assert 'share=' not in texto
        assert legacy_module._safe_url_for_log(ASSINADA) in texto

    def test_erro_do_parser_nao_carrega_o_corpo(
        self, legacy_module, dns_allows, fake_get, logs_de,
    ):
        """O erro do openpyxl vai para o log. Precisa continuar sem o corpo.

        O corpo é o conteúdo de uma planilha possivelmentesigilosa — e o log não
        pode virar o segundo lugar onde ele mora.
        """
        fake_get(response=FakeResponse(content=b'NAO E XLSX ' + TOKEN.encode()))

        legacy_module._parse_spreadsheet(ASSINADA)

        texto = ' '.join(m for _, m in logs_de)
        assert TOKEN not in texto

    def test_nenhum_log_da_planilha_carrega_a_query_string(
        self, legacy_module, dns_allows, fake_get, logs_de, hoje,
    ):
        """Varredura ampla: com uma URL assinada, NENHUMA mensagem logada pode
        conter `?`, `share=`, `sig=` ou o token."""
        fake_get(error=requests_lib.exceptions.Timeout())
        legacy_module._parse_spreadsheet(ASSINADA)

        # E agora um sucesso, para varrer o caminho que loga "carregada".
        fake_get(response=FakeResponse(content=_planilha([
            ['Prof. A', 'Resp', 'a@test.com', hoje + timedelta(days=1), '08:00-09:00',
             10, '', '', 'Lab 01'],
        ])))
        legacy_module._parse_spreadsheet(ASSINADA)

        assert logs_de
        for nivel, msg in logs_de:
            assert TOKEN not in msg, msg
            assert 'share=' not in msg, msg
            assert 'sig=' not in msg, msg


# ═══════════════════════════════════════════════════════════════════════════
# 9. Invariável da avaliação de DNS rebinding
# ═══════════════════════════════════════════════════════════════════════════

class TestNoReadPrimitive:
    """A avaliação de rebinding em `_ext_fetch_source_bytes` se apoia num item:
    o corpo baixado NUNCA volta para quem chamou.

    Se essa invariável cair, o resíduo de rebinding deixa de ser "estreito" e vira
    primitiva de leitura — e a avaliação documentada no código deixa de valer. O
    teste existe para a premissa não se corroer em silêncio.
    """

    def test_sem_primitiva_de_leitura_na_planilha(
        self, legacy_module, dns_allows, fake_get, hoje,
    ):
        # Uma resposta que NÃO é planilha — o caso em que o corpo tem mais chance
        # de escapar para um log ou para a resposta HTTP.
        fake_get(response=FakeResponse(content=b'CONTEUDO SENSIVEL INTERNO'))

        resultado = legacy_module._parse_spreadsheet(VALID_URL)

        # Só as duas listas de reservas, com a forma de sempre.
        assert isinstance(resultado, tuple) and len(resultado) == 2
        assert resultado[0] == [] and resultado[1] == []

        # E uma planilha que PARSEIA: o que volta são linhas de reserva, não bytes.
        fake_get(response=FakeResponse(content=_planilha([
            ['Prof. A', 'Resp', 'a@test.com', hoje + timedelta(days=1), '08:00-09:00',
             10, '', '', 'Lab 01'],
        ])))
        hoje_r, semana = legacy_module._parse_spreadsheet(VALID_URL)
        assert len(semana) == 1
        # Nenhum item da reserva carrega o corpo bruto do download.
        assert 'CONTEUDO' not in repr(semana)

    def test_o_helper_nao_devolve_bytes_para_o_caller_da_planilha(
        self, legacy_module,
    ):
        """O helper devolve bytes — é o contrato dele, e a TV depende disso. O que
        não pode é haver caminho entre esses bytes e a resposta HTTP de reservas."""
        import inspect
        src = inspect.getsource(legacy_module._parse_spreadsheet)
        # `_parse_spreadsheet` não pode devolver `content`.
        assert 'return content' not in src
        assert 'return reservas_hoje, reservas_semana' in src
        # E o corpo só alimenta o openpyxl.
        assert 'load_workbook(BytesIO(content)' in src

    def test_erro_do_fetch_nao_carrega_o_corpo(
        self, legacy_module, dns_allows, fake_get, logs_de,
    ):
        """Um corpo enorme que estoura o teto: o erro é sobre o TAMANHO, nunca
        sobre o conteúdo."""
        limite = legacy_module.SPREADSHEET_MAX_BYTES
        chunk = b'x' * (64 * 1024)
        fake_get(response=FakeResponse(
            chunks=[chunk] * ((limite // len(chunk)) + 2),
        ))

        assert legacy_module._parse_spreadsheet(VALID_URL) == ([], [])

        texto = ' '.join(m for _, m in logs_de)
        assert 'limite' in texto
        assert 'xxxx' not in texto
