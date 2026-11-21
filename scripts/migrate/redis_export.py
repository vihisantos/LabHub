"""Exportador SOMENTE LEITURA do Upstash para o snapshot de migração.

Uso:
    python scripts/migrate/redis_export.py --out snapshot.json

Credenciais são lidas exclusivamente de ``UPSTASH_REDIS_REST_URL`` e
``UPSTASH_REDIS_REST_TOKEN`` (ou de um arquivo passado em ``--env``). Nada é
registrado em log: a saída contém apenas contagens. O arquivo gerado contém
payloads de inscrição e é gravado com permissão 0600.

Comandos permitidos: SCAN, TYPE, PTTL, GET, SMEMBERS. Qualquer outro comando
(DEL, SET, EVAL, ...) é rejeitado antes do request. A origem nunca é apagada
nem modificada.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

try:
    import requests
except ImportError:  # pragma: no cover - requests é dependência padrão do repo
    requests = None  # type: ignore[assignment]

try:
    from .redis_contract import (  # importado como pacote
        KEY_PUSH_SUBSCRIBERS,
        PATTERNS,
        PREFIX_LOCK,
        PREFIX_MARK,
        PREFIX_PUSH_CHAMADO,
        PREFIX_PUSH_SENT,
        PREFIX_STATE,
        Snapshot,
        fingerprint,
        normalize_dedup,
        normalize_lock,
        normalize_mark,
        normalize_state,
        normalize_subscription,
    )
except ImportError:  # execução direta
    from redis_contract import (  # type: ignore[no-redef]
        KEY_PUSH_SUBSCRIBERS,
        PATTERNS,
        PREFIX_LOCK,
        PREFIX_MARK,
        PREFIX_PUSH_CHAMADO,
        PREFIX_PUSH_SENT,
        PREFIX_STATE,
        Snapshot,
        fingerprint,
        normalize_dedup,
        normalize_lock,
        normalize_mark,
        normalize_state,
        normalize_subscription,
    )

READ_ONLY_COMMANDS = frozenset({"SCAN", "TYPE", "PTTL", "GET", "SMEMBERS"})
_MAX_SCAN_ROUNDS = 10000


def load_env(path: Path) -> None:
    """Carrega variáveis de um .env sem imprimir valores (opcional)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def _result(resp: Any) -> Any:
    status = getattr(resp, "status_code", None)
    if status is None or status >= 300:
        # Não logar corpo: ele pode conter valores Redis.
        raise RuntimeError(f"Upstash REST respondeu HTTP {status}")
    try:
        payload = resp.json()
    except (AttributeError, TypeError, ValueError) as exc:
        raise RuntimeError("Upstash REST respondeu JSON inválido") from exc
    if isinstance(payload, dict):
        if "error" in payload:
            raise RuntimeError("Upstash REST retornou erro")
        return payload.get("result")
    return payload


class UpstashReader:
    """Cliente mínimo e somente leitura da Upstash REST."""

    def __init__(self, url: str, token: str, post: Callable[..., Any] | None = None):
        if not url or not token:
            raise ValueError("UPSTASH_REDIS_REST_URL/TOKEN não configurados")
        if requests is None and post is None:
            raise RuntimeError("requests não disponível")
        self._url = url.strip().rstrip("/")
        self._token = token.strip()
        self._post = post or requests.post  # type: ignore[operator]
        self.commands: list[str] = []

    def command(self, *args: Any) -> Any:
        name = str(args[0]).upper()
        if name not in READ_ONLY_COMMANDS:
            raise ValueError(f"comando não permitido no exportador: {name}")
        self.commands.append(name)
        resp = self._post(
            self._url,
            json=[str(a) for a in args],
            headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
            timeout=30,
        )
        return _result(resp)

    def scan(self, pattern: str) -> list[str]:
        cursor: Any = "0"
        keys: set[str] = set()
        for _ in range(_MAX_SCAN_ROUNDS):
            raw = self.command("SCAN", cursor, "MATCH", pattern, "COUNT", 1000)
            if not isinstance(raw, (list, tuple)) or len(raw) != 2:
                raise RuntimeError("resposta SCAN inesperada")
            cursor, batch = raw[0], raw[1]
            if isinstance(batch, str):
                batch = [batch]
            if isinstance(batch, (list, tuple, set)):
                keys.update(k for k in batch if isinstance(k, str))
            if str(cursor) in ("0", "0-0", ""):
                return sorted(keys)
        raise RuntimeError("SCAN não convergiu")

    def key_type(self, key: str) -> str:
        return str(self.command("TYPE", key) or "none")

    def ttl(self, key: str) -> int:
        try:
            return int(self.command("PTTL", key))
        except (TypeError, ValueError):
            return -2

    def value(self, key: str, kind: str) -> Any:
        if kind == "set":
            raw = self.command("SMEMBERS", key)
            return list(raw) if isinstance(raw, (list, tuple, set)) else []
        return self.command("GET", key)


def _value_digest(key: str, value: Any) -> str:
    if isinstance(value, (list, tuple, set)):
        normalized = ",".join(sorted(str(v) for v in value))
    else:
        normalized = str(value)
    payload = key + "\x00" + normalized
    return hashlib.sha256(payload.encode("utf-8", "replace")).hexdigest()


def _classify(key: str) -> tuple[str, str | None]:
    if key == KEY_PUSH_SUBSCRIBERS:
        return "push_subscribers", None
    if key.startswith(PREFIX_STATE):
        return "reminder_state", None
    if key.startswith(PREFIX_LOCK):
        return "reminder_lock", None
    if key.startswith(PREFIX_MARK):
        return "reminder_mark", None
    if key.startswith(PREFIX_PUSH_CHAMADO):
        return "chamado_subs", key[len(PREFIX_PUSH_CHAMADO):]
    if key.startswith(PREFIX_PUSH_SENT):
        return "dedup", None
    return "unknown", None


def export_snapshot(reader: UpstashReader, *, verify: bool = True) -> tuple[Snapshot, dict[str, str]]:
    """Lê todas as chaves conhecidas e devolve (snapshot, digests de integridade)."""
    snapshot = Snapshot()
    snapshot.generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    digests: dict[str, str] = {}

    discovered: set[str] = set()
    for pattern in PATTERNS:
        for key in reader.scan(pattern):
            discovered.add(key)
    snapshot.counts["scanned"] = len(discovered)

    for key in sorted(discovered):
        category, ticket_id = _classify(key)
        try:
            kind = reader.key_type(key)
            ttl_ms = reader.ttl(key)
            ttl_seconds = -2 if ttl_ms <= -2 else (-1 if ttl_ms == -1 else max(1, (ttl_ms + 999) // 1000))
            value = reader.value(key, kind)
            digests[fingerprint(key)] = _value_digest(key, value)

            if category == "unknown":
                snapshot.counts["skipped"] += 1
                continue
            if category == "reminder_state":
                if ttl_seconds in (0, -2):
                    snapshot.counts["expired"] += 1
                    continue
                record = normalize_state(key, value, ttl_seconds)
                target = "reminder_states"
            elif category == "reminder_lock":
                # Locks são efêmeros: apenas contagem, sem token no snapshot.
                record = normalize_lock(key, ttl_seconds)
                target = "reminder_locks_ignored"
            elif category == "reminder_mark":
                if ttl_seconds in (0, -2):
                    snapshot.counts["expired"] += 1
                    continue
                record = normalize_mark(key, value, ttl_seconds)
                target = "reminder_marks"
            elif category == "push_subscribers":
                if ttl_seconds == -2:
                    snapshot.counts["expired"] += 1
                    continue
                values = value if isinstance(value, list) else []
                records = [normalize_subscription(v, ttl_seconds) for v in values]
                invalid = sum(r is None for r in records)
                records = [r for r in records if r is not None]
                for rec in records:
                    snapshot.add("push_subscriptions", rec)
                snapshot.counts["invalid"] += invalid
                snapshot.counts["skipped"] += invalid
                continue
            elif category == "chamado_subs":
                if ttl_seconds == -2:
                    snapshot.counts["expired"] += 1
                    continue
                values = value if isinstance(value, list) else []
                records = [normalize_subscription(v, ttl_seconds, ticket_id) for v in values]
                invalid = sum(r is None for r in records)
                records = [r for r in records if r is not None]
                for rec in records:
                    snapshot.add("chamado_push_subscriptions", rec)
                snapshot.counts["invalid"] += invalid
                snapshot.counts["skipped"] += invalid
                continue
            else:
                if ttl_seconds in (0, -2):
                    snapshot.counts["expired"] += 1
                    continue
                if ttl_seconds < 0:
                    snapshot.diverge("push_dedup_marks", "no_expiry", key)
                    snapshot.counts["skipped"] += 1
                    continue
                record = normalize_dedup(key, value, ttl_seconds)
                target = "push_dedup_marks"

            if record is None:
                snapshot.diverge(target, "invalid_source_record", key)
                snapshot.counts["skipped"] += 1
            else:
                snapshot.add(target, record)
        except Exception:  # falha de leitura por chave: fail-closed, sem vazar valores
            snapshot.diverge(category, "read_failed", key)
            snapshot.counts["skipped"] += 1

    if verify:
        snapshot.source_integrity = verify_source(reader, discovered, digests)
    return snapshot, digests


def verify_source(reader: UpstashReader, expected_keys: set[str], digests: dict[str, str]) -> dict[str, Any]:
    """Re-scan somente leitura para provar que a origem não foi alterada."""
    current: set[str] = set()
    for pattern in PATTERNS:
        current.update(reader.scan(pattern))

    unchanged = 0
    changed: list[str] = []
    for key in sorted(current):
        fp = fingerprint(key)
        expected = digests.get(fp)
        if expected is None:
            changed.append(fp)
            continue
        kind = reader.key_type(key)
        actual = _value_digest(key, reader.value(key, kind))
        if actual == expected:
            unchanged += 1
        else:
            changed.append(fp)

    missing = sorted(fingerprint(k) for k in expected_keys - current)
    result = {
        "keys_before": len(expected_keys),
        "keys_after": len(current),
        "values_unchanged": unchanged,
        "values_changed": len(changed),
        "keys_missing": len(missing),
        "stable": not changed and not missing and len(current) == len(expected_keys),
    }
    if changed or missing:
        result["changed_fingerprints"] = changed[:20] + missing[:20]
    return result


def assert_no_credentials(snapshot: Snapshot, url: str, token: str) -> None:
    """Barreira final: nenhuma credencial pode entrar no artefato."""
    text = json.dumps(snapshot.to_dict(), ensure_ascii=False)
    secrets = [s for s in (token, url, url.rstrip("/")) if s and len(s) >= 8]
    if any(secret in text for secret in secrets):
        raise RuntimeError("credencial detectada no snapshot; exportação abortada")


def write_artifact(snapshot: Snapshot, path: Path, *, url: str, token: str) -> None:
    assert_no_credentials(snapshot, url, token)
    text = json.dumps(snapshot.to_dict(), ensure_ascii=False, indent=2, sort_keys=True)
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.write("\n")
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
    try:
        os.chmod(path, 0o600)
    except OSError:  # Windows pode não honrar chmod; o arquivo ainda é local
        pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, help="arquivo JSON do snapshot (será criado com 0600)")
    parser.add_argument("--env", help="arquivo .env opcional para carregar credenciais")
    parser.add_argument("--no-verify", action="store_true", help="não re-scanear a origem ao final")
    args = parser.parse_args(argv)

    if args.env:
        load_env(Path(args.env))
    url = os.environ.get("UPSTASH_REDIS_REST_URL", "").strip()
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "").strip()
    if not url or not token:
        print("UPSTASH_REDIS_REST_URL/TOKEN não configurados", file=sys.stderr)
        return 2

    try:
        reader = UpstashReader(url, token)
        snapshot, _ = export_snapshot(reader, verify=not args.no_verify)
        write_artifact(snapshot, Path(args.out), url=url, token=token)
    except Exception as exc:
        print(f"Falha na exportação: {exc}", file=sys.stderr)
        return 1

    counts = snapshot.counts
    integrity = snapshot.source_integrity
    print(
        "Exportação concluída: "
        f"scanned={counts['scanned']} exported={counts['exported']} "
        f"invalid={counts['invalid']} expired={counts['expired']} skipped={counts['skipped']}"
    )
    if integrity:
        print(
            "Integridade da origem: "
            f"stable={integrity.get('stable')} "
            f"keys_before={integrity.get('keys_before')} keys_after={integrity.get('keys_after')}"
        )
    print("Nenhuma chave foi apagada ou modificada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
