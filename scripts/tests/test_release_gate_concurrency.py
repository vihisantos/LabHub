"""Concorrência do gate de promoção: run obsoleto, API indisponível, commit divergente.

O comando ``preapply`` é a última barreira antes do apply em produção. Nenhum
teste faz requisição real: apenas as funções de API são substituídas por mocks.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest
import requests

SCRIPTS = Path(__file__).resolve().parents[1]
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

_COMMIT = "a" * 40
_HEAD = "b" * 40
_RUN_ID = 123


def _load_gate(monkeypatch):
    name = f"release_gate_concurrency_{id(monkeypatch)}"
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / "ci" / "release_gate.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    monkeypatch.setenv("GITHUB_TOKEN", "token-falso")
    return module


def _attestation(tmp_path, gate, commit: str = _COMMIT) -> Path:
    payload = {
        "status": "passed",
        "target": "staging",
        "commit_sha": commit,
        "run_id": str(_RUN_ID),
        "project_ref_fingerprint": "0123456789ab",
        "tests_passed": True,
        "health_checks_passed": True,
        "mandatory_steps": {step: True for step in gate._MANDATORY_STEPS},
        "migrations_applied": ["100"],
        "migrations_pending": ["100"],
    }
    path = tmp_path / "staging-release.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _args(gate, attestation: Path, commit: str = _COMMIT, run_id: int = _RUN_ID):
    return gate.build_parser().parse_args([
        "preapply",
        "--attestation", str(attestation),
        "--commit-sha", commit,
        "--run-id", str(run_id),
        "--repo", "vihisantos/LabHub",
        "--branch", "main",
    ])


def test_preapply_blocks_stale_run(tmp_path, monkeypatch, capsys) -> None:
    """Run mais novo na main impede a aplicação mesmo com artifact válido."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    monkeypatch.setattr(gate, "_newer_runs", lambda *a: [{"id": 999}])
    monkeypatch.setattr(gate, "_main_head_sha", lambda *a: _COMMIT)

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_preapply_blocks_github_api_failure(tmp_path, monkeypatch, capsys) -> None:
    """Erro/timeout da API não pode ser tratado como 'sem runs novos'."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)

    def boom(*_args, **_kwargs):
        raise requests.RequestException("timeout simulado")

    monkeypatch.setattr(gate, "_newer_runs", boom)
    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err

    monkeypatch.setattr(gate, "_newer_runs", lambda *a: [])
    monkeypatch.setattr(gate, "_get_json", boom)
    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_preapply_blocks_main_head_divergence(tmp_path, monkeypatch, capsys) -> None:
    """Push novo entre o gate e o apply muda o HEAD da main: bloquear."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    monkeypatch.setattr(gate, "_newer_runs", lambda *a: [])
    monkeypatch.setattr(gate, "_main_head_sha", lambda *a: _HEAD)

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "divergiu" in capsys.readouterr().err


def test_preapply_rejects_malformed_head_response(tmp_path, monkeypatch, capsys) -> None:
    """Resposta inesperada da API do GitHub é fail-closed."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    monkeypatch.setattr(gate, "_newer_runs", lambda *a: [])
    monkeypatch.setattr(gate, "_get_json", lambda *a, **k: {"object": {"sha": None}})

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_preapply_rejects_commit_and_run_mismatch(tmp_path, monkeypatch, capsys) -> None:
    """Artifact de outro commit/run não autoriza esta aplicação."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    monkeypatch.setattr(gate, "_newer_runs", lambda *a: [])
    monkeypatch.setattr(gate, "_main_head_sha", lambda *a: _COMMIT)

    assert gate.preapply(_args(gate, attestation, commit=_HEAD)) == 1
    assert gate.preapply(_args(gate, attestation, run_id=999)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_preapply_passes_when_run_and_head_match(tmp_path, monkeypatch, capsys) -> None:
    """Caminho normal permanece automático: nenhuma aprovação adicional."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    monkeypatch.setattr(gate, "_newer_runs", lambda *a: [])
    monkeypatch.setattr(gate, "_main_head_sha", lambda *a: _COMMIT)

    assert gate.preapply(_args(gate, attestation)) == 0
    out = capsys.readouterr().out
    assert "PASS pré-apply" in out and _COMMIT in out


def test_verify_blocks_api_failure(tmp_path, monkeypatch, capsys) -> None:
    """O gate anterior também falha fechado se a API estiver indisponível."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    args = gate.build_parser().parse_args([
        "verify",
        "--attestation", str(attestation),
        "--commit-sha", _COMMIT,
        "--run-id", str(_RUN_ID),
        "--repo", "vihisantos/LabHub",
    ])

    def boom(*_args, **_kwargs):
        raise requests.RequestException("API indisponível")

    monkeypatch.setattr(gate, "_newer_runs", boom)
    assert gate.verify(args) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_preapply_blocks_missing_token(tmp_path, monkeypatch, capsys) -> None:
    """Sem token de leitura da API, nada é promovido."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("API não deveria ser chamada sem token")

    monkeypatch.setattr(gate, "_newer_runs", forbidden)
    monkeypatch.setattr(gate, "_main_head_sha", forbidden)
    assert gate.preapply(_args(gate, attestation)) == 1
    assert "GITHUB_TOKEN" in capsys.readouterr().err
