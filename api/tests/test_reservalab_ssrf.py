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
import json
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

    class _Session:
        """Mock de `requests.Session` que preserva cookies entre requests.

        Colhe o `Set-Cookie` da resposta (como a sessão real faz) e injeta os
        cookies acumulados em cada chamada seguinte — é isso que o teste da
        regressão #349 mede: o cookie do primeiro hop chegar ao segundo.
        """

        def __init__(self, parent):
            self._parent = parent
            self.cookies = {}

        def get(self, url, **kwargs):
            if self.cookies and 'cookies' not in kwargs:
                kwargs['cookies'] = dict(self.cookies)
            resp = self._parent.get(url, **kwargs)
            set_cookie = getattr(resp, 'headers', {}).get('Set-Cookie')
            if set_cookie:
                pair = set_cookie.split(';', 1)[0]
                if '=' in pair:
                    name, _, value = pair.partition('=')
                    self.cookies[name.strip()] = value.strip()
            return resp

        def close(self):
            pass

    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def Session(self):
        return self._Session(self)

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

    def test_redirect_sharepoint_com_cookie_fedauth_preservado(
        self, legacy_module, dns_allows, fake_get,
    ):
        """Regressão #349: o sharing link do SharePoint (?download=1) responde
        302 + Set-Cookie: FedAuth e o segundo hop SÓ responde 200 com esse
        cookie.

        O fetch faz o redirect manualmente (`allow_redirects=False`), então o
        cookie só sobrevive se as chamadas compartilharem uma Session — era
        exatamente isso que faltava quando a cadeia passou a dar 401.
        """
        wb = Workbook()
        ws = wb.active
        ws.title = 'RESERVA LAB. INFORMÁTICA'
        ws.append(['Responsável', 'Professor', 'Email', 'Data', 'Horário',
                   'Alunos', 'Obs', 'x', 'Laboratório'])
        ws.append(['Prof. A', 'Resp', 'a@test.com', '2026-10-10', '08:00-09:00',
                   10, '', '', 'Lab 01'])
        buf = io.BytesIO()
        wb.save(buf)
        xlsx_content = buf.getvalue()

        primeiro_hop = FakeResponse(
            status_code=302,
            headers={
                'Location': 'https://cdn.sharepoint.com/real/arquivo.xlsx',
                'Set-Cookie': 'FedAuth=token123; Secure; HttpOnly; SameSite=None',
            },
        )
        segundo_hop = FakeResponse(content=xlsx_content)
        fake_get(response=[primeiro_hop, segundo_hop])

        content, err = legacy_module._ext_fetch_source_bytes(
            'https://tenant.sharepoint.com/:x:/g/personal/user/IQD5kZPM...?download=1'
        )

        assert err is None
        assert content == xlsx_content

        chamadas = fake_get().calls
        assert len(chamadas) == 2
        assert chamadas[0]['url'].startswith('https://tenant.sharepoint.com/')
        assert 'real/arquivo.xlsx' in chamadas[1]['url']
        # O ponto crítico: o cookie colhido do 302 viaja no segundo request.
        assert chamadas[0].get('cookies') is None
        assert chamadas[1].get('cookies') == {'FedAuth': 'token123'}


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


# #422 — somente erros de acesso definitivos devem disparar o alerta.
@pytest.mark.parametrize("status,expected", [
    (401, True),
    (403, True),
    (404, True),
    (429, False),
    (500, False),
])
def test_status_http_classifica_link_inacessivel_sem_confundir_falha_temporaria(
    legacy_module, status, expected,
):
    erro = f"A fonte respondeu HTTP {status}"
    assert legacy_module._is_spreadsheet_link_access_error(erro) is expected


@pytest.mark.parametrize("erro", [
    "Tempo esgotado ao contatar a fonte",
    "Falha de rede (ConnectionError)",
    "URL inválida ou não permitida (proteção SSRF)",
])
def test_falhas_temporarias_nao_disparam_alerta_de_link_expirado(legacy_module, erro):
    assert legacy_module._is_spreadsheet_link_access_error(erro) is False


def test_resposta_html_de_login_e_classificada_sem_tratar_bytes_genericos_como_link_expirado(legacy_module):
    assert legacy_module._is_spreadsheet_login_response(
        b"<!DOCTYPE html><html><title>Sign in</title></html>"
    ) is True
    assert legacy_module._is_spreadsheet_login_response(b"conteudo invalido") is False
    assert legacy_module._is_spreadsheet_login_response(b"") is False
    assert bytes((80, 75, 3, 4)).startswith(b"PK")


def test_parse_nao_classifica_bytes_invalidos_genericos_como_link_expirado(
    legacy_module, dns_allows, fake_get,
):
    fake_get(response=FakeResponse(content=b"conteudo invalido"))
    legacy_module._parse_spreadsheet(VALID_URL)
    key = legacy_module._spreadsheet_status_key(VALID_URL)
    assert key not in legacy_module._SPREADSHEET_LINK_ERRORS


def test_parse_classifica_html_de_login_como_possivel_problema_de_acesso(
    legacy_module, dns_allows, fake_get,
):
    fake_get(response=FakeResponse(
        content=b"<!DOCTYPE html><html><title>Sign in</title></html>"
    ))
    legacy_module._parse_spreadsheet(VALID_URL)
    key = legacy_module._spreadsheet_status_key(VALID_URL)
    assert "HTML" in legacy_module._SPREADSHEET_LINK_ERRORS[key]


def test_alerta_super_admin_e_deduplicado_e_nao_contem_url_secreta(
    legacy_module, monkeypatch,
):
    calls = []
    class Response:
        ok = True

    monkeypatch.setattr(legacy_module, "_SUPABASE_URL", "https://supabase.example")
    monkeypatch.setattr(legacy_module, "_SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(legacy_module, "redis", None)
    legacy_module._SPREADSHEET_ALERT_ACTIVE.clear()
    monkeypatch.setattr(
        legacy_module.requests, "post",
        lambda *args, **kwargs: (calls.append((args, kwargs)) or Response()),
    )
    try:
        legacy_module._notify_super_admin_spreadsheet_link(
            "piracicaba", "HTTP 403"
        )
        legacy_module._notify_super_admin_spreadsheet_link(
            "piracicaba", "HTTP 403"
        )
        assert len(calls) == 1
        payload = calls[0][1]["json"]
        assert payload["target_super_admin"] is True
        assert payload["target_user_id"] is None
        assert payload["module"] == "reservalab"
        assert "test-service-key" not in repr(payload)
        assert "share=" not in repr(payload)
    finally:
        legacy_module._SPREADSHEET_ALERT_ACTIVE.clear()


# ═══════════════════════════════════════════════════════════════════════════
# 10. #422 — do parse à notificação: o alerta de link inacessível
# ═══════════════════════════════════════════════════════════════════════════
#
# A seção acima prova as PEÇAS: como o classificador decide, como o HTML de
# login é reconhecido, como o alerta é deduplicado. Falta o CAMINHO: planilha
# → erro registrado → notificação criada → incidente resolvido → incidente novo.
#
# Estes testes exercitam `get_reservas()` — a função que a rota `/api/reservas`
# chama — com o download, o Supabase e o Redis substituídos por doubles.
# Nenhum acesso à rede, ao Supabase real ou à planilha da universidade.
#
# Aqui a pergunta não é "o classificador acertou?" (isso já está fixado acima),
# e sim "o super admin é avisado uma vez, do jeito certo, e só quando é
# preciso?"

WORKSPACE_ALERTA = 'piracicaba'
# URL de compartilhamento: carrega token no path/query, como o SharePoint
# gera. O token é FICTÍCIO e existe só para provar que ele não aparece em
# lugar nenhum do alerta.
URL_COMPARTILHAMENTO = (
    'https://tenant.sharepoint.com/:x:/g/personal/user/IQD5kZPM'
    '?share=TOKEN-FICTICIO-123&download=1'
)


class _FakeRespostaJson:
    """Resposta JSON mínima (leitura de workspace no Supabase)."""

    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.ok = 200 <= status_code < 400
        self.headers = {}

    def json(self):
        return self._payload


class FakeRequestsAlerta(FakeRequests):
    """`requests` falso do fluxo do alerta: download, leitura de workspace e POST.

    Herda de `FakeRequests` (mesma mecânica de sessão/cookies e `exceptions`
    REAIS, para que os `except requests.exceptions.…` do código continuem
    funcionando) e acrescenta o roteamento por URL e o registro de POST.

    Falha alto, para que um teste que sairia para a rede falhe em vez de
    passar:
      * GET sem rota mockada ⇒ AssertionError — propaga, porque o download
        só trata `requests.exceptions.…` e o erro chega ao pytest;
      * POST para `/rpc/pg_sql` ⇒ a tentativa é REGISTRADA em `posts_rpc` e
        verificada ao fim do teste (fixture `requests_alerta`). A exceção
        sozinha não serviria: a aplicação engole `Exception` nesse caminho e o
        AssertionError seria absorvido, deixando o teste passar limpo;
      * `post` devolve `post_resposta` (padrão: 200) ou levanta `post_erro`.
    """

    def __init__(self):
        super().__init__()
        self.planilha = None
        self.workspace = None
        self.posts = []
        self.posts_rpc = []
        self.post_resposta = _FakeRespostaJson({})
        self.post_erro = None

    def get(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        if "/rest/v1/workspaces" in url:
            return _FakeRespostaJson([self.workspace] if self.workspace else [])
        if self.planilha is None:
            raise AssertionError(f"sem resposta mockada para {url}")
        return self.planilha

    def post(self, url, **kwargs):
        if "/rpc/pg_sql" in url:
            # Registrar é o que torna o guard eficaz: a exceção pode ser
            # absorvida pela aplicação, o registro não.
            self.posts_rpc.append(url)
            raise AssertionError("teste não pode chamar RPC de escrita no Supabase")
        self.posts.append({"url": url, **kwargs})
        if self.post_erro is not None:
            raise self.post_erro
        return self.post_resposta


class FakeRedisNX:
    """Redis falso com o contrato de `SET ... NX` que o código usa.

    O código chama `redis.set(chave, '1', nx=True)` e trata como "alerta
    criado" apenas as respostas `True`/`'OK'`/`'ok'`/`1`. O `SET NX` real do
    Redis responde `None` quando a chave já existe — é esse contrato que o
    double reproduz.

    LIMITE: isto prova que o código USA a API `SET NX` e decide pelo
    resultado. Não prova o comportamento do Upstash em produção (chave, TTL,
    cluster) — isso é infraestrutura, não código.
    """

    def __init__(self):
        self.store = {}
        self.set_calls = []
        self.deletes = []

    def set(self, key, value, nx=False, ex=None):
        self.set_calls.append({"key": key, "value": value, "nx": nx, "ex": ex})
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    def get(self, key):
        return self.store.get(key)

    def delete(self, key):
        self.deletes.append(key)
        return 1 if self.store.pop(key, None) is not None else 0


@pytest.fixture()
def requests_alerta(legacy_module, monkeypatch):
    """Instala o double de `requests` NO módulo sob teste.

    O patch é por atributo (`legacy_module.requests`), não pela string
    'app.requests': o módulo legado é carregado sob a chave 'reservalab_api'
    pelos testes, e o `api/app.py` importa o MESMO arquivo como 'app' — são
    duas entradas do mesmo arquivo e, em memória, instâncias diferentes.
    Patchar a string pode acertar a instância que o teste não exercita, e
    então o download sairia para a rede de verdade.
    """
    fake = FakeRequestsAlerta()
    monkeypatch.setattr(legacy_module, "requests", fake)
    yield fake

    # A garantia "nenhum teste toca a RPC de escrita" é verificada AQUI, e
    # não pela exceção do mock: a aplicação engole `Exception` nesse caminho
    # (o AssertionError seria absorvido e o teste passaria limpo). O registro
    # não pode ser engolido, então ele é o que reprova o teste.
    # A mensagem traz só a CONTAGEM, para não despejar URL na saída.
    tentativas = len(fake.posts_rpc)
    assert tentativas == 0, (
        "nenhum teste pode chamar a RPC de escrita /rpc/pg_sql "
        f"({tentativas} tentativa(s))"
    )


def _expirar_cache(legacy_module, cache_key):
    """Marca a entrada de cache do workspace como EXPIRADA.

    A entrada gravada pela aplicação (`{'data': ..., 'timestamp': ...}`) é
    reescrita com `timestamp = 0` — que está sempre no passado. O cache se
    comporta como expirado sem depender de `CACHE_TTL` (constante interna da
    produção), sem relógio e sem espera: o resultado é determinístico.

    Os dois backends da aplicação são tratados. Com Redis configurado,
    `set_cached_reservas` grava nos dois e `get_cached_reservas` consulta o
    Redis primeiro e o arquivo depois — então os dois precisam estar
    expirados, senão o arquivo ainda atenderia a chamada.
    """
    chave_redis = f'cache:{cache_key}'
    redis = getattr(legacy_module, 'redis', None)
    if redis is not None:
        try:
            bruto = redis.get(chave_redis)
        except Exception:
            bruto = None
        if bruto:
            dados = json.loads(bruto)
            dados['timestamp'] = 0
            redis.set(chave_redis, json.dumps(dados))
    caminho = Path(legacy_module._cache_path(cache_key))
    if caminho.exists():
        dados = json.loads(caminho.read_text(encoding='utf-8'))
        dados['timestamp'] = 0
        caminho.write_text(json.dumps(dados), encoding='utf-8')


@pytest.fixture()
def _ambiente_do_alerta(legacy_module, monkeypatch, tmp_path):
    """Zera os estados globais do alerta, isola o cache em disco e desliga o Redis.

    Os estados do alerta são globais de um módulo de sessão: sem esta limpeza,
    um teste deixa resíduo para o próximo e a ordem de execução passa a
    importar. O estado anterior é restaurado no fim, para não afetar os
    demais testes do arquivo.
    """
    nomes = (
        '_SPREADSHEET_LINK_ERRORS',
        '_SPREADSHEET_LINK_SUCCESSES',
        '_SPREADSHEET_WORKSPACE_STATUS_KEYS',
        '_SPREADSHEET_ALERT_ACTIVE',
    )
    estado = {nome: getattr(legacy_module, nome) for nome in nomes}
    copia = {
        nome: (set(valor) if isinstance(valor, set) else dict(valor))
        for nome, valor in estado.items()
    }
    for valor in estado.values():
        valor.clear()

    monkeypatch.setattr(legacy_module, 'redis', None)
    monkeypatch.setattr(
        legacy_module, '_cache_path',
        lambda key: str(tmp_path / f'.cache_{key}.json'),
    )
    monkeypatch.setattr(legacy_module, '_SUPABASE_URL', 'https://supabase.example')
    monkeypatch.setattr(legacy_module, '_SUPABASE_SERVICE_KEY', 'test-service-key')

    yield

    for nome, valor in estado.items():
        valor.clear()
        valor.update(copia[nome])


@pytest.fixture()
def alerta_limpo(_ambiente_do_alerta, legacy_module, monkeypatch):
    """Ambiente do alerta em que o cache NUNCA atende (cache expirado).

    O cache expirado é simulado reescrevendo o `timestamp` da entrada gravada
    (ver `_expirar_cache`) — e não zerando `CACHE_TTL`. `CACHE_TTL` é uma
    constante interna da produção: zerá-la acopla o teste a esse detalhe e
    quebraria sozinho se a forma de checar a expiração mudasse. Com
    `timestamp = 0` o cache está sempre no passado — determinístico, sem
    relógio e sem espera artificial.

    O efeito é o que os testes do alerta precisam: cada chamada re-consulta a
    planilha, como na vida real depois que o cache expira.
    """
    gravar_cache = legacy_module.set_cached_reservas

    def _grava_cache_expirado(cache_key, data):
        gravar_cache(cache_key, data)
        _expirar_cache(legacy_module, cache_key)

    monkeypatch.setattr(legacy_module, 'set_cached_reservas', _grava_cache_expirado)


@pytest.fixture()
def alerta_cache_quente(_ambiente_do_alerta):
    """Ambiente do alerta em que o cache VALE (gravação e validade de produção).

    Usado pelo cenário de cache quente: aqui a entrada gravada é a real e a
    validade é a de produção (`CACHE_TTL` > 0). Se a produção passar a
    expirar o cache imediatamente, esse teste falha de forma explícita — que
    é o comportamento correto para um teste que fixa "enquanto o cache vale,
    a planilha não é re-consultada".
    """


# ── A: planilha válida não gera alerta ──────────────────────────────────────

def test_planilha_valida_nao_gera_alerta_de_link_inacessivel(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, hoje,
):
    """Cenário A: XLSX válido ⇒ parse bem-sucedido, sem erro e sem notificação.

    O falso positivo é o pior defeito possível aqui: um alerta por planilha
    sadia spammando o super admin com incidentes que não existem.
    """
    corpo = _planilha([
        ['Prof. A', 'Responsável A', 'a@test.com', hoje + timedelta(days=1),
         '08:00-10:00', 30, 'Uso de aula', '', 'Lab 01 e 02'],
    ])
    requests_alerta.planilha = FakeResponse(content=corpo)

    hoje_r, semana = legacy_module.get_reservas(
        WORKSPACE_ALERTA,
        spreadsheet_url=URL_COMPARTILHAMENTO,
        lab_count=2,
    )

    assert len(hoje_r) + len(semana) == 1, "a planilha válida tem de produzir reservas"
    status_key = legacy_module._spreadsheet_status_key(URL_COMPARTILHAMENTO)
    assert status_key not in legacy_module._SPREADSHEET_LINK_ERRORS
    assert requests_alerta.posts == [], "planilha válida não pode gerar notificação"


# ── B: 401/403/404 → um alerta por incidente ────────────────────────────────

@pytest.mark.parametrize("status", [401, 403, 404])
def test_status_de_acesso_gera_um_unico_alerta_para_o_super_admin(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, status,
):
    """Cenário B: 401/403/404 ⇒ alerta de link inacessível, UMA vez por incidente.

    Exercita o CAMINHO inteiro: download → classificação → registro do erro →
    notificação. Três chamadas durante o mesmo incidente, uma notificação só.
    """
    requests_alerta.planilha = FakeResponse(status_code=status)

    for _ in range(3):
        legacy_module.get_reservas(
            WORKSPACE_ALERTA,
            spreadsheet_url=URL_COMPARTILHAMENTO,
            lab_count=2,
        )

    assert len(requests_alerta.posts) == 1, (
        "o mesmo incidente não pode gerar alertas duplicados"
    )

    post = requests_alerta.posts[0]
    payload = post["json"]
    assert post["url"].endswith("/rest/v1/app_notifications")
    assert payload["target_super_admin"] is True
    assert payload["target_user_id"] is None
    assert payload["workspace_id"] is None
    assert payload["module"] == "reservalab"
    assert payload["severity"] == "critical"
    assert payload["action_url"] == "/admin/workspaces"
    assert f"HTTP {status}" in payload["body"]
    assert WORKSPACE_ALERTA in payload["body"]
    # A URL da planilha carrega token de compartilhamento: ela não pode
    # aparecer em nenhum campo do alerta.
    assert "TOKEN-FICTICIO-123" not in repr(payload)
    assert URL_COMPARTILHAMENTO not in repr(payload)


def test_rota_reservas_dispara_o_alerta_de_link_inacessivel(
    legacy_module, dns_allows, requests_alerta, alerta_limpo,
):
    """Cenário B (ponta a ponta): a rota pública `/api/reservas` aciona o alerta.

    É a prova de que o alerta não depende de alguém chamar a função interna:
    o caminho é rota → planilha → erro → notificação.
    """
    requests_alerta.workspace = {
        'spreadsheet_url': URL_COMPARTILHAMENTO,
        'lab_count': 2,
    }
    requests_alerta.planilha = FakeResponse(status_code=403)

    cliente = legacy_module.app.test_client()
    resp = cliente.get(f'/api/reservas?workspace={WORKSPACE_ALERTA}')

    assert resp.status_code == 200
    assert len(requests_alerta.posts) == 1
    assert requests_alerta.posts[0]["json"]["target_super_admin"] is True


# ── D: HTTP 200 com HTML de autenticação ────────────────────────────────────

# As três formas que o classificador de login reconhece.
#
# O que cada uma exercita DE FATO em `_is_spreadsheet_login_response` — cujas
# condições são `startswith('<!doctype html')`, `startswith('<html')` e
# `'<html' in sample[:512]`, nessa ordem:
#   * a 1ª (doctype) satisfaz a 1ª condição;
#   * a 2ª (`<html>` no início) satisfaz a 2ª E a 3ª condição;
#   * a 3ª (`<html>` só depois do redirect) satisfaz SOMENTE a 3ª.
#
# Ou seja: a 2ª condição é logicamente implicada pela 3ª (se o sample começa
# com `<html`, então `<html` está nos primeiros 512 bytes) — a variante do
# meio não a exercita sozinha. Isso é redundância da IMPLEMENTAÇÃO, não
# lacuna de cobertura: o que este bloco fixa é o comportamento observável
# (todo HTML de login é sinalizado), não a forma interna do classificador.
HTML_DE_LOGIN = [
    # começa com doctype
    b'<!DOCTYPE html><html><head><title>Sign in</title></head></html>',
    # começa com <html>
    b'<html lang="pt-BR"><head><title>Entrar</title></head><body>Login</body></html>',
    # o <html> só aparece depois de um redirecionamento em JS
    b'Redirecting to sign in... <html><body>Acesso negado</body></html>',
]


@pytest.mark.parametrize("conteudo", HTML_DE_LOGIN)
def test_html_de_autenticacao_e_sinalizado_sem_vazar_a_url_de_compartilhamento(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, conteudo,
):
    """Cenário D: HTTP 200 com HTML de login ⇒ possível problema de acesso.

    O SharePoint devolve HTML de login com status 200 quando o link de
    compartilhamento perdeu a sessão. Isso é sinal de acesso, não bytes
    inválidos — mas o alerta não pode carregar a URL, que é o segredo.
    """
    requests_alerta.planilha = FakeResponse(content=conteudo)

    legacy_module.get_reservas(
        WORKSPACE_ALERTA,
        spreadsheet_url=URL_COMPARTILHAMENTO,
        lab_count=2,
    )

    assert len(requests_alerta.posts) == 1
    payload = requests_alerta.posts[0]["json"]
    assert payload["target_super_admin"] is True
    assert "HTML" in payload["body"]
    # O segredo é a URL de compartilhamento: ela não pode aparecer em NENHUM
    # campo do payload. O `repr` do payload inteiro cobre todos os campos de
    # uma vez (inclusive `title` e `body`) — um vazamento em qualquer outro
    # campo também reprova o teste, e não só em `title`/`body`.
    repr_payload = repr(payload)
    assert "TOKEN-FICTICIO-123" not in repr_payload
    assert "share=" not in repr_payload
    assert "tenant.sharepoint.com" not in repr_payload
    assert URL_COMPARTILHAMENTO not in repr_payload


def test_resposta_nao_xlsx_sem_marca_de_login_nao_gera_alerta(
    legacy_module, dns_allows, requests_alerta, alerta_limpo,
):
    """Fronteira do cenário D: erro genérico da fonte NÃO é problema de acesso.

    Nem toda resposta que não é XLSX é tela de login. Um erro genérico não
    prova que o link de compartilhamento expirou, e alertar aqui seria alarme
    falso. Este teste fixa a fronteira do que o classificador considera
    "evidência de acesso".
    """
    requests_alerta.planilha = FakeResponse(
        content=b'{"erro":"planilha nao encontrada"}'
    )

    legacy_module.get_reservas(
        WORKSPACE_ALERTA,
        spreadsheet_url=URL_COMPARTILHAMENTO,
        lab_count=2,
    )

    assert requests_alerta.posts == [], (
        "erro genérico da fonte não prova problema de acesso ao link"
    )
    status_key = legacy_module._spreadsheet_status_key(URL_COMPARTILHAMENTO)
    assert status_key not in legacy_module._SPREADSHEET_LINK_ERRORS


# ── F: deduplicação via Redis ───────────────────────────────────────────────

def test_redis_set_nx_bem_sucedido_cria_o_alerta(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, monkeypatch,
):
    """Cenário F: com Redis, o `SET NX` bem-sucedido é o que autoriza o alerta."""
    redis_falso = FakeRedisNX()
    monkeypatch.setattr(legacy_module, 'redis', redis_falso)
    requests_alerta.planilha = FakeResponse(status_code=403)

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )

    assert len(requests_alerta.posts) == 1
    chave = legacy_module._spreadsheet_alert_key(WORKSPACE_ALERTA)
    chamadas = [c for c in redis_falso.set_calls if c["key"] == chave]
    assert chamadas, "a chave do alerta tem de ser reservada no Redis"
    assert all(c["nx"] is True for c in chamadas), (
        "a reserva tem de ser NX — sobrescrever quebraria a deduplicação"
    )
    assert chave in redis_falso.store


def test_redis_com_chave_existente_nao_cria_nova_notificacao(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, monkeypatch,
):
    """Cenário F: a chave já reservada (incidente em curso) ⇒ nada de novo."""
    redis_falso = FakeRedisNX()
    chave = legacy_module._spreadsheet_alert_key(WORKSPACE_ALERTA)
    redis_falso.store[chave] = '1'
    monkeypatch.setattr(legacy_module, 'redis', redis_falso)
    requests_alerta.planilha = FakeResponse(status_code=403)

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )

    assert requests_alerta.posts == [], (
        "incidente em curso não pode gerar nova notificação"
    )


def test_dedup_entre_instancias_que_compartilham_o_mesmo_redis(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, monkeypatch,
):
    """Cenário F: duas instâncias (memórias locais distintas), um Redis.

    Em serverless cada instância tem a sua própria memória, que se perde a
    cada cold start. A deduplicação ENTRE instâncias só existe se o Redis for
    o árbitro — é isso que este teste fixa.
    """
    redis_falso = FakeRedisNX()
    monkeypatch.setattr(legacy_module, 'redis', redis_falso)
    requests_alerta.planilha = FakeResponse(status_code=403)

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )
    assert len(requests_alerta.posts) == 1

    # "Nova instância": a memória local vai-se embora, o Redis não.
    legacy_module._SPREADSHEET_ALERT_ACTIVE.clear()

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )
    assert len(requests_alerta.posts) == 1, (
        "sem o Redis como árbitro, o mesmo incidente geraria notificações "
        "repetidas a cada instância"
    )


# ── G: recuperação e novo incidente ─────────────────────────────────────────

def test_recuperacao_limpa_o_alerta_e_permite_um_novo_incidente(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, monkeypatch, hoje,
):
    """Cenário G: a planilha volta ⇒ o estado do alerta é limpo e o próximo
    incidente pode alertar de novo.

    Sem a limpeza, o segundo incidente do mesmo workspace passaria
    despercebido: o sistema acreditaria que já tinha avisado.
    """
    redis_falso = FakeRedisNX()
    monkeypatch.setattr(legacy_module, 'redis', redis_falso)
    chave = legacy_module._spreadsheet_alert_key(WORKSPACE_ALERTA)

    # 1. incidente
    requests_alerta.planilha = FakeResponse(status_code=403)
    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )
    assert len(requests_alerta.posts) == 1
    assert chave in redis_falso.store

    # 2. recuperação: a planilha volta a responder
    corpo = _planilha([
        ['Prof. A', 'Resp', 'a@test.com', hoje + timedelta(days=1),
         '08:00-09:00', 10, '', '', 'Lab 01'],
    ])
    requests_alerta.planilha = FakeResponse(content=corpo)
    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )

    assert chave in redis_falso.deletes, (
        "a recuperação tem de liberar a chave no Redis"
    )
    assert chave not in redis_falso.store
    assert chave not in legacy_module._SPREADSHEET_ALERT_ACTIVE
    status_key = legacy_module._spreadsheet_status_key(URL_COMPARTILHAMENTO)
    assert status_key not in legacy_module._SPREADSHEET_LINK_ERRORS

    # 3. novo incidente
    requests_alerta.planilha = FakeResponse(status_code=403)
    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )

    assert len(requests_alerta.posts) == 2, (
        "um incidente novo tem de poder alertar de novo"
    )


def test_com_cache_quente_o_alerta_permanece_ativo_sem_novo_parse(
    legacy_module, dns_allows, requests_alerta, alerta_cache_quente,
):
    """Comportamento real: enquanto o cache vale, a planilha não é re-consultada.

    `get_reservas` serve o cache antes de qualquer parse. Com o cache quente,
    a segunda chamada NÃO re-consulta a planilha e o estado do alerta não é
    limpo — a recuperação só é percebida quando o cache expira.

    Este teste fixa esse comportamento para que uma mudança nele, se vier,
    seja deliberada (e não efeito colateral).
    """
    requests_alerta.planilha = FakeResponse(status_code=403)

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )
    assert len(requests_alerta.posts) == 1
    downloads = len(requests_alerta.calls)
    chave = legacy_module._spreadsheet_alert_key(WORKSPACE_ALERTA)
    assert chave in legacy_module._SPREADSHEET_ALERT_ACTIVE

    # Segunda chamada com o cache ainda válido: nenhum download novo.
    requests_alerta.planilha = FakeResponse(content=b'PK\x03\x04qualquer-coisa')
    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )

    assert len(requests_alerta.calls) == downloads, (
        "com o cache quente a planilha não deve ser re-consultada"
    )
    assert len(requests_alerta.posts) == 1
    # O cache quente serviu a resposta: o alerta segue ATIVO. A chave não foi
    # liberada (o caminho de cache retorna antes de `_clear_spreadsheet_link_
    # alert`), e nenhuma notificação nova foi disparada.
    assert chave in legacy_module._SPREADSHEET_ALERT_ACTIVE, (
        "com o cache quente o alerta tem de continuar ativo — a recuperação só "
        "é percebida quando o cache expira"
    )


# ── I: falha ao persistir a notificação ─────────────────────────────────────

def test_falha_http_ao_persistir_o_alerta_libera_a_tentativa_seguinte(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, logs_de,
):
    """Cenário I: o Supabase recusa o alerta ⇒ dedup liberado, nova tentativa.

    Sem liberar o dedup, um incidente cujo alerta falhou ao ser gravado ficaria
    mudo para sempre: o sistema acreditaria que já avisou.

    O que existe é a LIBERAÇÃO do dedup — não há retry automático. A tentativa
    seguinte acontece porque a próxima chamada re-entra na notificação.
    """
    requests_alerta.planilha = FakeResponse(status_code=403)
    requests_alerta.post_resposta = _FakeRespostaJson({}, status_code=500)

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )

    assert len(requests_alerta.posts) == 1
    chave = legacy_module._spreadsheet_alert_key(WORKSPACE_ALERTA)
    assert chave not in legacy_module._SPREADSHEET_ALERT_ACTIVE, (
        "o dedup tem de ser liberado quando a gravação falha"
    )
    erros = [msg for nivel, msg in logs_de if nivel == 'error']
    assert any('persistir' in msg for msg in erros), (
        "a falha tem de ficar registrada — não pode passar como sucesso"
    )

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )
    assert len(requests_alerta.posts) == 2, "a chamada seguinte tem de tentar de novo"


def test_excecao_de_rede_ao_persistir_o_alerta_tambem_libera_a_tentativa(
    legacy_module, dns_allows, requests_alerta, alerta_limpo, logs_de,
):
    """Cenário I: a rede cai no meio da gravação ⇒ o mesmo caminho de limpeza."""
    requests_alerta.planilha = FakeResponse(status_code=403)
    requests_alerta.post_erro = requests_lib.exceptions.ConnectionError('sem rede')

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )

    assert len(requests_alerta.posts) == 1
    chave = legacy_module._spreadsheet_alert_key(WORKSPACE_ALERTA)
    assert chave not in legacy_module._SPREADSHEET_ALERT_ACTIVE
    erros = [msg for nivel, msg in logs_de if nivel == 'error']
    assert any('persistir' in msg for msg in erros), (
        "a falha tem de ficar registrada — não pode passar como sucesso"
    )

    legacy_module.get_reservas(
        WORKSPACE_ALERTA, spreadsheet_url=URL_COMPARTILHAMENTO, lab_count=2,
    )
    assert len(requests_alerta.posts) == 2


