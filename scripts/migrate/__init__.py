"""Migration runner do LabHub (aplica supabase/migrations/*.sql via Management API)."""

from .core import Migration, MigrationError, MigrationVersionError, discover_migrations
from .runner import RunnerResult, run

__all__ = [
    "Migration",
    "MigrationError",
    "MigrationVersionError",
    "RunnerResult",
    "discover_migrations",
    "run",
]
