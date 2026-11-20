"""Testes locais da migração Redis -> PostgreSQL (sem Redis/Postgres reais).

Cobre: export somente leitura, proteção de credenciais/payloads, normalização
de formatos ambíguos, TTL restante, locks nunca importados, fail-closed de
destino, idempotência e divergências.
"""
from __future__ import annotations

import fnmatch
import json
import os
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1]
for _path in (str(_SCRIPTS), str(_SCRIPTS / "migrate")):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from migrate import redis_contract as contract  # noqa: E402
from migrate import redis_export as exporter  # noqa: E402
from migrate import redis_import as importer  # noqa: E402

TICKET = "11111111-1111-4111-8111-111111111111"
WORKSPACE = "22222222-2222-4222-8222-222222222222"
TOKEN = "a" * 32
ENDPOINT = "https://push.example.invalid/device/1"


class FakeResponse:
    def __init__(self, payload, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


class FakeUpstash:
    """Upstash REST em memória; registra TODOS os comandos recebidos."""

    def __init__(self, data: dict[str, tuple[str, object, int]]):
        self.data = data
        self.commands: list[list[str]] = []

    def post(self, url, json, headers, timeout):
        cmd = [str(x) for x in json]
        self.commands.append(cmd)
        name = cmd[0]
        if name == "SCAN":
            pattern = cmd[cmd.index("MATCH") + 1]
            keys = sorted(k for k in self.data if fnmatch.fnmatch(k, pattern))
            return FakeResponse({"result": ["0", keys]})
        if name == "TYPE":
            key = cmd[1]
            return FakeResponse({"result": self.data[key][0] if key in self.data else "none"})
        if name == "PTTL":
            key = cmd[1]
            return FakeResponse({"result": self.data[key][2] if key in self.data else -2})
        if name == "GET":
            key = cmd[1]
            value = self.data[key][1] if key in self.data else None
            return FakeResponse({"result": value})
        if name == "SMEMBERS":
            key = cmd[1]
            value = self.data[key][1] if key in self.data else []
            return FakeResponse({"result": value})
        raise AssertionError(f"comando inesperado: {name}")


class FakeAPI:
    """Management API mínima: responde só ao que o importador consulta."""

    def __init__(self, *, tickets=(TICKET,), workspaces=(WORKSPACE,)):
        self.queries: list[str] = []
        self.applied: set[str] = set()
        self.counts = {
            "chamado_reminder_states": 0,
            "chamado_reminder_sent_marks": 0,
            "push_subscriptions": 0,
            "chamado_push_subscriptions": 0,
            "push_dedup_marks": 0,
        }
        self.tickets = set(tickets)
        self.workspaces = set(workspaces)

    def query(self, sql: str):
        self.queries.append(sql)
        stripped = sql.strip()
        if stripped.startswith("SELECT to_regclass"):
            return [{name: name for name in self.counts}]
        if "count(*)::int AS n FROM public." in stripped:
            table = stripped.split("public.", 1)[1].split()[0]
            return [{"n": self.counts.get(table, 0)}]
        if stripped.startswith("SELECT id FROM public.chamados_tickets"):
            return [{"id": t} for t in self.tickets]
        if stripped.startswith("SELECT id FROM public.workspaces"):
            return [{"id": w} for w in self.workspaces]
        if stripped.startswith("BEGIN;"):
            if stripped in self.applied:
                return []
            self.applied.add(stripped)
            for table in self.counts:
                if f"INSERT INTO public.{table}" in stripped:
                    marker = f"INSERT INTO public.{table}"
                    block = stripped.split(marker, 1)[1].split("ON CONFLICT", 1)[0]
                    self.counts[table] += max(0, block.count(",\n    (") + 1)
            return []
        return []


def _state_raw(cycle: str = "cycle-1") -> str:
    return json.dumps({
        "ticket_id": TICKET,
        "workspace_id": WORKSPACE,
        "last_reminder_at": "2026-01-01T00:00:00+00:00",
        "reminder_count": 2,
        "last_known_status": "aberto",
        "cycle_id": cycle,
        "transition_generation": 7,
    })


def _sub_payload() -> dict:
    return {
        "key": "b" * 64,
        "endpoint": ENDPOINT,
        "expirationTime": None,
        "keys": {"p256dh": "p256dh-secret", "auth": "auth-secret"},
        "user": {"id": "user-1", "notify_settings": {}},
    }


def fake_data() -> dict[str, tuple[str, object, int]]:
    iso_cycle = "2026-01-01T00:00:00+00:00"
    return {
        contract.PREFIX_STATE + TICKET: ("string", _state_raw(iso_cycle), 604800_000),
        contract.PREFIX_LOCK + TICKET: ("string", TOKEN, 120_000),
        contract.PREFIX_MARK + f"{TICKET}:{iso_cycle}:2:uid:{TOKEN[:16]}": ("string", "1", 604800_000),
        contract.KEY_PUSH_SUBSCRIBERS: ("set", [json.dumps(_sub_payload())], -1),
        contract.PREFIX_PUSH_CHAMADO + TICKET: ("set", [json.dumps({
            "key": "c" * 64,
            "endpoint": "https://push.example.invalid/anon",
            "keys": {"p256dh": "anon-p", "auth": "anon-a"},
        })], 600_000),
        contract.PREFIX_PUSH_SENT + "event1:abcdef0123456789:ws:" + WORKSPACE: (
            "string", f"accepted:{TOKEN}", 7200_000
        ),
        contract.PREFIX_PUSH_SENT + "legacy": ("string", "1", 7200_000),
        contract.PREFIX_PUSH_SENT + "invalid": ("string", "nonsense", 7200_000),
        contract.PREFIX_PUSH_SENT + "expired": ("string", "1", -2000),
    }


@pytest.fixture
def snapshot():
    reader = exporter.UpstashReader("https://example.invalid", "super-secret-token", post=FakeUpstash(fake_data()).post)
    snap, _ = exporter.export_snapshot(reader, verify=False)
    return snap


# ---------------------------------------------------------------------------
# exportador
# ---------------------------------------------------------------------------

def test_export_usa_apenas_comandos_de_leitura(snapshot):
    backend = FakeUpstash(fake_data())
    reader = exporter.UpstashReader("https://example.invalid", "token", post=backend.post)
    exporter.export_snapshot(reader, verify=False)
    assert backend.commands
    assert {cmd[0] for cmd in backend.commands} <= exporter.READ_ONLY_COMMANDS
    assert not any(cmd[0] in {"DEL", "SET", "SETEX", "EVAL", "SREM"} for cmd in backend.commands)


def test_export_preserva_formatos_ambiguos(snapshot):
    state = snapshot.records["reminder_states"][0]
    assert state["transition_generation"] == 7
    assert state["cycle_id"] == "2026-01-01T00:00:00+00:00"
    assert state["ttl_seconds"] == 604800

    mark = snapshot.records["reminder_marks"][0]
    assert mark["cycle_id"] == "2026-01-01T00:00:00+00:00"
    assert mark["wave"] == 2
    assert mark["identity"] == "uid:" + TOKEN[:16]

    assert snapshot.records["reminder_locks_ignored"][0]["ticket_id"] == TICKET
    assert "token" not in snapshot.records["reminder_locks_ignored"][0]


def test_export_classifica_dedup_e_divergencias(snapshot):
    states = {r["state"] for r in snapshot.records["push_dedup_marks"]}
    assert states == {"accepted", "attempted"}
    accepted = next(r for r in snapshot.records["push_dedup_marks"] if r["state"] == "accepted")
    assert accepted["token"] == TOKEN
    assert any(d.reason == "invalid_source_record" for d in snapshot.divergences)
    assert snapshot.counts["expired"] == 1


def test_artifacto_protegido_sem_credenciais(snapshot, tmp_path, capsys):
    out = tmp_path / "snapshot.json"
    exporter.write_artifact(snapshot, out, url="https://example.invalid", token="super-secret-token")
    text = out.read_text(encoding="utf-8")
    assert "super-secret-token" not in text
    assert "https://example.invalid" not in text
    assert ENDPOINT in text  # payload preservado no artefato, não no log

    backend = FakeUpstash(fake_data())
    monkeypatch_backend = backend
    original = exporter.requests.post
    exporter.requests.post = monkeypatch_backend.post
    try:
        os.environ["UPSTASH_REDIS_REST_URL"] = "https://example.invalid"
        os.environ["UPSTASH_REDIS_REST_TOKEN"] = "super-secret-token"
        assert exporter.main(["--out", str(tmp_path / "cli.json"), "--no-verify"]) == 0
    finally:
        exporter.requests.post = original
        os.environ.pop("UPSTASH_REDIS_REST_URL", None)
        os.environ.pop("UPSTASH_REDIS_REST_TOKEN", None)
    printed = capsys.readouterr().out
    assert ENDPOINT not in printed
    assert "super-secret-token" not in printed
    assert "scanned=" in printed


def test_verificacao_de_origem_detecta_alteracao(snapshot):
    backend = FakeUpstash(fake_data())
    reader = exporter.UpstashReader("https://example.invalid", "token", post=backend.post)
    snap, digests = exporter.export_snapshot(reader, verify=False)
    backend.data[contract.PREFIX_STATE + TICKET] = ("string", _state_raw("outro-cycle"), 604800_000)
    integrity = exporter.verify_source(reader, {k for k in backend.data}, digests)
    assert integrity["stable"] is False
    assert integrity["values_changed"] >= 1


# ---------------------------------------------------------------------------
# importador
# ---------------------------------------------------------------------------

def test_import_gera_sql_com_lock_idempotencia_e_ttl(snapshot):
    api = FakeAPI()
    report = importer.import_snapshot(snapshot, api, apply=True, ref=importer.STAGING_REF)
    assert report["applied"] is True
    sql = next(q for q in api.queries if q.startswith("BEGIN;"))
    assert f"pg_advisory_xact_lock({contract.ADVISORY_IMPORT_KEY})" in sql
    assert "pg_advisory_xact_lock(hashtextextended(" in sql
    assert "ON CONFLICT (ticket_id) DO NOTHING" in sql
    assert "ON CONFLICT (endpoint) DO NOTHING" in sql
    assert "ON CONFLICT (key) DO NOTHING" in sql
    assert "make_interval(secs => 604800)" in sql
    assert "'attempted', NULL," in sql
    assert ENDPOINT in sql
    assert report["inserted"]["reminder_states"] == 1


def test_locks_antigos_nunca_viram_lock_ativo(snapshot):
    api = FakeAPI()
    importer.import_snapshot(snapshot, api, apply=True, ref=importer.STAGING_REF)
    sql = next(q for q in api.queries if q.startswith("BEGIN;"))
    state_insert = sql.split("INSERT INTO public.chamado_reminder_states", 1)[1].split("ON CONFLICT", 1)[0]
    assert "NULL, NULL, clock_timestamp()" in state_insert.replace("\n", " ").replace("  ", " ")
    assert TOKEN not in state_insert


def test_reimportacao_e_idempotente(snapshot):
    api = FakeAPI()
    first = importer.import_snapshot(snapshot, api, apply=True, ref=importer.STAGING_REF)
    second = importer.import_snapshot(snapshot, api, apply=True, ref=importer.STAGING_REF)
    assert first["applied"] and second["applied"]
    assert second["inserted"]["reminder_states"] == 0
    assert second["destination_counts_after"]["reminder_states"] == first["destination_counts_after"]["reminder_states"]


def test_dry_run_nao_escreve(snapshot):
    api = FakeAPI()
    report = importer.import_snapshot(snapshot, api, apply=False, ref=importer.STAGING_REF)
    assert report["applied"] is False
    assert report["reason"] == "dry_run"
    assert not any(q.startswith("BEGIN;") for q in api.queries)


def test_producao_e_recusada_antes_de_qualquer_query(snapshot, monkeypatch):
    api = FakeAPI()
    monkeypatch.setenv("SUPABASE_STAGING_PROJECT_REF", "ypkulvbllxgkjzhpzemf")
    monkeypatch.setenv("SUPABASE_STAGING_ACCESS_TOKEN", "token")
    with pytest.raises(importer.DestinationError):
        importer.import_snapshot(snapshot, api, apply=True, ref="ypkulvbllxgkjzhpzemf")
    assert api.queries == []


def test_fk_ausente_e_quarentenado(snapshot):
    api = FakeAPI(tickets=(), workspaces=())
    report = importer.import_snapshot(snapshot, api, apply=True, ref=importer.STAGING_REF)
    sql = next(q for q in api.queries if q.startswith("BEGIN;"))
    assert report["applied"] is True
    assert "INSERT INTO public.push_subscriptions" in sql
    assert "INSERT INTO public.chamado_reminder_states" not in sql
    assert any(d["reason"] == "missing_ticket_fk" for d in report["divergences"])


def test_dados_invalidos_nao_geram_insert(snapshot):
    api = FakeAPI()
    importer.import_snapshot(snapshot, api, apply=True, ref=importer.STAGING_REF)
    sql = next(q for q in api.queries if q.startswith("BEGIN;"))
    assert "nonsense" not in sql
    assert "expired" not in sql.split("INSERT INTO public.push_dedup_marks", 1)[-1]


def test_sem_expiracao_em_dedup_e_descartado():
    data = fake_data()
    key = contract.PREFIX_PUSH_SENT + "no-expiry"
    data[key] = ("string", f"reserved:{TOKEN}", -1)
    backend = FakeUpstash(data)
    reader = exporter.UpstashReader("https://example.invalid", "token", post=backend.post)
    snap, _ = exporter.export_snapshot(reader, verify=False)
    assert all(r["key"] != key for r in snap.records["push_dedup_marks"])
    assert any(d.reason == "no_expiry" for d in snap.divergences)


def test_inscricao_sem_ttl_fica_ativa(snapshot):
    api = FakeAPI()
    importer.import_snapshot(snapshot, api, apply=True, ref=importer.STAGING_REF)
    sql = next(q for q in api.queries if q.startswith("BEGIN;"))
    block = sql.split("INSERT INTO public.push_subscriptions", 1)[1].split("ON CONFLICT", 1)[0]
    assert block.strip().endswith("NULL)")


def test_cap_de_inscricoes_por_chamado(snapshot):
    for index in range(12):
        snapshot.add("chamado_push_subscriptions", {
            "ticket_id": TICKET,
            "payload": {"endpoint": f"https://push.example.invalid/extra/{index}", "keys": {}},
            "ttl_seconds": 600,
        })
    plan = contract.build_import_plan(snapshot)
    assert len(plan.chamado_subscriptions) == 10
    assert any(d.reason == "cap_exceeded" for d in plan.divergences)
