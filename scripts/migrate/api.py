"""Cliente mínimo da Supabase Management API (endpoint ``/database/query``).

Usado SO para executar SQL arbitrário (DDL) no Postgres do projeto, exatamente
como os scripts manuais do repositório fazem. Preferimos a Management API com
``SUPABASE_ACCESS_TOKEN`` (PAT/secret de curta duração) ao invés da service role
key de longa duração — mais seguro em CI/GitHub Actions.

Endpoint (visto em uso manual neste repositório):
    POST https://api.supabase.com/v1/projects/{ref}/database/query
    Authorization: Bearer {SUPABASE_ACCESS_TOKEN}
    Content-Type: application/json
    {"query": "<sql>"}

Nenhum header/token é logado. ``requests.Session`` é injetável para testes.
"""
from __future__ import annotations

import os
import re
from collections.abc import Callable
from typing import Any

import requests

_API_BASE = "https://api.supabase.com"
_QUERY_PATH = "/v1/projects/{ref}/database/query"

# Injetável: a função de POST usada pelo runner. Em testes trocamos por um mock.
HttpPost = Callable[..., requests.Response]

# Tamanho máximo do trecho de erro preservado nas mensagens de `ApiError`.
_MAX_ERROR_EXCERPT = 500

# Padrões de credenciais/SQL que NUNCA devem vazar em logs/erros.
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b")
_SBP_TOKEN_RE = re.compile(r"\bsbp_[A-Za-z0-9_-]{10,}\b")
_BEARER_RE = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{6,}")


def _sanitize(text: str) -> str:
    """Remove JWTs/PATs/Bearer tokens óbvios e normaliza espaços de um trecho."""
    text = _JWT_RE.sub("[REDACTED]", text)
    text = _SBP_TOKEN_RE.sub("[REDACTED]", text)
    text = _BEARER_RE.sub("Bearer [REDACTED]", text)
    return " ".join(text.split())


class ApiError(Exception):
    """Falha na Management API. Mensagem genérica (não expõe o corpo/secrets)."""

    def __init__(self, status: int | None, detail: str = ""):
        self.status = status
        super().__init__(detail or "Management API retornou erro")


class ManagementAPI:
    """Wrapper fino da Management API para o endpoint de query SQL."""

    def __init__(self, *, access_token: str | None = None, project_ref: str | None = None,
                 post: HttpPost | None = None):
        env = os.environ
        self.access_token = access_token if access_token is not None else env.get("SUPABASE_ACCESS_TOKEN", "")
        self.project_ref = project_ref if project_ref is not None else env.get("SUPABASE_PROJECT_REF", "")
        # ``post`` injetável: default usa requests.post. Nunca imprimimos o token.
        self._post = post if post is not None else requests.post

    def _headers(self) -> dict[str, str]:
        if not self.access_token:
            raise ApiError(None, "SUPABASE_ACCESS_TOKEN não configurado")
        if not self.project_ref:
            raise ApiError(None, "SUPABASE_PROJECT_REF não configurado")
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def query(self, sql: str) -> Any:
        """Executa ``sql`` via /database/query e retorna o JSON decodificado.

        Erros HTTP viram ``ApiError``. Lança ``requests.RequestException`` em
        falhas de rede (deixamos propagar; o runner trata no topo).
        """
        url = _API_BASE + _QUERY_PATH.format(ref=self.project_ref)
        resp = self._post(url, json={"query": sql}, headers=self._headers(), timeout=60)
        text = resp.text or ""
        if resp.status_code >= 300:
            # Preserva apenas um trecho sanitizado do corpo: útil para identificar
            # o erro real do Postgres/Supabase sem vazar SQL/secrets completos.
            detail = (
                "Management API respondeu status HTTP "
                f"{resp.status_code} ao executar consulta"
            )
            extra = self._error_detail(resp)
            if extra:
                detail = f"{detail}: {extra}"
            raise ApiError(resp.status_code, detail)
        if not text:
            return None
        try:
            return resp.json()
        except ValueError:
            return text

    def _error_detail(self, resp: Any) -> str:
        """Extrai e sanitiza a mensagem de erro retornada pela Management API.

        Prioriza campos JSON comuns (error/message/hint/detail/code); se a
        resposta não for JSON, usa o texto bruto. Limita a ~500 caracteres e
        redige tokens (Supabase PAT/JWT/Bearer) e o próprio access_token.
        """
        message = ""

        parsed = None
        try:
            parsed = resp.json()
        except (AttributeError, TypeError, ValueError):
            parsed = None

        if isinstance(parsed, dict):
            for key in ("error", "message", "hint", "detail", "details", "code"):
                value = parsed.get(key)
                if isinstance(value, str) and value.strip():
                    message = value.strip()
                    break
                if isinstance(value, list):
                    joined = "; ".join(str(item) for item in value)
                    if joined.strip():
                        message = joined.strip()
                        break
            if not message:
                message = "; ".join(f"{key}={value}" for key, value in parsed.items())
        elif parsed is not None:
            message = str(parsed)
        elif getattr(resp, "text", None):
            message = str(resp.text)

        if not message:
            return ""

        message = _sanitize(message)
        if self.access_token and self.access_token in message:
            message = message.replace(self.access_token, "[REDACTED]")
        return message[:_MAX_ERROR_EXCERPT]
