"""
Pure descriptive daily statistics for Bank of Taiwan queue snapshots.

Zero estimation / zero modeling policy:
- Every metric is a 100% factual descriptive statistic computed directly from observed snapshots:
  1. Waiting count stats: sample_count, avg_waiting_count, min_waiting_count, max_waiting_count,
     max_waiting_at (exact timestamp), peak_hour_local.
  2. Total called count: total_called_count (last_ticket_number - first_ticket_number when in the same prefix/series).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from .storage import QueueStorage

TAIPEI_TZ = ZoneInfo("Asia/Taipei")


def _parse_iso_to_taipei(ts_str: Optional[str]) -> Optional[datetime]:
    if not ts_str:
        return None
    try:
        dt = datetime.fromisoformat(ts_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TAIPEI_TZ)
        return dt.astimezone(TAIPEI_TZ)
    except ValueError:
        return None


def compute_service_daily_metric(
    date_local: str,
    branch_id: str,
    service_code: str,
    snapshots: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Compute 100% factual daily descriptive statistics for a single (date_local, branch_id, service_code).
    No modeled or extrapolated values are generated.
    """
    valid_rows: List[Tuple[datetime, Dict[str, Any]]] = []
    for row in snapshots:
        if row.get("status") != "ok":
            continue
        if row.get("waiting_count") is None:
            continue
        ts = _parse_iso_to_taipei(row.get("source_reported_at")) or _parse_iso_to_taipei(row.get("observed_at"))
        if ts is None:
            continue
        valid_rows.append((ts, row))

    valid_rows.sort(key=lambda x: x[0])
    sample_count = len(valid_rows)

    if sample_count == 0:
        return {
            "date_local": date_local,
            "branch_id": branch_id,
            "service_code": service_code,
            "first_observed_at": None,
            "last_observed_at": None,
            "avg_waiting_count": None,
            "min_waiting_count": None,
            "max_waiting_count": None,
            "max_waiting_at": None,
            "peak_hour_local": None,
            "total_called_count": None,
        }

    first_observed_at = valid_rows[0][0].strftime("%H:%M:%S")
    last_observed_at = valid_rows[-1][0].strftime("%H:%M:%S")

    # 1. Waiting count factual statistics
    waiting_values = [int(r["waiting_count"]) for _, r in valid_rows]
    avg_waiting_count = round(sum(waiting_values) / sample_count, 2)
    min_waiting_count = min(waiting_values)
    max_waiting_count = max(waiting_values)

    # Exact local time when max_waiting_count was first observed
    max_waiting_at = next(
        ts.strftime("%H:%M:%S")
        for ts, r in valid_rows
        if int(r["waiting_count"]) == max_waiting_count
    )

    # Peak hour bucket by observed average waiting count (tie-broken by max waiting count)
    hourly_buckets: Dict[int, List[int]] = defaultdict(list)
    for ts, r in valid_rows:
        hourly_buckets[ts.hour].append(int(r["waiting_count"]))
    best_hour = max(
        hourly_buckets.keys(),
        key=lambda h: (sum(hourly_buckets[h]) / len(hourly_buckets[h]), max(hourly_buckets[h]), -h),
    )
    peak_hour_local = f"{best_hour:02d}:00-{(best_hour + 1) % 24:02d}:00"

    # 2. Total called count (末筆叫號 - 首筆叫號)
    ticket_rows = [
        (ts, r)
        for ts, r in valid_rows
        if r.get("current_ticket_raw") is not None and str(r.get("current_ticket_raw")).strip() != ""
    ]
    total_called_count: Optional[int] = None

    if ticket_rows:
        first_r = ticket_rows[0][1]
        last_r = ticket_rows[-1][1]

        n_first = first_r.get("ticket_number")
        n_last = last_r.get("ticket_number")
        p_first = first_r.get("ticket_prefix")
        p_last = last_r.get("ticket_prefix")
        if n_first is not None and n_last is not None:
            same_series = (p_first == p_last) or (
                p_first is not None
                and p_last is not None
                and p_first.isdigit()
                and p_last.isdigit()
                and p_first[0] == p_last[0]
            )
            if same_series and int(n_last) >= int(n_first):
                total_called_count = int(n_last) - int(n_first)

    return {
        "date_local": date_local,
        "branch_id": branch_id,
        "service_code": service_code,
        "first_observed_at": first_observed_at,
        "last_observed_at": last_observed_at,
        "avg_waiting_count": avg_waiting_count,
        "min_waiting_count": min_waiting_count,
        "max_waiting_count": max_waiting_count,
        "max_waiting_at": max_waiting_at,
        "peak_hour_local": peak_hour_local,
        "total_called_count": total_called_count,
    }


def aggregate_daily_for_date(
    storage: QueueStorage,
    date_local: str,
) -> List[Dict[str, Any]]:
    """
    Query all snapshots on `date_local` (Asia/Taipei YYYY-MM-DD), compute factual daily statistics
    per (branch_id, service_code), upsert into `daily_metrics`, and return the computed rows.
    """
    rows = storage.conn.execute(
        """
        SELECT *
        FROM queue_snapshots
        WHERE service_code != '__BRANCH__'
        ORDER BY observed_at ASC
        """
    ).fetchall()

    grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    for r in rows:
        d = dict(r)
        ts = _parse_iso_to_taipei(d.get("source_reported_at")) or _parse_iso_to_taipei(d.get("observed_at"))
        if ts and ts.strftime("%Y-%m-%d") == date_local:
            grouped[(d["branch_id"], d["service_code"])].append(d)

    computed: List[Dict[str, Any]] = []
    for (branch_id, service_code), snap_list in sorted(grouped.items()):
        metric = compute_service_daily_metric(
            date_local=date_local,
            branch_id=branch_id,
            service_code=service_code,
            snapshots=snap_list,
        )
        computed.append(metric)

    if computed:
        storage.upsert_daily_metrics(computed)

    return computed
