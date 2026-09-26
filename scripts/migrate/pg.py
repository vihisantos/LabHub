"""Executor SQL sobre um PostgreSQL real/efêmero (CI de migrations).

Mesma interface de ``ManagementAPI.query`` — ``run()`` do runner aceita
qualquer objeto com ``query(sql) -> list[dict] | None``. É a camada de
execução para o banco descartável do CI (GitHub Actions ``services: postgres``),
que aplica as migrations SQL do LabHub em PostgreSQL de verdade e roda os
testes estruturais/comportamentais ANTES do merge.

NÃO é para produção: lá o executor é ``ManagementAPI`` (Management API da
Supabase). Este módulo não tem secreto/credencial de produção; usa apenas a
``DATABASE_URL`` do banco efêmero (dado inconsistente é descartável).

Segurança: mensagens de erro passam por ``_sanitize`` (redige JWT/PAT/Bearer)
e a DSN nunca é logada.
"""
from __future__ import annotations

import os
from typing import Any

from .api import _sanitize


class SqlExecutionError(Exception):
    """Falha ao executar SQL no PostgreSQL efêmero. Mensagem sanitizada."""


class PostgresExecutor:
    """Executa SQL arbitrário via psycopg 3 (protocolo simples, multi-statement).

    ``query(sql)`` devolve a primeira result set como lista de dicts (mesma
    forma da Management API); DDL sem result set devolve ``[]``.
    """

    def __init__(self, dsn: str | None = None):
        self.dsn = dsn if dsn else os.environ.get("DATABASE_URL", "").strip()
        if not self.dsn:
            raise SqlExecutionError(
                "DATABASE_URL não configurada — informe DSN (--database-url ou env)."
            )
        self._psycopg = None

    def _driver(self):
        if self._psycopg is None:
            try:
                import psycopg
            except Exception as exc:  # pragma: no cover - depende do ambiente
                raise SqlExecutionError(
                    "psycopg não instalado — instale com `pip install psycopg[binary]`"
                ) from exc
            self._psycopg = psycopg
        return self._psycopg

    def query(self, sql: str) -> Any:
        driver = self._driver()
        try:
            # autocommit=True: quem controla a transação é o SQL (o runner
            # envia BEGIN;...COMMIT; para aplicar cada migration atomicamente).
            with driver.connect(self.dsn, autocommit=True) as conn:
                with conn.cursor() as cur:
                    # prepare=False força o protocolo simples do libpq, que
                    # aceita múltiplos statements (';') num único comando.
                    cur.execute(sql, prepare=False)
                    if cur.description is None:
                        return []
                    columns = [col.name for col in cur.description]
                    return [dict(zip(columns, row)) for row in cur.fetchall()]
        except SqlExecutionError:
            raise
        except Exception as exc:  # noqa: BLE001 - fronteira do executor
            raise SqlExecutionError(_sanitize(str(exc))) from exc