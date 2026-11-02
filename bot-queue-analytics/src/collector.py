"""
Polite, low-impact collector with Business Hours Gate and Circuit Breaker.
"""

from __future__ import annotations

import json
import logging
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from .client import BOTQueueClient
from .storage import QueueStorage

logger = logging.getLogger("bot_queue.collector")


class CircuitBreaker:
    """Persisted circuit breaker to protect the bank's server if errors or slow responses occur."""

    def __init__(self, state_path: str | Path, cooldown_minutes: int = 15) -> None:
        self.state_path = Path(state_path)
        self.cooldown_minutes = cooldown_minutes

    def is_open(self, now_utc: Optional[datetime] = None) -> Tuple[bool, Optional[str]]:
        if not self.state_path.exists():
            return False, None
        now = now_utc or datetime.now(timezone.utc)
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
            until_str = data.get("open_until_utc")
            reason = data.get("reason", "unknown")
            if until_str:
                until_dt = datetime.fromisoformat(until_str)
                if now < until_dt:
                    return True, f"Circuit breaker OPEN until {until_str} (reason: {reason})"
        except Exception:
            pass
        return False, None

    def trip(self, reason: str, cooldown_sec: Optional[int] = None, now_utc: Optional[datetime] = None) -> None:
        now = now_utc or datetime.now(timezone.utc)
        wait_sec = cooldown_sec if cooldown_sec is not None else (self.cooldown_minutes * 60)
        until_dt = (now + timedelta(seconds=wait_sec)).replace(microsecond=0)
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "tripped_at_utc": now.replace(microsecond=0).isoformat(),
            "open_until_utc": until_dt.isoformat(),
            "reason": reason,
        }
        self.state_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        logger.warning("Circuit breaker TRIPPED: %s (cooldown until %s)", reason, until_dt.isoformat())

    def reset(self) -> None:
        if self.state_path.exists():
            try:
                self.state_path.unlink()
            except OSError:
                pass


def is_within_business_hours(config: Dict[str, Any], now_local: Optional[datetime] = None) -> Tuple[bool, str]:
    tz_name = config.get("timezone", "Asia/Taipei")
    tz = ZoneInfo(tz_name)
    now = now_local or datetime.now(tz)
    bh = config.get("business_hours", {})

    date_str = now.strftime("%Y-%m-%d")
    holidays = set(bh.get("holidays", []))
    if date_str in holidays:
        return False, f"{date_str} is a configured holiday"

    if bh.get("weekdays_only", True) and now.weekday() >= 5:
        return False, f"{date_str} is a weekend (weekday={now.weekday()})"

    start_str = bh.get("start_time", "08:55")
    end_str = bh.get("end_time", "17:00")
    hm_str = now.strftime("%H:%M")
    if hm_str < start_str or hm_str > end_str:
        return False, f"Current local time {hm_str} is outside business hours ({start_time_range(start_str, end_str)})"

    return True, "Within business hours"


def start_time_range(start_str: str, end_str: str) -> str:
    return f"{start_str}-{end_str}"


def run_collection_cycle(
    config: Dict[str, Any],
    storage: QueueStorage,
    client: BOTQueueClient,
    mode: str = "pilot",
    branch_ids: Optional[List[str]] = None,
    force_off_hours: bool = False,
) -> Dict[str, Any]:
    """
    Execute one polite, read-only collection cycle.
    - Respects Business Hours Gate unless `force_off_hours=True`.
    - Respects Circuit Breaker.
    - Enforces sequential execution (concurrency = 1) + jitter between branches.
    """
    politeness = config.get("politeness_policy", {})
    cb_path = Path(config.get("circuit_breaker_path", "data/circuit_breaker.json"))
    cb = CircuitBreaker(
        state_path=cb_path,
        cooldown_minutes=int(politeness.get("circuit_breaker_cooldown_minutes", 15)),
    )

    is_open, cb_msg = cb.is_open()
    if is_open:
        logger.warning("Skipping collection cycle: %s", cb_msg)
        return {"skipped": True, "reason": cb_msg}

    if not force_off_hours:
        ok_hours, hours_msg = is_within_business_hours(config)
        if not ok_hours:
            logger.info("Skipping collection cycle: %s", hours_msg)
            return {"skipped": True, "reason": hours_msg}

    if branch_ids:
        target_ids = branch_ids
    elif mode == "pilot":
        target_ids = list(config.get("pilot_branch_ids", ["003", "007", "012", "064", "205"]))
    else:
        target_ids = None

    targets = storage.get_branches(active_only=True, branch_ids=target_ids)
    if not targets:
        return {"skipped": True, "reason": "No active target branches found in database"}

    crawl_run_id = storage.start_crawl_run(mode=mode, total_targets=len(targets))
    min_interval = float(politeness.get("min_request_interval_sec", 1.5))
    jitter_max = float(politeness.get("jitter_max_sec", 1.0))
    slow_threshold = float(politeness.get("slow_response_threshold_sec", 3.5))
    max_slow = int(politeness.get("max_consecutive_slow_responses", 3))
    max_failures = int(politeness.get("circuit_breaker_max_failures", 3))

    success_count = 0
    failure_count = 0
    renew_hit_count = 0
    consecutive_failures = 0
    consecutive_slow = 0
    http_status_summary: Dict[str, int] = {}
    errors: List[str] = []
    inserted_snapshots = 0

    for idx, br in enumerate(targets):
        if idx > 0:
            sleep_sec = min_interval + random.uniform(0.0, jitter_max)
            time.sleep(sleep_sec)

        b_id = br["branch_id"]
        b_name = br["branch_name"]
        outcome = client.fetch_branch_queue(branch_id=b_id, branch_name=b_name)

        status_key = str(outcome.http_status)
        http_status_summary[status_key] = http_status_summary.get(status_key, 0) + 1

        if outcome.used_renew:
            renew_hit_count += 1

        # Check for HTTP 429 / 403 / 5xx immediate protection
        if outcome.http_status in (429, 403) or outcome.http_status >= 500:
            failure_count += 1
            err_msg = f"Branch {b_id} ({b_name}) returned HTTP {outcome.http_status}"
            errors.append(err_msg)
            storage.save_branch_page_result(crawl_run_id, outcome.page_result)
            cooldown = outcome.retry_after_sec or (int(politeness.get("circuit_breaker_cooldown_minutes", 15)) * 60)
            cb.trip(reason=err_msg, cooldown_sec=cooldown)
            break

        if outcome.page_result.status in ("ok", "closed"):
            success_count += 1
            consecutive_failures = 0
            inserted_snapshots += storage.save_branch_page_result(crawl_run_id, outcome.page_result)

            # Monitor response latency to avoid stressing a slow server
            per_req_latency = outcome.elapsed_sec / max(1, outcome.request_count)
            if per_req_latency > slow_threshold:
                consecutive_slow += 1
                if consecutive_slow >= max_slow:
                    cb.trip(
                        reason=f"{consecutive_slow} consecutive slow responses (>{slow_threshold}s/req)"
                    )
                    break
            else:
                consecutive_slow = 0
        else:
            failure_count += 1
            consecutive_failures += 1
            err_msg = f"Branch {b_id} ({b_name}) failed with status={outcome.page_result.status} ({outcome.error_message})"
            errors.append(err_msg)
            storage.save_branch_page_result(crawl_run_id, outcome.page_result)
            if consecutive_failures >= max_failures:
                cb.trip(reason=f"{consecutive_failures} consecutive branch failures")
                break

    storage.finish_crawl_run(
        crawl_run_id=crawl_run_id,
        success_count=success_count,
        failure_count=failure_count,
        renew_hit_count=renew_hit_count,
        http_status_summary=http_status_summary,
        errors=errors,
    )

    return {
        "skipped": False,
        "crawl_run_id": crawl_run_id,
        "mode": mode,
        "total_targets": len(targets),
        "success_count": success_count,
        "failure_count": failure_count,
        "renew_hit_count": renew_hit_count,
        "inserted_snapshots": inserted_snapshots,
        "http_status_summary": http_status_summary,
        "errors": errors,
    }
