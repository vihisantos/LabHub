"""Concorrência do gate: identidade de workflow, commit, HEAD e erros da API.

Nenhum teste faz requisição real: ``_get_json`` é substituído por um mock que
simula os três endpoints usados por ``release_gate``:

* ``/actions/workflows`` — descoberta do workflow pelo PATH canônico;
* ``/actions/workflows/{id}/runs`` — execuções do pipeline de Migrations;
* ``/git/ref/heads/main`` — HEAD atual da branch.

A listagem global ``/actions/runs`` é armadilha: se o código a consultar, o
mock devolve um run de OUTRO workflow com ID maior e o teste falha.
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
_REPO = "vihisantos/LabHub"


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
        "project_ref_fingerprint": gate._EXPECTED_STAGING_FINGERPRINT,
        "tests_passed": True,
        "health_checks_passed": True,
        "mandatory_steps": {step: True for step in gate._MANDATORY_STEPS},
        "migrations_applied": ["100"],
        "migrations_pending": ["100"],
    }
    path = tmp_path / "staging-release.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _args(gate, attestation: Path, command: str = "preapply",
          commit: str = _COMMIT, run_id: int = _RUN_ID):
    return gate.build_parser().parse_args([
        command,
        "--attestation", str(attestation),
        "--commit-sha", commit,
        "--run-id", str(run_id),
        "--repo", _REPO,
        "--branch", "main",
    ])


def _run(run_id: int, sha: str, branch: str = "main") -> dict:
    return {
        "id": run_id,
        "head_sha": sha,
        "head_branch": branch,
        "name": "Migrations",
        "event": "push",
    }


def _mock_github(monkeypatch, gate, *, head: str = _COMMIT, runs=None,
                 workflows=None) -> None:
    """Instala a API fake. ``/actions/runs`` é armadilha para detectar bypass."""
    if workflows is None:
        workflows = [
            {"id": 7, "path": ".github/workflows/ci.yml", "name": "CI"},
            {"id": 13, "path": ".github/workflows/codeql.yml", "name": "CodeQL"},
            {"id": 42, "path": gate._MIGRATIONS_WORKFLOW_PATH, "name": "Migrations"},
        ]
    if runs is None:
        runs = []

    def fake_get_json(url: str, token: str, params=None):
        if url.endswith("/actions/runs"):
            raise AssertionError("listagem global /actions/runs não pode decidir obsolescência")
        if url.endswith("/actions/workflows"):
            return {"total_count": len(workflows), "workflows": workflows}
        if "/actions/workflows/" in url and url.endswith("/runs"):
            assert "/42/runs" in url, f"workflow_id incorreto na URL: {url}"
            return {"total_count": len(runs), "workflow_runs": runs}
        if "/git/ref/heads/" in url:
            return {"object": {"sha": head}}
        raise AssertionError(f"URL inesperada: {url}")

    monkeypatch.setattr(gate, "_get_json", fake_get_json)


# ─────────────────── 1) WORKFLOWS PARALELOS NÃO BLOQUEIAM ──────────────────


def test_other_workflow_with_higher_id_does_not_block(tmp_path, monkeypatch, capsys) -> None:
    """CI/CodeQL no mesmo commit, com ID maior, não invalida a promoção."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    # A armadilha é o endpoint global; o código correto nunca o chama.
    _mock_github(monkeypatch, gate, runs=[_run(_RUN_ID, _COMMIT)])

    assert gate.preapply(_args(gate, attestation)) == 0
    assert "PASS pré-apply" in capsys.readouterr().out


def test_migrations_workflow_from_same_commit_does_not_block(tmp_path, monkeypatch) -> None:
    """Re-run do MESMO commit no pipeline de Migrations não é substituto."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate, runs=[
        _run(_RUN_ID, _COMMIT),
        _run(_RUN_ID + 50, _COMMIT),
    ])
    assert gate.preapply(_args(gate, attestation)) == 0


# ───────────────── 2) RUN DE MIGRATIONS POSTERIOR BLOQUEIA ─────────────────


def test_new_migrations_run_on_later_commit_blocks(tmp_path, monkeypatch, capsys) -> None:
    """Novo run do pipeline em commit posterior bloqueia o anterior."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate, runs=[
        _run(_RUN_ID, _COMMIT),
        _run(_RUN_ID + 1, _HEAD),
    ])

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "obsoleto" in capsys.readouterr().err


# ───────────────────── 3) DIVERGÊNCIA DE COMMIT ────────────────────────────


def test_commit_divergent_from_main_head_blocks(tmp_path, monkeypatch, capsys) -> None:
    """Push posterior mudou o HEAD da main entre o gate e o apply."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate, head=_HEAD, runs=[])

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "divergiu" in capsys.readouterr().err


# ────────────────── 4) API INCOMPLETA / COM ERRO BLOQUEIA ──────────────────


def test_incomplete_workflow_list_blocks(tmp_path, monkeypatch, capsys) -> None:
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate, workflows=[])

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_incomplete_run_identity_blocks(tmp_path, monkeypatch, capsys) -> None:
    """Run sem head_sha/head_branch não pode ser tratado como inofensivo."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate, runs=[{"id": 999, "head_sha": _HEAD}])

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_incomplete_runs_payload_blocks(tmp_path, monkeypatch, capsys) -> None:
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)

    def fake_get_json(url, token, params=None):
        if url.endswith("/actions/workflows"):
            return {"workflows": [
                {"id": 42, "path": gate._MIGRATIONS_WORKFLOW_PATH}
            ]}
        return {"unexpected": "payload"}

    monkeypatch.setattr(gate, "_get_json", fake_get_json)
    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_malformed_head_response_blocks(tmp_path, monkeypatch, capsys) -> None:
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate)

    def malformed(*_args, **_kwargs):
        raise ValueError("ref da branch principal ausente/inválido na API do GitHub")

    monkeypatch.setattr(gate, "_main_head_sha", malformed)
    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_github_api_failure_blocks_both_gates(tmp_path, monkeypatch, capsys) -> None:
    """Erro/timeout da API não pode ser tratado como 'sem runs novos'."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)

    def boom(*_args, **_kwargs):
        raise requests.RequestException("timeout simulado")

    monkeypatch.setattr(gate, "_get_json", boom)
    assert gate.preapply(_args(gate, attestation)) == 1
    assert "BLOCK" in capsys.readouterr().err
    assert gate.verify(_args(gate, attestation, command="verify")) == 1
    assert "BLOCK" in capsys.readouterr().err


# ──────────────── 5) RUN VÁLIDO É AUTOMATICAMENTE PERMITIDO ────────────────


def test_valid_run_is_allowed_automatically(tmp_path, monkeypatch, capsys) -> None:
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate, runs=[_run(_RUN_ID, _COMMIT)])

    assert gate.preapply(_args(gate, attestation)) == 0
    assert "PASS pré-apply" in capsys.readouterr().out
    assert gate.verify(_args(gate, attestation, command="verify")) == 0
    assert "PASS promoção autorizada" in capsys.readouterr().out


# ───────────────────────── OUTRAS BARREIRAS ────────────────────────────────


def test_wrong_staging_fingerprint_blocks(tmp_path, monkeypatch, capsys) -> None:
    """Artifact de outro projeto não autoriza esta promoção."""
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    payload = json.loads(attestation.read_text(encoding="utf-8"))
    payload["project_ref_fingerprint"] = "ffffffffffff"
    attestation.write_text(json.dumps(payload), encoding="utf-8")
    _mock_github(monkeypatch, gate)

    assert gate.preapply(_args(gate, attestation)) == 1
    assert "fingerprint" in capsys.readouterr().err


def test_commit_and_run_mismatch_blocks(tmp_path, monkeypatch, capsys) -> None:
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    _mock_github(monkeypatch, gate)

    assert gate.preapply(_args(gate, attestation, commit=_HEAD)) == 1
    assert gate.preapply(_args(gate, attestation, run_id=999)) == 1
    assert "BLOCK" in capsys.readouterr().err


def test_missing_token_blocks_before_any_api_call(tmp_path, monkeypatch, capsys) -> None:
    gate = _load_gate(monkeypatch)
    attestation = _attestation(tmp_path, gate)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("API não deveria ser chamada sem token")

    monkeypatch.setattr(gate, "_get_json", forbidden)
    assert gate.preapply(_args(gate, attestation)) == 1
    assert "GITHUB_TOKEN" in capsys.readouterr().err
