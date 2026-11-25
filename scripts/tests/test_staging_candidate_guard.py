"""Pure shared staging collision and promotion tests (no database)."""
from pathlib import Path
import sys

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from ci.staging_candidate_guard import plan, PREVERIFIED  # noqa: E402

NAME = "122_chamados_queue_revisions.sql"
DIGEST = "a" * 64
BLOB = PREVERIFIED[NAME]
CANDIDATES = {"122": (NAME, DIGEST, BLOB)}
CURRENT = {"121": ("121_base.sql", "b" * 64), "122": (NAME, DIGEST)}
APPLIED_BASE = [{"version": "121", "filename": "121_base.sql"}]
APPLIED = APPLIED_BASE + [{"version": "122", "filename": NAME}]
RESERVED = [{"version": "122", "filename": NAME, "sha256": DIGEST}]
VERIFIED = [dict(RESERVED[0], verified_commit="c" * 40)]


def test_pr_reserves_new_candidate_and_accepts_same_retry():
    assert plan(CANDIDATES, CURRENT, APPLIED_BASE, [], "pull_request") == [("122", NAME, DIGEST)]
    assert plan(CANDIDATES, CURRENT, APPLIED, RESERVED, "pull_request") == []


def test_manual_122_exact_preverified_blob_only():
    assert plan(CANDIDATES, CURRENT, APPLIED, [], "pull_request") == [("122", NAME, DIGEST)]
    with pytest.raises(ValueError, match="no verified fingerprint"):
        plan({"122": (NAME, DIGEST, "f" * 40)}, CURRENT, APPLIED, [], "pull_request")


@pytest.mark.parametrize("change", ["filename", "sha256"])
def test_other_candidate_cannot_reuse_version(change):
    other = dict(RESERVED[0], **{change: "different"})
    with pytest.raises(ValueError, match="incompatible candidate"):
        plan(CANDIDATES, CURRENT, APPLIED_BASE, [other], "pull_request")


def test_applied_other_pr_is_blocked():
    with pytest.raises(ValueError, match="outside this commit"):
        plan({}, {"121": CURRENT["121"]}, APPLIED, [], "pull_request")


def test_main_requires_reserved_and_applied_candidate():
    assert plan(CANDIDATES, CURRENT, APPLIED, VERIFIED, "push") == []
    with pytest.raises(ValueError, match="not prevalidated"):
        plan(CANDIDATES, CURRENT, APPLIED, RESERVED, "push")
    with pytest.raises(ValueError, match="not prevalidated"):
        plan(CANDIDATES, CURRENT, APPLIED, [], "push")
    with pytest.raises(ValueError, match="not prevalidated"):
        plan(CANDIDATES, CURRENT, APPLIED_BASE, VERIFIED, "push")


def test_reservation_from_other_pr_blocks_even_before_apply():
    with pytest.raises(ValueError, match="incompatible candidate"):
        plan({}, {"121": CURRENT["121"]}, APPLIED_BASE, RESERVED, "pull_request")

def test_later_main_push_cannot_bypass_failed_premerge():
    with pytest.raises(ValueError, match="not prevalidated"):
        plan({}, CURRENT, APPLIED, RESERVED, "push")
    assert plan({}, CURRENT, APPLIED, VERIFIED, "push") == []


def test_cannot_append_to_unmerged_candidate():
    extra = ("123_extra.sql", "b" * 64, "d" * 40)
    with pytest.raises(ValueError, match="unmerged candidate"):
        plan({**CANDIDATES, "123": extra}, {**CURRENT, "123": extra[:2]},
             APPLIED, VERIFIED, "pull_request")


@pytest.mark.parametrize("state,conclusion,job_result,should_pass", [
    ("completed", "success", "success", True),
    ("in_progress", None, "success", False),
    ("completed", "failure", "failure", False),
    ("completed", "success", "skipped", False),
])
def test_main_delivery_guard(monkeypatch, state, conclusion, job_result, should_pass):
    from ci import staging_candidate_guard as guard

    sha = "c" * 40
    monkeypatch.setattr(guard, "_main_head_sha", lambda *_args: sha)
    monkeypatch.setattr(guard, "_migrations_workflow_id", lambda *_args: 42)

    def fake_get(url, token, params):
        if url.endswith("/workflows/42/runs"):
            assert params["head_sha"] == sha
            return {"workflow_runs": [{"id": 123, "head_sha": sha,
                                       "head_branch": "main", "event": "push",
                                       "status": state, "conclusion": conclusion}]}
        assert url.endswith("/runs/123/jobs")
        return {"jobs": [{"name": "Apply pending migrations to Production",
                          "status": "completed", "conclusion": job_result}]}

    monkeypatch.setattr(guard, "_get_json", fake_get)
    if should_pass:
        guard.require_main_settled(sha, api_url="https://api.github.com", repo="owner/repo", token="fake")
    else:
        with pytest.raises(ValueError):
            guard.require_main_settled(sha, api_url="https://api.github.com", repo="owner/repo", token="fake")


def test_main_delivery_guard_rejects_outdated_base(monkeypatch):
    from ci import staging_candidate_guard as guard
    monkeypatch.setattr(guard, "_main_head_sha", lambda *_args: "d" * 40)
    with pytest.raises(ValueError, match="no longer main"):
        guard.require_main_settled("c" * 40, api_url="https://api.github.com", repo="owner/repo", token="fake")
