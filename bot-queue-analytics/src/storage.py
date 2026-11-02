"""SQLite WAL storage layer for Bank of Taiwan queue analytics (100% factual observations)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .parser import BranchInfo, BranchPageResult

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS branches (
    branch_id            TEXT PRIMARY KEY,
    branch_name          TEXT NOT NULL,
    city                 TEXT NOT NULL DEFAULT '',
    phone                TEXT NOT NULL DEFAULT '',
    address              TEXT NOT NULL DEFAULT '',
    is_disabled_on_site  INTEGER NOT NULL DEFAULT 0,
    active               INTEGER NOT NULL DEFAULT 1,
    first_seen_at        TEXT NOT NULL,
    last_seen_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_types (
    branch_id            TEXT NOT NULL,
    service_code         TEXT NOT NULL,
    service_name         TEXT NOT NULL,
    service_desc         TEXT NOT NULL DEFAULT '',
    slot_class           TEXT NOT NULL DEFAULT 's1',
    active               INTEGER NOT NULL DEFAULT 1,
    first_seen_at        TEXT NOT NULL,
    last_seen_at         TEXT NOT NULL,
    PRIMARY KEY (branch_id, service_code),
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id)
);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at           TEXT NOT NULL,
    finished_at          TEXT NULL,
    mode                 TEXT NOT NULL DEFAULT 'pilot',
    total_targets        INTEGER NOT NULL DEFAULT 0,
    success_count        INTEGER NOT NULL DEFAULT 0,
    failure_count        INTEGER NOT NULL DEFAULT 0,
    renew_hit_count      INTEGER NOT NULL DEFAULT 0,
    http_status_summary  TEXT NULL,
    error_summary        TEXT NULL
);

CREATE TABLE IF NOT EXISTS queue_snapshots (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id             TEXT NOT NULL,
    service_code          TEXT NOT NULL,
    observed_at           TEXT NOT NULL,
    source_reported_at    TEXT NULL,
    current_ticket_raw    TEXT NULL,
    ticket_prefix         TEXT NULL,
    ticket_number         INTEGER NULL,
    waiting_count         INTEGER NULL,
    page_valid            INTEGER NOT NULL DEFAULT 1,
    status                TEXT NOT NULL,
    crawl_run_id          INTEGER NOT NULL,
    source_hash           TEXT NULL,
    UNIQUE(branch_id, service_code, observed_at),
    FOREIGN KEY (crawl_run_id) REFERENCES crawl_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_branch_service_time
    ON queue_snapshots(branch_id, service_code, observed_at);

CREATE INDEX IF NOT EXISTS idx_snapshots_observed_at
    ON queue_snapshots(observed_at);

CREATE INDEX IF NOT EXISTS idx_snapshots_reported_at
    ON queue_snapshots(branch_id, service_code, source_reported_at);

CREATE TABLE IF NOT EXISTS daily_metrics (
    date_local                TEXT NOT NULL,
    branch_id                 TEXT NOT NULL,
    service_code              TEXT NOT NULL,
    first_observed_at         TEXT NULL,
    last_observed_at          TEXT NULL,
    avg_waiting_count         REAL NULL,
    min_waiting_count         INTEGER NULL,
    max_waiting_count         INTEGER NULL,
    max_waiting_at            TEXT NULL,
    peak_hour_local           TEXT NULL,
    total_called_count        INTEGER NULL,
    updated_at                TEXT NOT NULL,
    PRIMARY KEY (date_local, branch_id, service_code)
);
"""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class QueueStorage:
    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row
        self.init_schema()

    def init_schema(self) -> None:
        # Ensure daily_metrics and queue_snapshots match the pure factual schema (drop legacy columns if present)
        cols = [
            r["name"]
            for r in self.conn.execute("PRAGMA table_info(daily_metrics)").fetchall()
        ]
        if cols and ("estimated_wait_minutes" in cols or "official_wait_samples" in cols or "zero_wait_samples" in cols or "ticket_span" in cols or "sample_count" in cols):
            self.conn.execute("DROP TABLE daily_metrics")
        snap_cols = [
            r["name"]
            for r in self.conn.execute("PRAGMA table_info(queue_snapshots)").fetchall()
        ]
        if "official_wait_minutes" in snap_cols:
            self.conn.execute("ALTER TABLE queue_snapshots DROP COLUMN official_wait_minutes")
        self.conn.executescript(SCHEMA_SQL)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def upsert_branches(self, branches: Iterable[BranchInfo], seen_at: Optional[str] = None) -> int:
        now = seen_at or utc_now_iso()
        count = 0
        with self.conn:
            for b in branches:
                disabled_int = 1 if b.is_disabled_on_site else 0
                active_int = 0 if b.is_disabled_on_site else 1
                self.conn.execute(
                    """
                    INSERT INTO branches (
                        branch_id, branch_name, city, phone, address,
                        is_disabled_on_site, active, first_seen_at, last_seen_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(branch_id) DO UPDATE SET
                        branch_name = excluded.branch_name,
                        city = CASE WHEN excluded.city != '' THEN excluded.city ELSE branches.city END,
                        phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE branches.phone END,
                        address = CASE WHEN excluded.address != '' THEN excluded.address ELSE branches.address END,
                        is_disabled_on_site = excluded.is_disabled_on_site,
                        active = excluded.active,
                        last_seen_at = excluded.last_seen_at
                    """,
                    (
                        b.branch_id,
                        b.branch_name,
                        b.city,
                        b.phone,
                        b.address,
                        disabled_int,
                        active_int,
                        now,
                        now,
                    ),
                )
                count += 1
        return count

    def get_branches(self, active_only: bool = True, branch_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        query = "SELECT * FROM branches WHERE 1=1"
        params: List[Any] = []
        if active_only:
            query += " AND active = 1 AND is_disabled_on_site = 0"
        if branch_ids:
            placeholders = ",".join("?" for _ in branch_ids)
            query += f" AND branch_id IN ({placeholders})"
            params.extend(branch_ids)
        query += " ORDER BY branch_id ASC"
        rows = self.conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def start_crawl_run(self, mode: str, total_targets: int) -> int:
        now = utc_now_iso()
        with self.conn:
            cur = self.conn.execute(
                """
                INSERT INTO crawl_runs (started_at, mode, total_targets)
                VALUES (?, ?, ?)
                """,
                (now, mode, total_targets),
            )
            return int(cur.lastrowid)

    def finish_crawl_run(
        self,
        crawl_run_id: int,
        success_count: int,
        failure_count: int,
        renew_hit_count: int,
        http_status_summary: Dict[str, int],
        errors: List[str],
    ) -> None:
        now = utc_now_iso()
        with self.conn:
            self.conn.execute(
                """
                UPDATE crawl_runs
                SET finished_at = ?,
                    success_count = ?,
                    failure_count = ?,
                    renew_hit_count = ?,
                    http_status_summary = ?,
                    error_summary = ?
                WHERE id = ?
                """,
                (
                    now,
                    success_count,
                    failure_count,
                    renew_hit_count,
                    json.dumps(http_status_summary, ensure_ascii=False),
                    json.dumps(errors[:20], ensure_ascii=False) if errors else None,
                    crawl_run_id,
                ),
            )

    def save_branch_page_result(
        self,
        crawl_run_id: int,
        result: BranchPageResult,
        observed_at: Optional[str] = None,
    ) -> int:
        now = observed_at or utc_now_iso()
        inserted = 0
        with self.conn:
            if not result.services:
                self.conn.execute(
                    """
                    INSERT OR IGNORE INTO queue_snapshots (
                        branch_id, service_code, observed_at, source_reported_at,
                        current_ticket_raw, ticket_prefix, ticket_number,
                        waiting_count, page_valid,
                        status, crawl_run_id, source_hash
                    ) VALUES (?, '__BRANCH__', ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
                    """,
                    (
                        result.branch_id,
                        now,
                        result.source_reported_at,
                        1 if result.page_valid else 0,
                        result.status,
                        crawl_run_id,
                        result.source_hash,
                    ),
                )
                return 1

            for svc in result.services:
                # If after 15:30 data-order-key is hidden ('slot_N'), resolve service_code by (branch_id, service_name)
                resolved_code = svc.service_code
                if resolved_code.startswith("slot_") and svc.service_name:
                    known = self.conn.execute(
                        """
                        SELECT service_code FROM service_types
                        WHERE branch_id = ? AND service_name = ? AND service_code NOT LIKE 'slot_%'
                        ORDER BY service_code ASC LIMIT 1
                        """,
                        (result.branch_id, svc.service_name),
                    ).fetchone()
                    if known:
                        resolved_code = str(known["service_code"])

                # Skip inserting empty closed placeholder rows when a branch blanks out numbers after 15:30
                if svc.status == "closed" and svc.waiting_count is None and not svc.current_ticket_raw:
                    continue

                self.conn.execute(
                    """
                    INSERT INTO service_types (
                        branch_id, service_code, service_name, service_desc,
                        slot_class, active, first_seen_at, last_seen_at
                    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                    ON CONFLICT(branch_id, service_code) DO UPDATE SET
                        service_name = excluded.service_name,
                        service_desc = CASE WHEN excluded.service_desc != '' THEN excluded.service_desc ELSE service_types.service_desc END,
                        slot_class = excluded.slot_class,
                        active = 1,
                        last_seen_at = excluded.last_seen_at
                    """,
                    (
                        result.branch_id,
                        resolved_code,
                        svc.service_name,
                        svc.service_desc,
                        svc.slot_class,
                        now,
                        now,
                    ),
                )

                if result.source_reported_at:
                    dup = self.conn.execute(
                        """
                        SELECT id FROM queue_snapshots
                        WHERE branch_id = ? AND service_code = ? AND source_reported_at = ?
                        LIMIT 1
                        """,
                        (result.branch_id, resolved_code, result.source_reported_at),
                    ).fetchone()
                    if dup:
                        continue

                self.conn.execute(
                    """
                    INSERT OR IGNORE INTO queue_snapshots (
                        branch_id, service_code, observed_at, source_reported_at,
                        current_ticket_raw, ticket_prefix, ticket_number,
                        waiting_count, page_valid,
                        status, crawl_run_id, source_hash
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        result.branch_id,
                        resolved_code,
                        now,
                        result.source_reported_at,
                        svc.current_ticket_raw,
                        svc.ticket_prefix,
                        svc.ticket_number,
                        svc.waiting_count,
                        1 if result.page_valid else 0,
                        svc.status,
                        crawl_run_id,
                        result.source_hash,
                    ),
                )
                inserted += 1
        return inserted

    def upsert_daily_metrics(self, rows: Iterable[Dict[str, Any]]) -> int:
        now = utc_now_iso()
        count = 0
        with self.conn:
            for r in rows:
                self.conn.execute(
                    """
                    INSERT INTO daily_metrics (
                        date_local, branch_id, service_code,
                        first_observed_at, last_observed_at,
                        avg_waiting_count, min_waiting_count, max_waiting_count,
                        max_waiting_at, peak_hour_local,
                        total_called_count,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(date_local, branch_id, service_code) DO UPDATE SET
                        first_observed_at = excluded.first_observed_at,
                        last_observed_at = excluded.last_observed_at,
                        avg_waiting_count = excluded.avg_waiting_count,
                        min_waiting_count = excluded.min_waiting_count,
                        max_waiting_count = excluded.max_waiting_count,
                        max_waiting_at = excluded.max_waiting_at,
                        peak_hour_local = excluded.peak_hour_local,
                        total_called_count = excluded.total_called_count,
                        updated_at = excluded.updated_at
                    """,
                    (
                        r["date_local"],
                        r["branch_id"],
                        r["service_code"],
                        r["first_observed_at"],
                        r["last_observed_at"],
                        r["avg_waiting_count"],
                        r["min_waiting_count"],
                        r["max_waiting_count"],
                        r["max_waiting_at"],
                        r["peak_hour_local"],
                        r["total_called_count"],
                        now,
                    ),
                )
                count += 1
        return count
