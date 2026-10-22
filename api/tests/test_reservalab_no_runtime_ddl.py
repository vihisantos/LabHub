"""Testes de regressão: confirmar que _ensure_workspaces_lab_count() e
_ensure_stock_schema() NÃO executam chamadas HTTP para rpc/pg_sql.

Todos os testes usam mocks; nenhum acessa Supabase remoto.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

# Carrega o módulo legado do ReservaLab da mesma forma que o fixture
# `legacy_module` do arquivo test_reservalab_ssrf.py, para garantir que o
# `fake_get` monkeypatche o mesmo objeto que estes testes usam, evitando
# contaminação de sys.modules entre arquivos de teste.
_RESERVALAB_API = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"
_KEY = "reservalab_api_no_runtime_ddl"

if _KEY in sys.modules:
    reservalab_app = sys.modules[_KEY]
else:
    _spec = importlib.util.spec_from_file_location(_KEY, _RESERVALAB_API)
    reservalab_app = importlib.util.module_from_spec(_spec)
    sys.modules[_KEY] = reservalab_app
    # Registra também como "app", chave que o fixture fake_get do SSRF usa
    # para monkeypatchar requests, garantindo que ambos vejam o mesmo objeto.
    sys.modules.setdefault("app", reservalab_app)
    _spec.loader.exec_module(reservalab_app)


# ---------------------------------------------------------------------------
# _ensure_workspaces_lab_count()
# ---------------------------------------------------------------------------


def test_ensure_workspaces_lab_count_does_not_call_pg_sql():
    """_ensure_workspaces_lab_count() deve ser no-op e não chamar requests.post."""
    with patch.object(reservalab_app.requests, "post") as mock_post:
        reservalab_app._ensure_workspaces_lab_count()
        mock_post.assert_not_called()


def test_ensure_workspaces_lab_count_without_credentials_does_not_call_pg_sql():
    """Sem SUPABASE_URL/SERVICE_KEY, não deve nem entrar no caminho de rede."""
    with patch.object(reservalab_app, "_SUPABASE_URL", ""):
        with patch.object(reservalab_app.requests, "post") as mock_post:
            reservalab_app._ensure_workspaces_lab_count()
            mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# _ensure_stock_schema()
# ---------------------------------------------------------------------------


def test_ensure_stock_schema_does_not_call_pg_sql():
    """_ensure_stock_schema() deve ser no-op e não chamar requests.post."""
    with patch.object(reservalab_app.requests, "post") as mock_post:
        reservalab_app._ensure_stock_schema("http://example.com", "secret")
        mock_post.assert_not_called()


def test_ensure_stock_schema_without_credentials_does_not_call_pg_sql():
    """Sem URL/key, não deve nem tentar chamar a rede."""
    with patch.object(reservalab_app.requests, "post") as mock_post:
        reservalab_app._ensure_stock_schema("", "")
        mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# _get_workspace_lab_count() — comportamento de fallback
# ---------------------------------------------------------------------------


def _fake_response(ok: bool, json_data=None):
    """Cria um objeto de resposta fake semelhante ao requests.Response."""
    resp = SimpleNamespace(ok=ok)
    if json_data is not None:
        resp.json = lambda: json_data
    else:
        resp.json = lambda: None
    return resp


def test_get_workspace_lab_count_returns_default_when_no_credentials():
    """Sem SUPABASE_URL/SERVICE_KEY, retorna 2 sem chamar a rede."""
    with patch.object(reservalab_app, "_SUPABASE_URL", ""):
        with patch.object(reservalab_app.requests, "get") as mock_get:
            result = reservalab_app._get_workspace_lab_count("ws-1")
            assert result == 2
            mock_get.assert_not_called()


def test_get_workspace_lab_count_returns_default_when_request_times_out():
    """Erro de conectividade/timeout deve retornar 2 (fallback), não mascarar como dado válido."""
    with patch.object(reservalab_app, "_SUPABASE_URL", "http://supabase"):
        with patch.object(reservalab_app, "_SUPABASE_SERVICE_KEY", "secret"):
            with patch.object(
                reservalab_app.requests, "get", side_effect=TimeoutError("conexão esgotada")
            ):
                result = reservalab_app._get_workspace_lab_count("ws-1")
                assert result == 2


def test_get_workspace_lab_count_returns_default_when_http_error():
    """Resposta HTTP não-OK deve retornar 2 (fallback)."""
    with patch.object(reservalab_app, "_SUPABASE_URL", "http://supabase"):
        with patch.object(reservalab_app, "_SUPABASE_SERVICE_KEY", "secret"):
            with patch.object(
                reservalab_app.requests, "get", return_value=_fake_response(ok=False)
            ):
                result = reservalab_app._get_workspace_lab_count("ws-1")
                assert result == 2


def test_get_workspace_lab_count_returns_default_when_empty_json():
    """Resposta OK com JSON vazio deve retornar 2 (fallback)."""
    with patch.object(reservalab_app, "_SUPABASE_URL", "http://supabase"):
        with patch.object(reservalab_app, "_SUPABASE_SERVICE_KEY", "secret"):
            with patch.object(
                reservalab_app.requests,
                "get",
                return_value=_fake_response(ok=True, json_data=[]),
            ):
                result = reservalab_app._get_workspace_lab_count("ws-1")
                assert result == 2


def test_get_workspace_lab_count_returns_default_when_missing_column():
    """Resposta OK sem coluna lab_count deve retornar 2 (fallback)."""
    with patch.object(reservalab_app, "_SUPABASE_URL", "http://supabase"):
        with patch.object(reservalab_app, "_SUPABASE_SERVICE_KEY", "secret"):
            with patch.object(
                reservalab_app.requests,
                "get",
                return_value=_fake_response(ok=True, json_data=[{"id": "ws-1"}]),
            ):
                result = reservalab_app._get_workspace_lab_count("ws-1")
                assert result == 2


def test_get_workspace_lab_count_returns_actual_value_when_present():
    """Resposta OK com lab_count válido deve retornar esse valor."""
    with patch.object(reservalab_app, "_SUPABASE_URL", "http://supabase"):
        with patch.object(reservalab_app, "_SUPABASE_SERVICE_KEY", "secret"):
            with patch.object(
                reservalab_app.requests,
                "get",
                return_value=_fake_response(ok=True, json_data=[{"lab_count": 5}]),
            ):
                result = reservalab_app._get_workspace_lab_count("ws-1")
                assert result == 5


# ---------------------------------------------------------------------------
# Confirmação de que nenhum dos dois consome rpc/pg_sql em caminho de erro
# ---------------------------------------------------------------------------


def test_get_workspace_lab_count_network_error_does_not_call_pg_sql():
    """Erro de rede não dispara _ensure_workspaces_lab_count() nem POST para rpc/pg_sql."""
    with patch.object(reservalab_app, "_SUPABASE_URL", "http://supabase"):
        with patch.object(reservalab_app, "_SUPABASE_SERVICE_KEY", "secret"):
            with patch.object(
                reservalab_app.requests, "get", side_effect=TimeoutError("sem rede")
            ) as mock_get:
                with patch.object(reservalab_app.requests, "post") as mock_post:
                    result = reservalab_app._get_workspace_lab_count("ws-1")
                    assert result == 2
                    mock_post.assert_not_called()
                    # Uma única tentativa de GET; não há repetição após erro.
                    mock_get.assert_called_once()


def test_get_workspace_lab_count_http_error_no_second_get_request():
    """Resposta HTTP não-OK não dispara _ensure_workspaces_lab_count() nem segundo GET."""
    with patch.object(reservalab_app, "_SUPABASE_URL", "http://supabase"):
        with patch.object(reservalab_app, "_SUPABASE_SERVICE_KEY", "secret"):
            with patch.object(
                reservalab_app.requests,
                "get",
                return_value=_fake_response(ok=False),
            ) as mock_get:
                with patch.object(reservalab_app.requests, "post") as mock_post:
                    result = reservalab_app._get_workspace_lab_count("ws-1")
                    assert result == 2
                    mock_post.assert_not_called()
                    # Uma única requisição GET; não há repetição após resposta não-OK.
                    mock_get.assert_called_once()
