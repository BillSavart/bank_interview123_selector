#!/usr/bin/env python3
"""Aggregate factual daily queue statistics and export CSV."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.metrics import aggregate_daily_for_date
from src.storage import QueueStorage

CSV_COLUMNS = [
    "date_local",
    "branch_id",
    "branch_name",
    "city",
    "service_name",
    "first_observed_at",
    "last_observed_at",
    "avg_waiting_count",
    "min_waiting_count",
    "max_waiting_count",
    "max_waiting_at",
    "peak_hour_local",
    "total_called_count",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate factual daily statistics and export CSV")
    parser.add_argument("--config", default=str(ROOT_DIR / "config.json"), help="Path to config.json")
    parser.add_argument("--db", default=None, help="Override SQLite DB path")
    parser.add_argument("--date", default=None, help="Target date in YYYY-MM-DD (Asia/Taipei); defaults to today")
    parser.add_argument("--csv-out", default=None, help="Optional output CSV path")
    args = parser.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    db_path = Path(args.db) if args.db else (ROOT_DIR / cfg.get("db_path", "data/bot_queue.db"))
    tz = ZoneInfo(cfg.get("timezone", "Asia/Taipei"))
    date_local = args.date or datetime.now(tz).strftime("%Y-%m-%d")

    storage = QueueStorage(db_path)
    try:
        computed = aggregate_daily_for_date(storage, date_local=date_local)

        rows = storage.conn.execute(
            """
            SELECT
                m.*,
                b.branch_name,
                b.city,
                s.service_name
            FROM daily_metrics m
            LEFT JOIN branches b ON b.branch_id = m.branch_id
            LEFT JOIN service_types s ON s.branch_id = m.branch_id AND s.service_code = m.service_code
            WHERE m.date_local = ?
            ORDER BY m.branch_id ASC, m.service_code ASC
            """,
            (date_local,),
        ).fetchall()

        csv_path = Path(args.csv_out) if args.csv_out else (ROOT_DIR / "data" / f"daily_metrics_{date_local}.csv")
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            writer.writeheader()
            for r in rows:
                d = dict(r)
                out_row = {col: (d.get(col) if d.get(col) is not None else "") for col in CSV_COLUMNS}
                writer.writerow(out_row)

        print(
            f"Aggregated factual daily statistics for {date_local}:\n"
            f"  Service targets computed: {len(computed)}\n"
            f"  CSV exported to:          {csv_path}"
        )
    finally:
        storage.close()


if __name__ == "__main__":
    main()
