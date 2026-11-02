#!/usr/bin/env python3
"""
Run a single polite, read-only queue collection cycle.

Default behavior:
- Runs in 'pilot' mode (only 5 representative branches) to minimize load on Bank of Taiwan.
- Uses Session-Pinned `lbtRenew` cache (`data/session_cache.json`) so repeat polls take only
  1 lightweight POST request (~9.3 KB) per branch.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.client import BOTQueueClient
from src.collector import run_collection_cycle
from src.discover import sync_branches_to_db
from src.storage import QueueStorage


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="Run a single read-only queue collection cycle")
    parser.add_argument("--config", default=str(ROOT_DIR / "config.json"), help="Path to config.json")
    parser.add_argument("--db", default=None, help="Override SQLite DB path")
    parser.add_argument(
        "--mode",
        choices=["pilot", "full"],
        default=None,
        help="Collection mode: 'pilot' (default 5 branches) or 'full' (all 151 enabled branches, sequential with jitter)",
    )
    parser.add_argument(
        "--branches",
        default=None,
        help="Comma-separated branch IDs to poll (e.g. '003,007,012')",
    )
    parser.add_argument(
        "--force-off-hours",
        action="store_true",
        help="Allow running a manual verification outside configured business hours",
    )
    args = parser.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    # Resolve relative paths in config against ROOT_DIR
    cfg["circuit_breaker_path"] = str(ROOT_DIR / cfg.get("circuit_breaker_path", "data/circuit_breaker.json"))
    db_path = Path(args.db) if args.db else (ROOT_DIR / cfg.get("db_path", "data/bot_queue.db"))
    session_cache_path = ROOT_DIR / cfg.get("session_cache_path", "data/session_cache.json")
    seed_path = ROOT_DIR / cfg.get("branches_seed_path", "data/branches_seed.json")

    mode = args.mode or cfg.get("default_mode", "pilot")
    branch_ids = [b.strip() for b in args.branches.split(",") if b.strip()] if args.branches else None

    politeness = cfg.get("politeness_policy", {})
    storage = QueueStorage(db_path)
    try:
        if not storage.get_branches(active_only=False) and seed_path.exists():
            sync_branches_to_db(storage, seed_path=seed_path, use_live=False)

        client = BOTQueueClient(
            base_url=cfg.get("base_url", "https://ino.bot.com.tw/INOWeb/"),
            session_cache_path=session_cache_path,
            timeout_sec=float(politeness.get("request_timeout_sec", 12.0)),
            step_delay_sec=float(politeness.get("step_delay_sec", 0.6)),
        )

        summary = run_collection_cycle(
            config=cfg,
            storage=storage,
            client=client,
            mode=mode,
            branch_ids=branch_ids,
            force_off_hours=args.force_off_hours,
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        storage.close()


if __name__ == "__main__":
    main()
