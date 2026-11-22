#!/usr/bin/env python3
"""Analisa mudanças de migrations e bloqueia alterações destrutivas/incompatíveis.

O CI roda sobre o DIFF do PR/push, não sobre todo o histórico: o repositório já
contém migrações legítimas com DROP COLUMN etc., e a política nova não pode
reprovar o passado. Para cada linha SQL adicionada em ``supabase/migrations/*.sql``:

  - ``DROP TABLE``, ``DROP SCHEMA``, ``TRUNCATE``, ``DELETE FROM``,
    ``DROP COLUMN`` e mudança de tipo de coluna são considerados destrutivos;
  - ``DROP POLICY/TRIGGER/FUNCTION/VIEW IF EXISTS`` e ``CREATE OR REPLACE`` são
    compatíveis e não bloqueiam;
  - um arquivo pode registrar explicitamente ``-- ci-destructive-ack: motivo``.
    Nesse caso a mudança é reportada como reconhecida, mas não é bloqueada —
    a decisão fica revisável no PR, sem aprovação manual no pipeline.

A ferramenta reporta e bloqueia (exit 1): nunca gera SQL, nunca executa rollback
e nunca conecta em banco compartilhado.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
_ACK_RE = re.compile(r"--\s*ci-destructive-ack:\s*\S+", re.IGNORECASE)
_COMMENT_RE = re.compile(r"^\s*--")
_BLOCK_PATTERNS = (
    (re.compile(r"\bDROP\s+(TABLE|SCHEMA|DATABASE)\b", re.IGNORECASE), "drop-object"),
    (re.compile(r"\bTRUNCATE\b", re.IGNORECASE), "truncate"),
    (re.compile(r"\bDELETE\s+FROM\b", re.IGNORECASE), "delete-data"),
    (re.compile(r"\bDROP\s+COLUMN\b", re.IGNORECASE), "drop-column"),
    (re.compile(r"\bDROP\s+(CONSTRAINT|EXTENSION)\b", re.IGNORECASE), "drop-dependency"),
    (re.compile(r"\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b", re.IGNORECASE), "alter-column-type"),
)
_SAFE_PATTERNS = (
    re.compile(
        r"\bDROP\s+(POLICY|TRIGGER|FUNCTION|VIEW|INDEX)\s+IF\s+EXISTS\b",
        re.IGNORECASE,
    ),
)


def changed_sql_files(base: str, head: str, root: Path) -> list[str]:
    effective_base = _EMPTY_TREE if set(base) == {"0"} else base
    proc = subprocess.run(
        ["git", "diff", "--name-only", effective_base, head, "--", "supabase/migrations"],
        cwd=root,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "git diff falhou")
    return [
        line.strip().replace("\\", "/")
        for line in proc.stdout.splitlines()
        if line.strip().replace("\\", "/").startswith("supabase/migrations/")
        and line.strip().endswith(".sql")
        and "/tests/" not in line.strip().replace("\\", "/")
    ]


def added_lines(base: str, head: str, root: Path, path: str) -> list[str]:
    effective_base = _EMPTY_TREE if set(base) == {"0"} else base
    proc = subprocess.run(
        ["git", "diff", "--unified=0", effective_base, head, "--", path],
        cwd=root,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "git diff falhou")
    lines = []
    for line in proc.stdout.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            lines.append(line[1:])
    return lines


def analyze(base: str, head: str, root: Path) -> tuple[list[str], list[str], list[str]]:
    blocked: list[str] = []
    acknowledged: list[str] = []
    files: list[str] = []
    for path in changed_sql_files(base, head, root):
        if "/tests/" in path or path.startswith("supabase/migrations/tests/"):
            continue
        full = root / path
        if not full.is_file():  # arquivo removido: não há linha adicionada
            continue
        content = full.read_text(encoding="utf-8", errors="replace")
        has_ack = bool(_ACK_RE.search(content))
        added = [line for line in added_lines(base, head, root, path) if not _COMMENT_RE.match(line)]
        findings: list[str] = []
        for line_no, line in enumerate(added, start=1):
            if any(pattern.search(line) for pattern in _SAFE_PATTERNS):
                continue
            for pattern, kind in _BLOCK_PATTERNS:
                if pattern.search(line):
                    findings.append(f"{path}:{line_no} [{kind}] {line.strip()[:160]}")
                    break

        # Uma mudança de tipo pode estar quebrada em várias linhas; varrer o
        # bloco adicionado inteiro evita que ``ALTER COLUMN x\n  TYPE y`` passe.
        joined = "\n".join(added)
        if joined:
            found_kinds = {item.split("[", 1)[1].split("]", 1)[0] for item in findings}
            for pattern, kind in _BLOCK_PATTERNS:
                if kind not in found_kinds and pattern.search(joined):
                    findings.append(f"{path}:bloco [{kind}] {joined.strip()[:160]}")
        if findings:
            files.append(path)
            if has_ack:
                acknowledged.extend(findings)
            else:
                blocked.extend(findings)
    return files, acknowledged, blocked


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-sha", required=True)
    parser.add_argument("--head-sha", default="HEAD")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    args = parser.parse_args(argv)

    try:
        files, acknowledged, blocked = analyze(
            args.base_sha, args.head_sha, Path(args.root).resolve()
        )
    except RuntimeError as exc:
        print(f"[migration-analysis] BLOCK: {exc}", file=sys.stderr)
        return 1

    print(f"[migration-analysis] arquivos de migration alterados: {len(set(files))}")
    for item in acknowledged:
        print(f"[migration-analysis] ACK {item}")
    for item in blocked:
        print(f"[migration-analysis] BLOCK {item}", file=sys.stderr)

    if blocked:
        print(
            "[migration-analysis] BLOCK: mudança destrutiva/incompatível sem "
            "justificativa revisável. Adicione `-- ci-destructive-ack: <motivo>` "
            "no arquivo se a operação for realmente necessária.",
            file=sys.stderr,
        )
        return 1

    print("[migration-analysis] PASS nenhuma mudança destrutiva não declarada")
    return 0


if __name__ == "__main__":
    sys.exit(main())
