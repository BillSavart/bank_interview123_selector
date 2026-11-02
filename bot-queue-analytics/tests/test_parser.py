"""Unit tests for HTML parser and read-only safety guardrails."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.client import BOTQueueClient
from src.parser import (
    parse_branch_search_html,
    parse_service_page_html,
    parse_ticket_string,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class TestParserAndSafety(unittest.TestCase):
    def test_parse_ticket_string_variants(self) -> None:
        self.assertEqual(parse_ticket_string("0510"), ("05", 510))
        self.assertEqual(parse_ticket_string("3125"), ("31", 3125))
        self.assertEqual(parse_ticket_string("0065"), ("00", 65))
        self.assertEqual(parse_ticket_string("A052"), ("A", 52))
        self.assertEqual(parse_ticket_string(""), (None, None))
        self.assertEqual(parse_ticket_string(None), (None, None))

    def test_parse_branch_search_taipei_fixture(self) -> None:
        html_text = (FIXTURES_DIR / "branch_search_taipei.html").read_text(encoding="utf-8")
        branches = parse_branch_search_html(html_text, default_city="台北市")
        self.assertEqual(len(branches), 43)
        enabled = [b for b in branches if not b.is_disabled_on_site]
        disabled = [b for b in branches if b.is_disabled_on_site]
        self.assertEqual(len(enabled), 35)
        self.assertEqual(len(disabled), 8)
        disabled_ids = {b.branch_id for b in disabled}
        self.assertIn("033", disabled_ids)  # 南門分行
        self.assertIn("034", disabled_ids)  # 公館分行
        self.assertIn("279", disabled_ids)  # 臺北國際機場分行

    def test_parse_service_003_head_office(self) -> None:
        html_text = (FIXTURES_DIR / "service_003.html").read_text(encoding="utf-8")
        res = parse_service_page_html(html_text, branch_id="003")
        self.assertEqual(res.status, "ok")
        self.assertEqual(res.branch_name, "營業部")
        self.assertTrue(res.page_valid)
        self.assertEqual(len(res.services), 3)
        self.assertEqual(res.services[0].service_code, "001000002")
        self.assertEqual(res.services[0].current_ticket_raw, "0510")
        self.assertEqual(res.services[0].waiting_count, 2)

    def test_parse_service_007_with_s1t_slot_class(self) -> None:
        html_text = (FIXTURES_DIR / "service_007.html").read_text(encoding="utf-8")
        res = parse_service_page_html(html_text, branch_id="007")
        self.assertEqual(res.status, "ok")
        self.assertEqual(res.branch_name, "館前分行")
        self.assertEqual(len(res.services), 3)

        # First service uses <div class="service s1t"> container; we only extract ticket & waiting_count
        s1 = res.services[0]
        self.assertEqual(s1.slot_class, "s1t")
        self.assertEqual(s1.service_name, "一般收付")
        self.assertEqual(s1.service_code, "001000001")
        self.assertEqual(s1.current_ticket_raw, "0162")
        self.assertEqual(s1.waiting_count, 9)

        # Second service uses standard <div class="service s2">
        s2 = res.services[1]
        self.assertEqual(s2.slot_class, "s2")
        self.assertEqual(s2.service_name, "外匯業務")
        self.assertEqual(s2.current_ticket_raw, "3125")
        self.assertEqual(s2.waiting_count, 4)

    def test_parse_service_012_multi_area_5_services(self) -> None:
        html_text = (FIXTURES_DIR / "service_012.html").read_text(encoding="utf-8")
        res = parse_service_page_html(html_text, branch_id="012")
        self.assertEqual(res.status, "ok")
        self.assertEqual(res.branch_name, "基隆分行")
        self.assertEqual(len(res.services), 5)
        codes = [s.service_code for s in res.services]
        self.assertEqual(
            codes,
            ["001000003", "001000009", "001000020", "001000021", "002000002"],
        )

    def test_parse_closed_and_session_expired_states(self) -> None:
        html_text = (FIXTURES_DIR / "service_205.html").read_text(encoding="utf-8")
        # 1) Post-15:30 queue-clearing state: hfPageValid is false (online ticket drawing closed),
        #    but live calling numbers and waiting counts are still displayed -> status remains "ok".
        post_1530_html = html_text.replace('id="hfPageValid" value="true"', 'id="hfPageValid" value="false"')
        res_post_1530 = parse_service_page_html(post_1530_html, branch_id="205")
        self.assertFalse(res_post_1530.page_valid)
        self.assertEqual(res_post_1530.status, "ok")
        self.assertEqual(res_post_1530.services[0].status, "ok")

        # 2) Blanked/closed state: hfPageValid is false and ticket/waiting numbers are blanked out -> status is "closed".
        closed_html = (
            post_1530_html.replace("0169", "")
            .replace("0065", "")
            .replace("3035", "")
            .replace(">0<", "><")
            .replace(">1<", "><")
        )
        res_closed = parse_service_page_html(closed_html, branch_id="205")
        self.assertFalse(res_closed.page_valid)
        self.assertEqual(res_closed.status, "closed")
        self.assertEqual(res_closed.services[0].status, "closed")

        # 3) Session expired / redirected to Default.aspx
        expired_html = '<form method="post" action="./Default.aspx" id="form1"><a id="lbtImmOrder"></a></form>'
        res_exp = parse_service_page_html(expired_html, branch_id="205")
        self.assertEqual(res_exp.status, "session_expired")

    def test_read_only_safety_guardrail_blocks_ticket_taking(self) -> None:
        # Allowed read-only postback
        BOTQueueClient._assert_read_only_post({"__EVENTTARGET": "lbtRenew", "hfKEY": ""})

        # Disallowed hfKEY (attempting to draw a queue ticket) MUST raise PermissionError
        with self.assertRaises(PermissionError):
            BOTQueueClient._assert_read_only_post({"__EVENTTARGET": "lbtRenew", "hfKEY": "001000001"})

        # Disallowed __EVENTTARGET (e.g. reservation or unknown control) MUST raise PermissionError
        with self.assertRaises(PermissionError):
            BOTQueueClient._assert_read_only_post({"__EVENTTARGET": "lbtRsvOrder", "hfKEY": ""})


if __name__ == "__main__":
    unittest.main()
