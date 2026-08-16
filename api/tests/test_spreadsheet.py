import importlib.util
import sys
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path

import pytest
from openpyxl import Workbook

API_FILE = Path(__file__).resolve().parents[2] / 'src' / 'apps' / 'reservalab' / 'api' / 'app.py'


class FakeDownloadResponse:
    """Resposta HTTP fake do download da planilha (só o que o parser usa)."""

    def __init__(self, content: bytes):
        self.content = content

    def raise_for_status(self):
        return None


def _make_workbook(today: date) -> bytes:
    """Monta uma planilha no formato real ('RESERVA LAB. INFORMÁTICA')."""
    wb = Workbook()
    ws = wb.active
    ws.title = 'RESERVA LAB. INFORMÁTICA'
    ws.append(['Reserva feita por', 'Professor', 'Email', 'Data', 'Horário', 'Alunos', 'Obs', '', 'Lab'])
    ws.append(['Maria', 'Prof. A', 'a@x', today, '07h30', 30, 'Aula prática', None, 'Lab 01'])
    ws.append(['João', 'Prof. B', 'b@x', today + timedelta(days=3), '09h20', 25, 'Prova', None, 'Lab 01 e 02'])
    ws.append(['Ana', 'Prof. C', 'c@x', today + timedelta(days=10), '10h00', 10, '', None, 'Lab 02'])
    ws.append(['Sem data', 'Prof. D', 'd@x', None, '11h00', 5, '', None, 'Lab 01'])
    ws.append(['Carlos', 'Prof. E', 'e@x', '2026-06-27', '13h30', 20, '', None, 'Lab 02'])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture(scope='session')
def spread_module():
    spec = importlib.util.spec_from_file_location('reservalab_spreadsheet', API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['reservalab_spreadsheet'] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def cache_isolado(spread_module, monkeypatch, tmp_path):
    """Cache em arquivo num diretório temporário e Redis desligado (testes herméticos)."""
    monkeypatch.setattr(spread_module, 'redis', None)
    monkeypatch.setattr(spread_module, '_cache_path', lambda key: str(tmp_path / f'.cache_{key}.json'))
    return spread_module


def _route_download(spread_module, monkeypatch, workbook_bytes):
    def fake_get(url, timeout=30):
        return FakeDownloadResponse(workbook_bytes)
    monkeypatch.setattr(spread_module, 'requests', type('FakeRequests', (), {'get': staticmethod(fake_get)})())


# ── Parser da planilha ──


def test_parse_spreadsheet_filtra_hoje_e_semana(spread_module, monkeypatch):
    today = date(2026, 6, 25)
    monkeypatch.setattr(spread_module, 'get_today_sp', lambda: today)
    _route_download(spread_module, monkeypatch, _make_workbook(today))

    reservas_hoje, reservas_semana = spread_module._parse_spreadsheet('https://sharepoint/fake.xlsx')

    assert len(reservas_hoje) == 1
    assert reservas_hoje[0]['responsavel'] == 'Prof. A'
    assert reservas_hoje[0]['data'] == today
    assert reservas_hoje[0]['labs'] == ['LAB01']
    assert reservas_hoje[0]['origem'] == 'planilha'

    # Semana: hoje < data <= hoje+7 (exclui a de +10 dias e a sem data)
    assert len(reservas_semana) == 2
    profs = {r['responsavel'] for r in reservas_semana}
    assert profs == {'Prof. B', 'Prof. E'}
    # "Lab 01 e 02" vira os dois labs; data em string também é aceita
    joao = next(r for r in reservas_semana if r['responsavel'] == 'Prof. B')
    assert joao['labs'] == ['LAB01', 'LAB02']
    carlos = next(r for r in reservas_semana if r['responsavel'] == 'Prof. E')
    assert carlos['data'] == date(2026, 6, 27)


def test_parse_spreadsheet_planilha_invalida_retorna_vazio(spread_module, monkeypatch):
    def fake_get(url, timeout=30):
        return FakeDownloadResponse(b'nao-e-um-xlsx')
    monkeypatch.setattr(spread_module, 'requests', type('FakeRequests', (), {'get': staticmethod(fake_get)})())

    reservas_hoje, reservas_semana = spread_module._parse_spreadsheet('https://sharepoint/fake.xlsx')
    assert reservas_hoje == []
    assert reservas_semana == []


def test_parse_spreadsheet_sem_url_retorna_vazio(spread_module):
    reservas_hoje, reservas_semana = spread_module._parse_spreadsheet('')
    assert reservas_hoje == []
    assert reservas_semana == []


# ── Cache por workspace (bug: cache global cruzava campi) ──


def test_cache_por_workspace_nao_vaza_entre_campi(cache_isolado, monkeypatch):
    calls = []

    def fake_parse(url, lab_count=2):
        calls.append(url)
        idx = len(calls)
        return ([{'lab': f'LAB{idx}', 'labs': ['LAB01']}], [])

    monkeypatch.setattr(cache_isolado, '_parse_spreadsheet', fake_parse)
    monkeypatch.setattr(cache_isolado, '_get_workspace_spreadsheet_url', lambda slug: f'http://planilha/{slug}.xlsx')

    r1 = cache_isolado.get_reservas('ws-a')
    r2 = cache_isolado.get_reservas('ws-a')
    r3 = cache_isolado.get_reservas('ws-b')

    # ws-a: parse só na primeira chamada (cache da 2ª; tupla vira lista no round-trip)
    assert len(calls) == 2
    assert list(r1) == r2
    assert calls[0] == 'http://planilha/ws-a.xlsx'
    # ws-b parseia a própria planilha, não recebe o cache de ws-a
    assert calls[1] == 'http://planilha/ws-b.xlsx'
    assert r3[0][0]['lab'] == 'LAB2'


def test_cache_default_separado_do_cache_por_workspace(cache_isolado, monkeypatch):
    calls = []

    def fake_parse(url, lab_count=2):
        calls.append(url)
        return ([], [])

    monkeypatch.setattr(cache_isolado, '_parse_spreadsheet', fake_parse)
    monkeypatch.setattr(cache_isolado, '_get_workspace_spreadsheet_url', lambda slug: None)

    cache_isolado.get_reservas(None)
    cache_isolado.get_reservas('ws-a')

    # fallback (None) e workspace usam chaves diferentes → parse acontece 2x
    assert len(calls) == 2


# ── GET /api/reservas ──


def test_api_reservas_formata_data_e_labs(cache_isolado, monkeypatch):
    from datetime import date as dt

    def fake_parse(url, lab_count=2):
        return (
            [{'labs': ['LAB01'], 'data': dt(2026, 6, 25), 'horario': '07h30', 'responsavel': 'Prof. A'}],
            [],
        )

    monkeypatch.setattr(cache_isolado, '_parse_spreadsheet', fake_parse)
    monkeypatch.setattr(cache_isolado, '_get_workspace_spreadsheet_url', lambda slug: None)

    client = cache_isolado.app.test_client()
    resp = client.get('/api/reservas?workspace=ws-a')

    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body['lab1_reservas']) == 1
    assert body['lab1_reservas'][0]['data'] == '25/06/2026'
    assert 'data' in body and 'cache_info' in body


def test_api_reservas_indica_planilha_do_workspace(cache_isolado, monkeypatch):
    monkeypatch.setattr(cache_isolado, '_parse_spreadsheet', lambda url, lab_count=2: ([], []))
    monkeypatch.setattr(cache_isolado, '_get_workspace_spreadsheet_url', lambda slug: 'http://planilha/ws-a.xlsx')

    client = cache_isolado.app.test_client()
    resp = client.get('/api/reservas?workspace=ws-a')

    assert resp.status_code == 200
    assert resp.get_json()['spreadsheet'] == 'workspace'


def test_api_reservas_sem_planilha_indica_missing(cache_isolado, monkeypatch):
    monkeypatch.setattr(cache_isolado, '_parse_spreadsheet', lambda url, lab_count=2: ([], []))
    monkeypatch.setattr(cache_isolado, '_get_workspace_spreadsheet_url', lambda slug: None)
    monkeypatch.setattr(cache_isolado, 'ARQUIVO_URL', '')

    client = cache_isolado.app.test_client()
    resp = client.get('/api/reservas?workspace=ws-a')

    assert resp.status_code == 200
    assert resp.get_json()['spreadsheet'] == 'missing'


def test_api_reservas_sem_planilha_do_workspace_usa_fallback(cache_isolado, monkeypatch):
    monkeypatch.setattr(cache_isolado, '_parse_spreadsheet', lambda url, lab_count=2: ([], []))
    monkeypatch.setattr(cache_isolado, '_get_workspace_spreadsheet_url', lambda slug: None)
    monkeypatch.setattr(cache_isolado, 'ARQUIVO_URL', 'http://fallback/global.xlsx')

    client = cache_isolado.app.test_client()
    resp = client.get('/api/reservas?workspace=ws-a')

    assert resp.status_code == 200
    assert resp.get_json()['spreadsheet'] == 'fallback'


# ── Quantidade de labs por workspace (lab_count) ──


def test_extract_labs_respeita_o_lab_count(spread_module):
    # Campus com 3 labs: "Lab 01 e 03" vira os dois; "Lab 10" e "Lab 04" ficam de fora
    labs = spread_module._extract_labs('Lab 01 e 03', 3)
    assert labs == ['LAB01', 'LAB03']

    # Campus com 10 labs: Lab 10 entra
    assert spread_module._extract_labs('Lab 10', 10) == ['LAB10']
    # Campus com 2 labs: Lab 10 é ignorado (não existe)
    assert spread_module._extract_labs('Lab 10', 2) == []


def test_extract_labs_variacoes(spread_module):
    assert spread_module._extract_labs('LAB 1', 2) == ['LAB01']
    assert spread_module._extract_labs('01/02', 2) == ['LAB01', 'LAB02']
    assert spread_module._extract_labs('Lab 01 e 02', 2) == ['LAB01', 'LAB02']
    assert spread_module._extract_labs('', 2) == []


def test_parse_spreadsheet_respeita_lab_count(spread_module, monkeypatch):
    today = date(2026, 6, 25)
    monkeypatch.setattr(spread_module, 'get_today_sp', lambda: today)

    def make_workbook_with_lab03():
        wb = Workbook()
        ws = wb.active
        ws.title = 'RESERVA LAB. INFORMÁTICA'
        ws.append(['Reserva feita por', 'Professor', 'Email', 'Data', 'Horário', 'Alunos', 'Obs', '', 'Lab'])
        ws.append(['Maria', 'Prof. A', 'a@x', today, '07h30', 30, 'Aula', None, 'Lab 03'])
        ws.append(['João', 'Prof. B', 'b@x', today, '09h20', 25, '', None, 'Lab 01 e 03'])
        buf = BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def fake_get(url, timeout=30):
        return FakeDownloadResponse(make_workbook_with_lab03())
    monkeypatch.setattr(spread_module, 'requests', type('FakeRequests', (), {'get': staticmethod(fake_get)})())

    # Campus com 2 labs: "Lab 03" fica sem bucket (labs []) e "Lab 01 e 03" vira só LAB01
    hoje2, _ = spread_module._parse_spreadsheet('https://x/fake.xlsx', lab_count=2)
    assert len(hoje2) == 2
    labs2 = {r['responsavel']: r['labs'] for r in hoje2}
    assert labs2['Prof. A'] == []
    assert labs2['Prof. B'] == ['LAB01']

    # Campus com 3 labs: os dois entram
    hoje3, _ = spread_module._parse_spreadsheet('https://x/fake.xlsx', lab_count=3)
    assert len(hoje3) == 2
    labs03 = {r['responsavel']: r['labs'] for r in hoje3}
    assert labs03['Prof. A'] == ['LAB03']
    assert labs03['Prof. B'] == ['LAB01', 'LAB03']


def test_api_reservas_retorna_lab_reservas_e_lab_count(cache_isolado, monkeypatch):
    monkeypatch.setattr(cache_isolado, '_get_workspace_spreadsheet_url', lambda slug: 'http://planilha/ws-a.xlsx')
    monkeypatch.setattr(cache_isolado, '_get_workspace_lab_count', lambda slug: 3)

    def fake_parse(url, lab_count=2):
        return (
            [
                {'labs': ['LAB02'], 'data': date(2026, 6, 25), 'horario': '07h30', 'responsavel': 'Prof. A'},
                {'labs': ['LAB01', 'LAB03'], 'data': date(2026, 6, 25), 'horario': '09h20', 'responsavel': 'Prof. B'},
            ],
            [],
        )

    monkeypatch.setattr(cache_isolado, '_parse_spreadsheet', fake_parse)

    client = cache_isolado.app.test_client()
    resp = client.get('/api/reservas?workspace=ws-a')
    assert resp.status_code == 200
    body = resp.get_json()

    assert body['lab_count'] == 3
    assert body['labs'] == ['LAB01', 'LAB02', 'LAB03']
    assert set(body['lab_reservas'].keys()) == {'LAB01', 'LAB02', 'LAB03'}
    assert len(body['lab_reservas']['LAB03']) == 1
    # Compat: lab1/lab2 continuam presentes
    assert len(body['lab1_reservas']) == 1
    assert len(body['lab2_reservas']) == 1
