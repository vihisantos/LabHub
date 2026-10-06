"""Migration runner do LabHub (aplica supabase/migrations/*.sql via Management API)."""

from .core import (
    MIGRATION_FILENAME_PATTERN,
    AppliedIdentityDivergence,
    AppliedIdentityError,
    BaselineConfigurationError,
    Migration,
    MigrationError,
    MigrationFilenameError,
    MigrationVersionError,
    audit_applied_identities,
    discover_migrations,
    sql_string_literal,
    validate_migration_filename,
)
from .environment import (
    LOCAL,
    PRODUCTION,
    TargetEnvironmentError,
    TargetPolicy,
    resolve_policy,
    validate_project_ref,
)
from .runner import RunnerResult, run

__all__ = [
    "LOCAL",
    "MIGRATION_FILENAME_PATTERN",
    "PRODUCTION",
    "AppliedIdentityDivergence",
    "AppliedIdentityError",
    "BaselineConfigurationError",
    "Migration",
    "MigrationError",
    "MigrationFilenameError",
    "MigrationVersionError",
    "RunnerResult",
    "TargetEnvironmentError",
    "TargetPolicy",
    "audit_applied_identities",
    "discover_migrations",
    "resolve_policy",
    "run",
    "sql_string_literal",
    "validate_migration_filename",
    "validate_project_ref",
]
