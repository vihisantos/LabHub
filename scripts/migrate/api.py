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
from typing import Any, Callable

import requests

_API_BASE = "https://api.supabase.com"
_QUERY_PATH = "/v1/projects/{ref}/database/query"

# Injetável: a função de POST usada pelo runner. Em testes trocamos por um mock.
HttpPost = Callable[..., requests.Response]


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
            # Não logamos o corpo: pode conter pedaços de SQL/secrets.
            detail = (
                "Management API respondeu status HTTP "
                f"{resp.status_code} ao executar consulta"
            )
            raise ApiError(resp.status_code, detail)
        if not text:
            return None
        try:
            return resp.json()
        except ValueError:
            return text
