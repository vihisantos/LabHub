"""Carrega `api/app.py` UMA vez por sessão pytest (mesma chave compartilhada).

`api/app.py` NÃO cria um Flask app próprio: ele importa o `app` singleton do
módulo legado do ReservaLab (`from app import app`, issue #413). Re-executar o
arquivo com `importlib` sob outro nome de módulo re-registraria as rotas no
MESMO objeto Flask e levantaria
`AssertionError: View function mapping is overwriting an existing endpoint
function` durante a coleta do pytest.

A chave `root_api` é a mesma usada pela fixture session-scoped de
`test_tv_source.py`: o módulo passa a existir uma única vez na sessão,
independentemente da ordem de coleta dos arquivos de teste.
"""
import importlib.util
import sys
from pathlib import Path

API_FILE = Path(__file__).resolve().parents[1] / "app.py"


def load_api():
    """Retorna o módulo de `api/app.py`, executando-o no máximo uma vez."""
    key = "root_api"
    mod = sys.modules.get(key)
    if mod is not None:
        return mod
    spec = importlib.util.spec_from_file_location(key, API_FILE)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[key] = mod
    spec.loader.exec_module(mod)
    return mod
