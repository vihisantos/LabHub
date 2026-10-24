"""Regressão: o módulo Chamados não executa DDL em runtime.

O schema de `chamados_tickets` / `ticket_events` é criado e mantido pelas
migrations oficiais (`supabase/migrations/`). Os endpoints não devem chamar
`rpc/pg_sql` nem recriar tabelas/colunas em tempo de requisição.

Todos os testes usam mocks/leitura de arquivos; nenhum acessa Supabase remoto.
"""
from __future__ import annotations

import importlib.util
import inspect
import sys
from pathlib import Path

import pytest

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

_MODULE_KEY = "chamados_no_runtime_ddl_api"

# Handlers que chamavam _ensure_chamados_schema() antes desta correção.
CHAMADOS_HANDLERS = (
    "chamados_workspaces",
    "chamados_create",
    "chamados_list",
    "chamados_manage",
    "chamados_reports",
    "chamados_events_list",
    "chamados_events_create",
    "chamados_reports_weekly_email",
    "chamados_photos_purge",
)


@pytest.fixture(scope="session")
def api_module():
    # Reaproveita um módulo já carregado pelos outros testes (reexecutar
    # app.py registraria as mesmas rotas em um Flask já usado).
    for existing in (_MODULE_KEY, "chamados_api", "root_api"):
        mod = sys.modules.get(existing)
        if mod is not None and getattr(mod, "app", None) is not None:
            if Path(getattr(mod, "__file__", "")).resolve() == API_FILE:
                return mod
    spec = importlib.util.spec_from_file_location(_MODULE_KEY, API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[_MODULE_KEY] = mod
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# Código de produção não contém mais o DDL em runtime
# ---------------------------------------------------------------------------


def test_modulo_nao_expoe_helper_nem_sql_de_schema(api_module):
    assert not hasattr(api_module, "_ensure_chamados_schema")
    assert not hasattr(api_module, "CHAMADOS_TABLE_SQL")


def test_fonte_nao_referencia_pg_sql_nem_ddl_de_chamados():
    source = API_FILE.read_text(encoding="utf-8")
    assert "_ensure_chamados_schema" not in source
    assert "CHAMADOS_TABLE_SQL" not in source
    assert "rpc/pg_sql" not in source


@pytest.mark.parametrize("handler_name", CHAMADOS_HANDLERS)
def test_handler_chamados_nao_invoca_ddl_de_schema(api_module, handler_name):
    handler = getattr(api_module, handler_name)
    source = inspect.getsource(handler)
    assert "_ensure_chamados_schema" not in source
    assert "rpc/pg_sql" not in source


# ---------------------------------------------------------------------------
# Comportamento em runtime: endpoint público não faz POST em rpc/pg_sql
# ---------------------------------------------------------------------------


class _FakeResponse:
    ok = True
    status_code = 200
    text = ""
    headers: dict = {}

    def json(self):
        return []


class _RecordingRequests:
    def __init__(self):
        self.calls = []

    def _record(self, method, url, **_kwargs):
        self.calls.append((method, url))
        return _FakeResponse()

    def get(self, url, **kwargs):
        return self._record("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._record("POST", url, **kwargs)

    def patch(self, url, **kwargs):
        return self._record("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self._record("DELETE", url, **kwargs)


def test_workspaces_publico_nao_faz_post_em_pg_sql(api_module, monkeypatch):
    recorder = _RecordingRequests()
    monkeypatch.setattr(api_module, "requests", recorder)
    monkeypatch.setattr(api_module, "_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(api_module, "_SUPABASE_SERVICE_KEY", "test-service-key")

    resp = api_module.app.test_client().get("/api/chamados/workspaces")

    assert resp.status_code == 200
    assert not [
        (method, url)
        for method, url in recorder.calls
        if method == "POST" and "rpc/pg_sql" in url
    ]
    assert not [url for _method, url in recorder.calls if "rpc/pg_sql" in url]


# ---------------------------------------------------------------------------
# Cobertura do schema pelas migrations oficiais
# ---------------------------------------------------------------------------


def test_migracao_000_cobre_schema_de_chamados():
    sql = (MIGRATIONS_DIR / "000_bootstrap_baseline.sql").read_text(encoding="utf-8")

    required = [
        "CREATE TABLE IF NOT EXISTS public.chamados_tickets (",
        '"workspace_id" UUID REFERENCES public.workspaces(id) ON DELETE CASCADE',
        '"assignedToUserId" TEXT DEFAULT \'\'',
        '"ticketNumber" INTEGER NOT NULL DEFAULT 0',
        '"archived" BOOLEAN NOT NULL DEFAULT FALSE',
        '"statusNote" TEXT DEFAULT \'\'',
        '"photos" TEXT DEFAULT \'\'',
        'ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "feedbackRating" INTEGER;',
        'ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "feedbackComment" TEXT DEFAULT \'\';',
        'ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "feedbackAt" TIMESTAMPTZ;',
        "chk_feedback_rating",
        'CHECK ("feedbackRating" IS NULL OR "feedbackRating" BETWEEN 1 AND 5)',
        'CREATE INDEX IF NOT EXISTS idx_chamados_workspace ON public.chamados_tickets("workspace_id");',
        "CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados_tickets(status);",
        "CREATE TABLE IF NOT EXISTS public.ticket_events (",
        'CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON public.ticket_events("ticket_id");',
        "ALTER TABLE public.chamados_tickets ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;",
        "REVOKE ALL ON public.chamados_tickets FROM anon, authenticated, PUBLIC;",
        "REVOKE ALL ON public.ticket_events FROM anon, authenticated, PUBLIC;",
    ]
    for item in required:
        assert item in sql, item


def test_migracao_101_cobre_new_status_dos_eventos():
    sql = (MIGRATIONS_DIR / "101_ticket_events_status_metrics.sql").read_text(encoding="utf-8")
    assert 'ADD COLUMN IF NOT EXISTS "newStatus" TEXT;' in sql
