"""Branch discovery helper (from seed JSON or live read-only site discovery)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List

from .client import BOTQueueClient
from .parser import BranchInfo
from .storage import QueueStorage


def load_branches_from_seed(seed_path: str | Path) -> List[BranchInfo]:
    path = Path(seed_path)
    raw_list = json.loads(path.read_text(encoding="utf-8"))
    branches: List[BranchInfo] = []
    for item in raw_list:
        branches.append(
            BranchInfo(
                branch_id=str(item["branch_id"]).strip(),
                branch_name=str(item["branch_name"]).strip(),
                city=str(item.get("city", "")).strip(),
                phone=str(item.get("phone", "")).strip(),
                address=str(item.get("address", "")).strip(),
                is_disabled_on_site=bool(item.get("disabled", item.get("is_disabled_on_site", False))),
            )
        )
    return branches


def sync_branches_to_db(
    storage: QueueStorage,
    seed_path: str | Path,
    use_live: bool = False,
    client: BOTQueueClient | None = None,
) -> int:
    if use_live:
        active_client = client or BOTQueueClient()
        branches = active_client.discover_all_branches()
    else:
        branches = load_branches_from_seed(seed_path)
    return storage.upsert_branches(branches)
