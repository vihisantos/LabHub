"""Garantias da janela de observação 9.3-D (monitor de drift do espelho).

1. O monitor (`scripts/check_membership_mirror_drift.py`) é read-only por
   construção: nenhuma chamada de escrita, RPC ou sync — usá-lo para
   "corrigir" mascararia o problema que a janela existe para detectar.
2. A categorização do monitor cobre os casos esperados (incluindo o caminho
   de divergência com exit code 2).
"""
import ast
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_membership_mirror_drift.py"

FORBIDDEN_SUBSTRINGS = [
    "requests.post(",
    "requests.patch(",
    "requests.put(",
    "requests.delete(",
    "sync_user_memberships",
    "INSERT INTO",
    "UPDATE public.",
    "DELETE FROM",
]

FORBIDDEN_IDENTIFIERS = [
    "sync_user_memberships",
]


def _source() -> str:
    return SCRIPT.read_text(encoding="utf-8")


def _function_names(tree: ast.AST):
    return [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]


def test_monitor_existe_e_parseia():
    assert SCRIPT.is_file(), "script do monitor ausente"
    ast.parse(_source())


def test_monitor_sem_chamadas_de_escrita():
    source = _source()
    for forbidden in FORBIDDEN_SUBSTRINGS:
        assert forbidden not in source, f"monitor contém escrita proibida: {forbidden}"


def test_monitor_nao_referencia_sync_legado():
    source = _source()
    for identifier in FORBIDDEN_IDENTIFIERS:
        assert identifier not in source, f"monitor referencia sync legado: {identifier}"


def test_monitor_tem_categorias_esperadas_e_exit_codes():
    tree = ast.parse(_source())
    names = _function_names(tree)
    assert "audit" in names
    assert "main" in names
    source = _source()
    for category in ("ok_convergente", "super_admin", "nao_ativo", "role_desconhecida"):
        assert category in source
    assert "return 2" in source  # divergência inesperada
    assert "return 1" in source  # erro de infraestrutura
