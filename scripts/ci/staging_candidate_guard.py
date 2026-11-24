#!/usr/bin/env python3
"""Fail closed on shared staging candidate collisions; never connect to production.

The existing runner audits version/filename. This guard additionally reserves
a SHA-256 of each new SQL file before apply. A different candidate cannot reuse
its version, filename or bytes in the shared staging project. A main push must
find each newly introduced migration already applied and fingerprinted.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from migrate.api import ManagementAPI  # noqa: E402
from migrate.core import discover_migrations, sql_string_literal  # noqa: E402
from migrate.environment import (  # noqa: E402
    STAGING, resolve_policy, validate_expected_destination, validate_project_ref,
)

PREFIX = "supabase/migrations/"
TABLE = "labhub_migration_ci.staging_fingerprints"
# The exact 122 file was manually applied and transaction/RLS tested in staging
# before this gate existed. No general adoption of unknown applied SQL.
PREVERIFIED = {"122_chamados_queue_revisions.sql": "7b2d59bb92aa328dfae60f85a01a324736df40d2"}


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT)


def candidate_files(base_sha: str) -> tuple[dict[str, tuple[str, str, str]], dict[str, tuple[str, str]]]:
    if not re.fullmatch(r"[0-9a-f]{40}", base_sha) or base_sha == "0" * 40:
        raise ValueError("base SHA invalid")
    base = {
        path for path in git("ls-tree", "-r", "--name-only", base_sha, "--", PREFIX).decode().splitlines()
        if re.fullmatch(r"supabase/migrations/\d{3,}_[a-z0-9_]+\.sql", path)
    }
    candidates = {}
    current = {}
    for migration in discover_migrations(ROOT / PREFIX):
        data = migration.path.read_bytes()
        path = PREFIX + migration.filename
        digest = hashlib.sha256(data).hexdigest()
        current[migration.version] = (migration.filename, digest)
        if path in base:
            if git("show", base_sha + ":" + path) != data:
                raise ValueError("already merged migration modified: " + migration.filename)
            base.remove(path)
        else:
            blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data, usedforsecurity=False).hexdigest()
            candidates[migration.version] = (migration.filename, digest, blob)
    if base:
        raise ValueError("already merged migration removed or renamed")
    return candidates, current


def plan(candidates, current, applied, fingerprints, event):
    """Pure guard: no writes before all identities have been checked."""
    if event not in ('pull_request', 'push'):
        raise ValueError('invalid event')
    reserved = {}
    verified = set()
    for row in fingerprints:
        version = row["version"]
        identity = (row["filename"], row["sha256"])
        if current.get(version) != identity:
            raise ValueError("staging reserved for incompatible candidate version " + version)
        reserved[version] = identity
        if re.fullmatch(r"[0-9a-f]{40}", row.get("verified_commit") or ""):
            verified.add(version)

    applied_map = {row["version"]: row["filename"] for row in applied if row["filename"] != "__baseline__"}
    for version, filename in applied_map.items():
        if version not in current or current[version][0] != filename:
            raise ValueError("staging contains migration outside this commit: " + filename)

    additions = []
    for version, (filename, digest, blob) in candidates.items():
        if event == "push":
            if (reserved.get(version) != (filename, digest) or applied_map.get(version) != filename
                    or version not in verified):
                raise ValueError("new main migration was not prevalidated in staging: " + filename)
        elif version not in reserved:
            if version in applied_map and PREVERIFIED.get(filename) != blob:
                raise ValueError("already applied candidate has no verified fingerprint: " + filename)
            additions.append((version, filename, digest))
    return additions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-sha", required=True)
    parser.add_argument("--event", choices=("pull_request", "push"), required=True)
    parser.add_argument("--mark-verified", metavar="COMMIT_SHA")
    args = parser.parse_args()
    try:
        if args.mark_verified and (args.event != "pull_request" or not re.fullmatch(r"[0-9a-f]{40}", args.mark_verified)):
            raise ValueError("invalid PR verification commit")
        candidates, current = candidate_files(args.base_sha)
        policy = resolve_policy(target=STAGING)
        ref_var, token_var = policy.credential_vars()
        ref = os.environ.get(ref_var, "")
        validate_project_ref(ref, policy)
        validate_expected_destination(ref, policy)
        token = os.environ.get(token_var, "")
        if not token:
            raise ValueError("staging credential missing")
        api = ManagementAPI(access_token=token, project_ref=ref,
                            access_token_env_var=token_var, project_ref_env_var=ref_var)
        applied = api.query("SELECT version, filename FROM public.schema_migrations")
        exists = api.query("SELECT to_regclass('labhub_migration_ci.staging_fingerprints') IS NOT NULL AS present")
        if not isinstance(applied, list) or not exists or not isinstance(exists[0].get("present"), bool):
            raise ValueError("invalid staging migration history response")
        if exists[0]["present"]:
            columns = api.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='labhub_migration_ci' AND table_name='staging_fingerprints' AND column_name='verified_commit') AS present")
            if not columns or not isinstance(columns[0].get("present"), bool):
                raise ValueError("invalid staging fingerprint schema")
            if not columns[0]["present"]:
                # Upgrade only the staging-local CI metadata, never product schema.
                api.query("ALTER TABLE " + TABLE + " ADD COLUMN IF NOT EXISTS verified_commit text")
        fingerprints = api.query("SELECT version, filename, sha256, verified_commit FROM " + TABLE) if exists[0]["present"] else []
        if not isinstance(fingerprints, list):
            raise ValueError("invalid staging fingerprint response")
        additions = plan(candidates, current, applied, fingerprints, args.event)
        if args.mark_verified:
            applied_map = {row["version"]: row["filename"] for row in applied}
            if additions or any(applied_map.get(version) != filename for version, (filename, _, _) in candidates.items()):
                raise ValueError("cannot mark unapplied or unreserved candidate as verified")
            if candidates:
                versions = ", ".join(sql_string_literal(version) for version in candidates)
                api.query("UPDATE " + TABLE + " SET verified_commit = " + sql_string_literal(args.mark_verified) + " WHERE version IN (" + versions + ")")
            print(f"[staging-candidate] PASS verified={len(candidates)}")
            return 0
        if additions:
            # Staging job is serialized with delivery. The transaction prevents
            # partial reservations. No browser role can read or alter this ledger.
            values = ", ".join("(" + ", ".join(sql_string_literal(v) for v in row) + ")" for row in additions)
            api.query(
                "BEGIN; SELECT pg_advisory_xact_lock(958823001); "
                "CREATE SCHEMA IF NOT EXISTS labhub_migration_ci; "
                "REVOKE ALL ON SCHEMA labhub_migration_ci FROM PUBLIC, anon, authenticated; "
                "CREATE TABLE IF NOT EXISTS " + TABLE + " (version text PRIMARY KEY, filename text NOT NULL, sha256 text NOT NULL, verified_commit text); "
                "ALTER TABLE " + TABLE + " ENABLE ROW LEVEL SECURITY; "
                "REVOKE ALL ON TABLE " + TABLE + " FROM PUBLIC, anon, authenticated; "
                "INSERT INTO " + TABLE + " (version,filename,sha256) VALUES " + values + "; COMMIT;"
            )
        print(f"[staging-candidate] PASS candidates={len(candidates)} reserved={len(additions)}")
        return 0
    except Exception as exc:
        print(f"[staging-candidate] BLOCK: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
