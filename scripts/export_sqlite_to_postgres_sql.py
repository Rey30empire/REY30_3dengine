from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DB = WORKSPACE_ROOT / "prisma" / "prisma" / "dev.db"
OUTPUT_SQL = WORKSPACE_ROOT / "output" / "sqlite-to-postgres-import.sql"

TABLE_ORDER = [
    "User",
    "Post",
    "AuthSession",
    "ApiCredential",
    "UserApiSettings",
    "UserUsagePolicy",
    "ProviderUsageLedger",
    "ProjectUsageLedger",
    "UserUsageAlertProfile",
    "ProjectUsageGoal",
    "BudgetApprovalRequest",
    "UserFinOpsAutopilot",
    "BudgetApprovalPolicy",
    "FinOpsAutomationControl",
    "FinOpsRemediationLog",
    "SecurityAuditLog",
]

BOOLEAN_COLUMNS = {
    "User": {"isActive"},
    "ApiCredential": {"enabled", "hasApiKey"},
    "UserUsagePolicy": {"hardStopEnabled"},
    "ProviderUsageLedger": {"blocked"},
    "ProjectUsageLedger": {"blocked"},
    "UserUsageAlertProfile": {"enabled", "includeLocalProviders"},
    "ProjectUsageGoal": {"isActive"},
    "UserFinOpsAutopilot": {"enabled", "seasonalityEnabled"},
    "BudgetApprovalPolicy": {
        "requireManualForProviderChanges",
        "requireReason",
        "alwaysRequireManual",
        "enabled",
    },
    "FinOpsAutomationControl": {
        "enabled",
        "allowPolicyMutations",
        "allowBudgetMutations",
    },
    "FinOpsRemediationLog": {"dryRun"},
}

ENUM_COLUMNS = {
    "User": {"role": "UserRole"},
    "ApiCredential": {"provider": "ApiProvider"},
    "ProviderUsageLedger": {"provider": "ApiProvider"},
    "ProjectUsageLedger": {"provider": "ApiProvider"},
    "BudgetApprovalRequest": {"status": "BudgetApprovalStatus"},
    "BudgetApprovalPolicy": {"role": "UserRole"},
    "FinOpsRemediationLog": {"status": "FinOpsRemediationStatus"},
}

DATETIME_COLUMNS = {
    "User": {"lastLoginAt", "createdAt", "updatedAt"},
    "Post": {"createdAt", "updatedAt"},
    "AuthSession": {"expiresAt", "lastSeenAt", "createdAt"},
    "ApiCredential": {"lastUsedAt", "createdAt", "updatedAt"},
    "UserApiSettings": {"createdAt", "updatedAt"},
    "UserUsagePolicy": {"createdAt", "updatedAt"},
    "ProviderUsageLedger": {"lastUsedAt", "createdAt", "updatedAt"},
    "ProjectUsageLedger": {"lastUsedAt", "createdAt", "updatedAt"},
    "UserUsageAlertProfile": {"createdAt", "updatedAt"},
    "ProjectUsageGoal": {"createdAt", "updatedAt"},
    "BudgetApprovalRequest": {"createdAt", "updatedAt", "resolvedAt"},
    "UserFinOpsAutopilot": {"createdAt", "updatedAt"},
    "BudgetApprovalPolicy": {"createdAt", "updatedAt"},
    "FinOpsAutomationControl": {"createdAt", "updatedAt"},
    "FinOpsRemediationLog": {"appliedAt", "createdAt", "updatedAt"},
    "SecurityAuditLog": {"createdAt"},
}


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def to_bool_literal(value: object) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        return "TRUE" if normalized in {"1", "true", "t", "yes"} else "FALSE"
    return "TRUE" if bool(value) else "FALSE"


def to_sql_literal(table: str, column: str, value: object) -> str:
    if value is None:
        return "NULL"

    if column in BOOLEAN_COLUMNS.get(table, set()):
        return to_bool_literal(value)

    if column in DATETIME_COLUMNS.get(table, set()):
        if isinstance(value, (int, float)):
            timestamp = float(value)
            if timestamp > 10_000_000_000:
                timestamp /= 1000.0
            iso_value = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
            return f"'{iso_value}'"
        if isinstance(value, str) and value.isdigit():
            timestamp = float(value)
            if timestamp > 10_000_000_000:
                timestamp /= 1000.0
            iso_value = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
            return f"'{iso_value}'"

    enum_name = ENUM_COLUMNS.get(table, {}).get(column)
    if enum_name:
        return f"'{sql_escape(str(value))}'::\"{enum_name}\""

    if isinstance(value, (int, float)):
        return str(value)

    return f"'{sql_escape(str(value))}'"


def export_table(cursor: sqlite3.Cursor, table: str) -> list[str]:
    cursor.execute(f'SELECT * FROM "{table}"')
    rows = cursor.fetchall()
    if not rows:
        return []

    columns = [column[0] for column in cursor.description]
    column_list = ", ".join(f'"{column}"' for column in columns)
    value_rows = []

    for row in rows:
        serialized = ", ".join(
            to_sql_literal(table, column, value)
            for column, value in zip(columns, row)
        )
        value_rows.append(f"({serialized})")

    return [
        f'INSERT INTO "{table}" ({column_list}) VALUES',
        ",\n".join(value_rows) + ";",
        "",
    ]


def main() -> None:
    if not SOURCE_DB.exists():
        raise SystemExit(f"SQLite source not found: {SOURCE_DB}")

    OUTPUT_SQL.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(SOURCE_DB)
    cursor = conn.cursor()

    statements: list[str] = ["BEGIN;", ""]
    truncate_targets = ", ".join(f'"{table}"' for table in reversed(TABLE_ORDER))
    statements.append(f"TRUNCATE TABLE {truncate_targets} RESTART IDENTITY CASCADE;")
    statements.append("")

    for table in TABLE_ORDER:
        statements.extend(export_table(cursor, table))

    statements.append("COMMIT;")
    statements.append("")

    OUTPUT_SQL.write_text("\n".join(statements), encoding="utf-8")
    conn.close()

    print(f"Exported SQLite data to PostgreSQL SQL: {OUTPUT_SQL}")


if __name__ == "__main__":
    main()
