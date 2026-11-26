"""Shared root Flask API fixture loader for feedback/tracking regressions (#376).

The production root module decorates routes on the legacy shared Flask app.
Reloading it under another name leaves routes bound to the original globals,
so patching the newer module does not patch the registered handlers.
"""
import importlib.util
import sys
from pathlib import Path

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
CANONICAL_KEY = "root_api"


def load_root_api():
    # Prefer the module that owns the registered feedback route, if a previous
    # suite imported the root API under another key. Never reload the shared app.
    candidates = []
    for mod in list(sys.modules.values()):
        path = getattr(mod, "__file__", None)
        if path and Path(path).resolve() == API_FILE and getattr(mod, "app", None) is not None:
            candidates.append(mod)
    if candidates:
        for mod in candidates:
            view = mod.app.view_functions.get("chamados_feedback")
            if view is not None and getattr(view, "__module__", None) == mod.__name__:
                return mod
        return candidates[0]

    if CANONICAL_KEY in sys.modules:
        raise RuntimeError("root_api module name already occupied by a different module")
    spec = importlib.util.spec_from_file_location(CANONICAL_KEY, API_FILE)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load root API fixture")
    module = importlib.util.module_from_spec(spec)
    sys.modules[CANONICAL_KEY] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(CANONICAL_KEY, None)
        raise
    return module
