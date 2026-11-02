"""Unit tests for pure factual daily statistics (zero modeled/estimated values)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.metrics import compute_service_daily_metric


class TestFactualMetrics(unittest.TestCase):
    def test_factual_waiting_and_ticket_statistics(self) -> None:
        snaps = [
            {
                "status": "ok",
                "page_valid": 1,
                "source_reported_at": "2026-11-02T10:00:10+08:00",
                "current_ticket_raw": "0100",
                "ticket_prefix": "01",
                "ticket_number": 100,
                "waiting_count": 0,
            },
            {
                "status": "ok",
                "page_valid": 1,
                "source_reported_at": "2026-11-02T10:05:20+08:00",
                "current_ticket_raw": "0104",
                "ticket_prefix": "01",
                "ticket_number": 104,
                "waiting_count": 6,
            },
            {
                "status": "ok",
                "page_valid": 1,
                "source_reported_at": "2026-11-02T11:10:05+08:00",
                "current_ticket_raw": "0115",
                "ticket_prefix": "01",
                "ticket_number": 115,
                "waiting_count": 12,
            },
        ]
        res = compute_service_daily_metric("2026-11-02", "007", "001000001", snaps)
        self.assertEqual(res["first_observed_at"], "10:00:10")
        self.assertEqual(res["last_observed_at"], "11:10:05")
        self.assertEqual(res["avg_waiting_count"], 6.0)
        self.assertEqual(res["min_waiting_count"], 0)
        self.assertEqual(res["max_waiting_count"], 12)
        self.assertEqual(res["max_waiting_at"], "11:10:05")
        self.assertEqual(res["peak_hour_local"], "11:00-12:00")
        self.assertEqual(res["total_called_count"], 15)

    def test_cross_prefix_does_not_produce_misleading_span(self) -> None:
        snaps = [
            {
                "status": "ok",
                "page_valid": 1,
                "source_reported_at": "2026-11-02T11:00:00+08:00",
                "current_ticket_raw": "0105",
                "ticket_prefix": "01",
                "ticket_number": 105,
                "waiting_count": 5,
            },
            {
                "status": "ok",
                "page_valid": 1,
                "source_reported_at": "2026-11-02T11:05:00+08:00",
                "current_ticket_raw": "3108",
                "ticket_prefix": "31",
                "ticket_number": 3108,
                "waiting_count": 7,
            },
        ]
        res = compute_service_daily_metric("2026-11-02", "007", "001000002", snaps)
        self.assertIsNone(res["total_called_count"])


if __name__ == "__main__":
    unittest.main()
