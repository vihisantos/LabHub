"""Contrato compartilhado da migração Redis -> PostgreSQL de lembretes/Push.

Este módulo é puramente local: não faz requests, não toca Redis e não toca o
banco. Ele normaliza os formatos históricos do Upstash e gera o SQL de
importação com os contratos das migrations 111/112.

Regras de ouro:

* o exportador só usa comandos de leitura (SCAN/TYPE/PTTL/GET/SMEMBERS);
* locks antigos nunca são importados como locks válidos;
* TTL restante é transportado explícitamente (clock_timestamp() no destino);
* payloads de inscrição são preservados byte a byte no JSON;
* nenhum dado de origem é apagado ou modificado.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

SCHEMA_VERSION = 1

ADVISORY_IMPORT_KEY = 958823002
ADVISORY_MIGRATION_KEY = 958823001  # runner de DDL; nunca reutilizar

STATE_TTL_DEFAULT = 604800
MARK_TTL_DEFAULT = 604800
GENERATION_MAX = 1_000_000_000
REMINDER_COUNT_MAX = 10

PREFIX_STATE = "chamado:reminder:state:"
PREFIX_LOCK = "chamado:reminder:lock:"
PREFIX_MARK = "chamado:reminder:sent:"
PREFIX_PUSH_CHAMADO = "push:chamado:"
PREFIX_PUSH_SENT = "push:sent:"
KEY_PUSH_SUBSCRIBERS = "push:subscribers"

PATTERNS = (
    PREFIX_STATE + "*",
    PREFIX_LOCK + "*",
    PREFIX_MARK + "*",
    KEY_PUSH_SUBSCRIBERS,
    PREFIX_PUSH_CHAMADO + "*",
    PREFIX_PUSH_SENT + "*",
)

CATEGORIES = (
    "reminder_states",
    "reminder_marks",
    "push_subscriptions",
    "chamado_push_subscriptions",
    "push_dedup_marks",
    "reminder_locks_ignored",
)

TABLES = (
    "chamado_reminder_states",
    "chamado_reminder_sent_marks",
    "push_subscriptions",
    "chamado_push_subscriptions",
    "push_dedup_marks",
)

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)
TOKEN_RE = re.compile(r"^[0-9a-fA-F]{32}$")
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T")


def fingerprint(value: Any) -> str:
    """Identificador curto e irreversível para relatórios (nunca o valor cru)."""
    raw = value if isinstance(value, str) else json.dumps(value, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()[:12]


def _text(value: Any) -> str | None:
    if isinstance(value, bytes):
        value = value.decode("utf-8", "replace")
    return value if isinstance(value, str) else None


def _json_object(raw: Any) -> dict | None:
    if isinstance(raw, Mapping):
        return dict(raw)
    text = _text(raw)
    if text is None:
        return None
    try:
        parsed = json.loads(text)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _valid_uuid(value: Any) -> bool:
    if not UUID_RE.match(str(value or "")):
        return False
    try:
        uuid.UUID(str(value))
    except (TypeError, ValueError):
        return False
    return True


def ttl_to_seconds(ttl: Any) -> int:
    """Converte TTL Redis em segundos; -1 = sem expiração, -2 = ausente."""
    try:
        value = int(ttl)
    except (TypeError, ValueError):
        return -2
    if value in (-1, -2):
        return value
    return max(0, value)


def expires_expr(ttl_seconds: int, *, fallback: int) -> str:
    """SQL para expires_at a partir do TTL restante; -1 usa `fallback`."""
    seconds = fallback if ttl_seconds < 0 else ttl_seconds
    return f"clock_timestamp() + make_interval(secs => {int(seconds)})"


@dataclass
class Divergence:
    category: str
    reason: str
    fingerprint: str = ""

    def as_dict(self) -> dict[str, str]:
        result = {"category": self.category, "reason": self.reason}
        if self.fingerprint:
            result["fingerprint"] = self.fingerprint
        return result


@dataclass
class Snapshot:
    """Snapshot normalizado. Não contém credenciais nem valores de lock."""

    records: dict[str, list[dict]] = field(default_factory=lambda: {k: [] for k in CATEGORIES})
    divergences: list[Divergence] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=lambda: {
        "scanned": 0,
        "exported": 0,
        "skipped": 0,
        "invalid": 0,
        "expired": 0,
    })
    source_integrity: dict[str, Any] = field(default_factory=dict)
    generated_at: str = ""

    def add(self, category: str, record: Mapping[str, Any]) -> None:
        if category not in self.records:
            raise ValueError(f"categoria desconhecida: {category}")
        self.records[category].append(dict(record))
        self.counts["exported"] += 1

    def diverge(self, category: str, reason: str, value: Any = None) -> None:
        self.divergences.append(Divergence(category, reason, fingerprint(value) if value is not None else ""))
        self.counts["invalid"] += 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": SCHEMA_VERSION,
            "generated_at": self.generated_at,
            "source": "upstash-rest-read-only",
            "counts": dict(self.counts),
            "source_integrity": dict(self.source_integrity),
            "divergences": [d.as_dict() for d in self.divergences],
            "records": {category: list(rows) for category, rows in self.records.items()},
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Snapshot":
        if not isinstance(data, Mapping):
            raise ValueError("snapshot não é um objeto JSON")
        if data.get("schema") != SCHEMA_VERSION:
            raise ValueError(f"schema de snapshot incompatível: {data.get('schema')!r}")
        records = data.get("records")
        if not isinstance(records, Mapping):
            raise ValueError("snapshot sem 'records'")
        snapshot = cls()
        for category in CATEGORIES:
            rows = records.get(category, [])
            if not isinstance(rows, list) or any(not isinstance(r, Mapping) for r in rows):
                raise ValueError(f"registros inválidos em {category}")
            snapshot.records[category] = [dict(r) for r in rows]
        raw_counts = data.get("counts", {})
        if isinstance(raw_counts, Mapping):
            snapshot.counts.update({k: int(v) for k, v in raw_counts.items() if isinstance(v, (int, str))})
        raw_div = data.get("divergences", [])
        if isinstance(raw_div, list):
            for item in raw_div:
                if isinstance(item, Mapping):
                    snapshot.divergences.append(Divergence(
                        str(item.get("category", "")),
                        str(item.get("reason", "")),
                        str(item.get("fingerprint", "")),
                    ))
        snapshot.generated_at = str(data.get("generated_at", ""))
        raw_integrity = data.get("source_integrity")
        if isinstance(raw_integrity, Mapping):
            snapshot.source_integrity = dict(raw_integrity)
        return snapshot


# ---------------------------------------------------------------------------
# normalizadores
# ---------------------------------------------------------------------------

def normalize_state(key: str, raw: Any, ttl: Any) -> dict | None:
    ticket_id = key[len(PREFIX_STATE):]
    if not _valid_uuid(ticket_id):
        return None
    state = _json_object(raw)
    if state is None:
        return None

    count = state.get("reminder_count", 0)
    if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= REMINDER_COUNT_MAX:
        return None

    generation = state.get("transition_generation")
    if generation is None:
        generation = 0
    elif isinstance(generation, bool) or not isinstance(generation, int) or not 0 <= generation <= GENERATION_MAX:
        return None

    cycle_id = state.get("cycle_id", "")
    if cycle_id is None:
        cycle_id = ""
    if not isinstance(cycle_id, str):
        return None

    status = state.get("last_known_status", "aberto")
    if status is None or status == "":
        status = "aberto"
    if not isinstance(status, str):
        return None

    last_reminder_at = state.get("last_reminder_at")
    if last_reminder_at is not None:
        if not isinstance(last_reminder_at, str) or not ISO_RE.match(last_reminder_at):
            return None

    workspace_id = state.get("workspace_id")
    if workspace_id is not None and not _valid_uuid(workspace_id):
        return None

    return {
        "ticket_id": ticket_id,
        "workspace_id": str(workspace_id) if workspace_id is not None else None,
        "cycle_id": cycle_id,
        "reminder_count": count,
        "last_reminder_at": last_reminder_at,
        "last_known_status": status,
        "transition_generation": generation,
        "ttl_seconds": ttl_to_seconds(ttl),
        "source_fingerprint": fingerprint(key),
    }


def parse_mark_key(key: str) -> tuple[str, str, int, str] | None:
    """Parse `sent:{ticket}:{cycle}:{wave}:{identity}` sem split ingênuo.

    `cycle_id` pode conter ':' (createdAt ISO) e `identity` pode ser
    'uid:<hash>'. A busca é feita da direita para a esquerda.
    """
    remainder = key[len(PREFIX_MARK):]
    parts = remainder.split(":")
    if len(parts) < 4:
        return None
    ticket_id = parts[0]
    if not _valid_uuid(ticket_id):
        return None

    candidates: list[tuple[int, int, str]] = []
    if parts[-2].isdigit():
        candidates.append((-2, int(parts[-2]), parts[-1]))
    if len(parts) >= 5 and parts[-2] == "uid" and parts[-3].isdigit():
        candidates.append((-3, int(parts[-3]), "uid:" + parts[-1]))

    for pos, wave, identity in candidates:
        cycle_id = ":".join(parts[1:pos])
        if cycle_id and wave > 0 and identity:
            return ticket_id, cycle_id, wave, identity
    return None


def normalize_mark(key: str, raw: Any, ttl: Any) -> dict | None:
    parsed = parse_mark_key(key)
    if parsed is None:
        return None
    ticket_id, cycle_id, wave, identity = parsed
    value = _text(raw)
    if value is None or value.strip() != "1":
        return None
    return {
        "ticket_id": ticket_id,
        "cycle_id": cycle_id,
        "wave": wave,
        "identity": identity,
        "ttl_seconds": ttl_to_seconds(ttl),
        "source_fingerprint": fingerprint(key),
    }


def normalize_lock(key: str, ttl: Any) -> dict | None:
    """Locks são registrados apenas como contagem; o token NUNCA é exportado."""
    ticket_id = key[len(PREFIX_LOCK):]
    if not _valid_uuid(ticket_id):
        return None
    return {
        "ticket_id": ticket_id,
        "ttl_seconds": ttl_to_seconds(ttl),
        "source_fingerprint": fingerprint(key),
    }


def normalize_subscription(raw: Any, ttl: Any, ticket_id: str | None = None) -> dict | None:
    payload = _json_object(raw)
    if payload is None:
        return None
    endpoint = payload.get("endpoint")
    if not isinstance(endpoint, str) or not endpoint or len(endpoint) > 2048:
        return None
    if ticket_id is not None and not _valid_uuid(ticket_id):
        return None
    keys = payload.get("keys", {})
    if keys is not None and not isinstance(keys, Mapping):
        return None
    record = {
        "payload": payload,
        "ttl_seconds": ttl_to_seconds(ttl),
        "source_fingerprint": fingerprint(payload),
    }
    if ticket_id is not None:
        record["ticket_id"] = ticket_id
    return record


def normalize_dedup(key: str, raw: Any, ttl: Any) -> dict | None:
    value = _text(raw)
    if value is None:
        return None
    ttl_seconds = ttl_to_seconds(ttl)
    if ttl_seconds == 0:
        return None

    if value.strip() == "1":
        # Valor global legado: tentativa antiga. Nunca conta como aceitação.
        return {
            "key": key,
            "state": "attempted",
            "token": None,
            "ttl_seconds": ttl_seconds,
            "legacy": True,
            "source_fingerprint": fingerprint(key),
        }

    if ":" in value:
        state, token = value.split(":", 1)
        if state in ("reserved", "accepted") and TOKEN_RE.match(token):
            return {
                "key": key,
                "state": state,
                "token": token,
                "ttl_seconds": ttl_seconds,
                "legacy": False,
                "source_fingerprint": fingerprint(key),
            }
    return None


# ---------------------------------------------------------------------------
# plano de importação
# ---------------------------------------------------------------------------

@dataclass
class ImportPlan:
    states: list[dict] = field(default_factory=list)
    marks: list[dict] = field(default_factory=list)
    push_subscriptions: list[dict] = field(default_factory=list)
    chamado_subscriptions: list[dict] = field(default_factory=list)
    dedup_marks: list[dict] = field(default_factory=list)
    divergences: list[Divergence] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        return {
            "reminder_states": len(self.states),
            "reminder_marks": len(self.marks),
            "push_subscriptions": len(self.push_subscriptions),
            "chamado_push_subscriptions": len(self.chamado_subscriptions),
            "push_dedup_marks": len(self.dedup_marks),
            "reminder_locks_ignored": 0,
        }


def _dedupe(rows: Iterable[dict], key_fn, divergences: list[Divergence], category: str) -> list[dict]:
    seen: set[Any] = set()
    result: list[dict] = []
    for row in rows:
        key = key_fn(row)
        if key in seen:
            divergences.append(Divergence(category, "duplicate_source_key", row.get("source_fingerprint", "")))
            continue
        seen.add(key)
        result.append(row)
    return result


def build_import_plan(snapshot: Snapshot) -> ImportPlan:
    """Aplica dedup determinístico e remove o que não pode ser importado."""
    rec = snapshot.records
    divs = list(snapshot.divergences)

    states = []
    for row in rec["reminder_states"]:
        if not _valid_uuid(row.get("ticket_id")):
            divs.append(Divergence("reminder_states", "bad_ticket_id", str(row.get("source_fingerprint", ""))))
            continue
        states.append(dict(row))
    states = _dedupe(states, lambda r: r["ticket_id"], divs, "reminder_states")

    marks = []
    for row in rec["reminder_marks"]:
        if (not _valid_uuid(row.get("ticket_id")) or not isinstance(row.get("wave"), int)
                or row["wave"] <= 0 or not row.get("cycle_id") or not row.get("identity")):
            divs.append(Divergence("reminder_marks", "bad_mark_identity", str(row.get("source_fingerprint", ""))))
            continue
        marks.append(dict(row))
    marks = _dedupe(marks, lambda r: (r["ticket_id"], r["cycle_id"], r["wave"], r["identity"]), divs, "reminder_marks")

    def _subs(category: str, rows: list[dict], with_ticket: bool) -> list[dict]:
        result = []
        for row in rows:
            payload = row.get("payload")
            endpoint = payload.get("endpoint") if isinstance(payload, Mapping) else None
            if not isinstance(endpoint, str) or not endpoint:
                divs.append(Divergence(category, "bad_endpoint", str(row.get("source_fingerprint", ""))))
                continue
            if with_ticket and not _valid_uuid(row.get("ticket_id")):
                divs.append(Divergence(category, "bad_ticket_id", str(row.get("source_fingerprint", ""))))
                continue
            result.append(dict(row))
        return _dedupe(
            result,
            (lambda r: (r["ticket_id"], r["payload"]["endpoint"])) if with_ticket else (lambda r: r["payload"]["endpoint"]),
            divs,
            category,
        )

    push_subs = _subs("push_subscriptions", rec["push_subscriptions"], False)
    chamado_subs = _subs("chamado_push_subscriptions", rec["chamado_push_subscriptions"], True)

    # Contrato histórico: CHAMADOS_SUBS_PER_TICKET = 10 (também limitado na RPC).
    per_ticket = Counter(row["ticket_id"] for row in chamado_subs)
    for ticket_id, total in sorted(per_ticket.items()):
        if total > 10:
            divs.append(Divergence("chamado_push_subscriptions", "cap_exceeded", ticket_id))
    capped: list[dict] = []
    kept: Counter[str] = Counter()
    for row in sorted(chamado_subs, key=lambda r: (r["ticket_id"], r["payload"]["endpoint"])):
        ticket_id = row["ticket_id"]
        if kept[ticket_id] >= 10:
            continue
        kept[ticket_id] += 1
        capped.append(row)
    chamado_subs = capped

    dedup = []
    for row in rec["push_dedup_marks"]:
        key = row.get("key")
        state = row.get("state")
        if (not isinstance(key, str) or not key.startswith(PREFIX_PUSH_SENT)
                or state not in ("reserved", "accepted", "attempted")):
            divs.append(Divergence("push_dedup_marks", "bad_dedup_record", str(row.get("source_fingerprint", ""))))
            continue
        if state in ("reserved", "accepted") and not TOKEN_RE.match(str(row.get("token") or "")):
            divs.append(Divergence("push_dedup_marks", "missing_token", str(row.get("source_fingerprint", ""))))
            continue
        if int(row.get("ttl_seconds", -2)) < 0:
            divs.append(Divergence("push_dedup_marks", "no_expiry", str(row.get("source_fingerprint", ""))))
            continue
        dedup.append(dict(row))
    dedup = _dedupe(dedup, lambda r: r["key"], divs, "push_dedup_marks")

    return ImportPlan(
        states=states,
        marks=marks,
        push_subscriptions=push_subs,
        chamado_subscriptions=chamado_subs,
        dedup_marks=dedup,
        divergences=divs,
    )


def affected_tickets(plan: ImportPlan) -> set[str]:
    tickets = {r["ticket_id"] for r in plan.states}
    tickets.update(r["ticket_id"] for r in plan.marks)
    tickets.update(r["ticket_id"] for r in plan.chamado_subscriptions)
    return tickets


def affected_workspaces(plan: ImportPlan) -> set[str]:
    return {r["workspace_id"] for r in plan.states if r.get("workspace_id")}


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

def sql_literal(value: Any) -> str:
    """Literal SQL seguro. Nunca interpola valores sem validação de tipo."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if not isinstance(value, str):
        raise TypeError(f"tipo não suportado em literal SQL: {type(value)!r}")
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return "E'" + escaped + "'"


def jsonb_literal(payload: Mapping[str, Any]) -> str:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return sql_literal(text) + "::jsonb"


def timestamp_literal(value: str) -> str:
    if not ISO_RE.match(value):
        raise ValueError("timestamp inválido")
    return sql_literal(value) + "::timestamptz"


def _values_block(rows: list[list[str]]) -> str:
    return ",\n".join("    (" + ", ".join(row) + ")" for row in rows)


def build_sql(plan: ImportPlan) -> str:
    """Gera um único script transacional, idempotente e com advisory locks."""
    parts = [
        "BEGIN;",
        f"SELECT pg_advisory_xact_lock({ADVISORY_IMPORT_KEY});",
    ]

    for ticket in sorted(affected_tickets(plan)):
        parts.append(f"SELECT pg_advisory_xact_lock(hashtextextended({sql_literal(ticket)}::text, 0));")

    if plan.states:
        rows = []
        for r in plan.states:
            rows.append([
                sql_literal(r["ticket_id"]),
                sql_literal(r.get("workspace_id")),
                sql_literal(r.get("cycle_id", "")),
                str(int(r.get("reminder_count", 0))),
                sql_literal(None) if not r.get("last_reminder_at") else timestamp_literal(r["last_reminder_at"]),
                sql_literal(r.get("last_known_status", "aberto")),
                str(int(r.get("transition_generation", 0))),
                "NULL",  # lock_token: locks antigos nunca são importados
                "NULL",  # lock_expires_at
                expires_expr(r.get("ttl_seconds", -1), fallback=STATE_TTL_DEFAULT),
            ])
        parts.append(
            "INSERT INTO public.chamado_reminder_states\n"
            "    (ticket_id, workspace_id, cycle_id, reminder_count, last_reminder_at,\n"
            "     last_known_status, transition_generation, lock_token, lock_expires_at, expires_at)\n"
            "VALUES\n" + _values_block(rows) + "\n"
            "ON CONFLICT (ticket_id) DO NOTHING;"
        )

    if plan.marks:
        rows = []
        for r in plan.marks:
            rows.append([
                sql_literal(r["ticket_id"]),
                sql_literal(r["cycle_id"]),
                str(int(r["wave"])),
                sql_literal(r["identity"]),
                "clock_timestamp()",
                expires_expr(r.get("ttl_seconds", -1), fallback=MARK_TTL_DEFAULT),
            ])
        parts.append(
            "INSERT INTO public.chamado_reminder_sent_marks\n"
            "    (ticket_id, cycle_id, wave, identity, created_at, expires_at)\n"
            "VALUES\n" + _values_block(rows) + "\n"
            "ON CONFLICT (ticket_id, cycle_id, wave, identity) DO NOTHING;"
        )

    if plan.push_subscriptions:
        rows = []
        for r in plan.push_subscriptions:
            ttl = int(r.get("ttl_seconds", -1))
            expires = "NULL" if ttl < 0 else expires_expr(ttl, fallback=0)
            rows.append([
                sql_literal(r["payload"]["endpoint"]),
                jsonb_literal(r["payload"]),
                expires,
            ])
        parts.append(
            "INSERT INTO public.push_subscriptions (endpoint, payload, expires_at)\n"
            "VALUES\n" + _values_block(rows) + "\n"
            "ON CONFLICT (endpoint) DO NOTHING;"
        )

    if plan.chamado_subscriptions:
        rows = []
        for r in plan.chamado_subscriptions:
            ttl = int(r.get("ttl_seconds", -1))
            expires = "NULL" if ttl < 0 else expires_expr(ttl, fallback=0)
            rows.append([
                sql_literal(r["ticket_id"]),
                sql_literal(r["payload"]["endpoint"]),
                jsonb_literal(r["payload"]),
                expires,
            ])
        parts.append(
            "INSERT INTO public.chamado_push_subscriptions (ticket_id, endpoint, payload, expires_at)\n"
            "VALUES\n" + _values_block(rows) + "\n"
            "ON CONFLICT (ticket_id, endpoint) DO NOTHING;"
        )

    if plan.dedup_marks:
        rows = []
        for r in plan.dedup_marks:
            rows.append([
                sql_literal(r["key"]),
                sql_literal(r["state"]),
                sql_literal(r.get("token")),
                expires_expr(r.get("ttl_seconds", -1), fallback=0),
            ])
        parts.append(
            "INSERT INTO public.push_dedup_marks (key, state, token, expires_at)\n"
            "VALUES\n" + _values_block(rows) + "\n"
            "ON CONFLICT (key) DO NOTHING;"
        )

    parts.append("COMMIT;")
    return "\n".join(parts) + "\n"


def count_queries() -> dict[str, str]:
    return {
        "reminder_states": "SELECT count(*)::int AS n FROM public.chamado_reminder_states",
        "reminder_marks": "SELECT count(*)::int AS n FROM public.chamado_reminder_sent_marks",
        "push_subscriptions": "SELECT count(*)::int AS n FROM public.push_subscriptions",
        "chamado_push_subscriptions": "SELECT count(*)::int AS n FROM public.chamado_push_subscriptions",
        "push_dedup_marks": "SELECT count(*)::int AS n FROM public.push_dedup_marks",
    }


def table_check_query() -> str:
    names = ", ".join(
        f"to_regclass('public.{name}') AS {name}" for name in TABLES
    )
    return f"SELECT {names}"


def _array_literal(values: Iterable[str]) -> str:
    items = ", ".join(sql_literal(v) + "::uuid" for v in sorted(set(values)))
    return "ARRAY[" + items + "]" if items else "ARRAY[]::uuid[]"


def ticket_check_query(tickets: Iterable[str]) -> str | None:
    values = sorted(set(tickets))
    if not values:
        return None
    return f"SELECT id FROM public.chamados_tickets WHERE id = ANY({_array_literal(values)})"


def workspace_check_query(workspaces: Iterable[str]) -> str | None:
    values = sorted(set(workspaces))
    if not values:
        return None
    return f"SELECT id FROM public.workspaces WHERE id = ANY({_array_literal(values)})"
