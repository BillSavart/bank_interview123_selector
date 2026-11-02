#!/usr/bin/env python3
"""Initialize SQLite database and populate the 164 Bank of Taiwan branches."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.client import BOTQueueClient
from src.discover import sync_branches_to_db
from src.storage import QueueStorage


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize BOT Queue SQLite DB and seed branches")
    parser.add_argument("--config", default=str(ROOT_DIR / "config.json"), help="Path to config.json")
    parser.add_argument("--db", default=None, help="Override SQLite DB path")
    parser.add_argument(
        "--live-discover",
        action="store_true",
        help="Discover branches directly from ino.bot.com.tw (2 read-only keyword searches) instead of seed file",
    )
    args = parser.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    db_path = Path(args.db) if args.db else (ROOT_DIR / cfg.get("db_path", "data/bot_queue.db"))
    seed_path = ROOT_DIR / cfg.get("branches_seed_path", "data/branches_seed.json")

    storage = QueueStorage(db_path)
    try:
        client = BOTQueueClient(base_url=cfg.get("base_url", "https://ino.bot.com.tw/INOWeb/")) if args.live_discover else None
        upserted = sync_branches_to_db(storage, seed_path=seed_path, use_live=args.live_discover, client=client)
        all_rows = storage.get_branches(active_only=False)
        enabled_rows = [r for r in all_rows if r["active"] == 1 and r["is_disabled_on_site"] == 0]
        disabled_rows = [r for r in all_rows if r["is_disabled_on_site"] == 1]
        print(
            f"Initialized database at {db_path}\n"
            f"  Upserted branches: {upserted}\n"
            f"  Total branches:    {len(all_rows)}\n"
            f"  Enabled (active):  {len(enabled_rows)}\n"
            f"  Disabled on site:  {len(disabled_rows)}"
        )
    finally:
        storage.close()


if __name__ == "__main__":
    main()
