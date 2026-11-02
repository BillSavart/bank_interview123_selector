"""HTML parsers for Bank of Taiwan online queue system (Branch.aspx & Service.aspx)."""

from __future__ import annotations

import hashlib
import html
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

TAIPEI_TZ = ZoneInfo("Asia/Taipei")


@dataclass(frozen=True)
class BranchInfo:
    branch_id: str
    branch_name: str
    city: str
    phone: str
    address: str
    is_disabled_on_site: bool = False


@dataclass(frozen=True)
class ServiceSnapshotItem:
    service_code: str
    service_name: str
    service_desc: str
    slot_class: str
    current_ticket_raw: Optional[str]
    ticket_prefix: Optional[str]
    ticket_number: Optional[int]
    waiting_count: Optional[int]
    status: str = "ok"


@dataclass
class BranchPageResult:
    branch_id: str
    branch_name: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    data_time_raw: Optional[str]
    source_reported_at: Optional[str]
    page_valid: bool
    close_message: Optional[str]
    status: str  # 'ok' | 'closed' | 'session_expired' | 'parse_error'
    source_hash: str
    services: List[ServiceSnapshotItem] = field(default_factory=list)


def extract_hidden_fields(html_text: str) -> Dict[str, str]:
    """Extract all <input type="hidden"> fields from an ASP.NET WebForms page."""
    fields: Dict[str, str] = {}
    for m in re.finditer(r'<input[^>]+type=["\']hidden["\'][^>]*>', html_text, re.I):
        tag = m.group(0)
        name_m = re.search(r'name=["\']([^"\']+)["\']', tag, re.I)
        if not name_m:
            name_m = re.search(r'id=["\']([^"\']+)["\']', tag, re.I)
        val_m = re.search(r'value=["\']([^"\']*)["\']', tag, re.I)
        if name_m:
            fields[name_m.group(1)] = html.unescape(val_m.group(1)) if val_m else ""
    return fields


def parse_ticket_string(raw: Optional[str]) -> Tuple[Optional[str], Optional[int]]:
    """
    Parse a ticket string into (ticket_prefix, ticket_number).
    Examples:
      - '0510' -> ('05', 510)
      - '3125' -> ('31', 3125)
      - 'A052' -> ('A', 52)
      - '' / None / '--' -> (None, None)
    """
    if raw is None:
        return None, None
    cleaned = raw.strip()
    if not cleaned:
        return None, None

    # Case 1: Pure digits (BOT standard 4-digit format like '0510', '3125')
    if re.fullmatch(r"\d+", cleaned):
        num = int(cleaned)
        prefix = cleaned[:2] if len(cleaned) >= 4 else "00"
        return prefix, num

    # Case 2: Letter prefix + digits (e.g. 'A052')
    m = re.fullmatch(r"([A-Za-z]+)(\d+)", cleaned)
    if m:
        return m.group(1).upper(), int(m.group(2))

    return None, None


def parse_reported_time_iso(raw_time: Optional[str]) -> Optional[str]:
    """Convert '2026/11/02 14:52:17' (Asia/Taipei) to ISO 8601 string with +08:00."""
    if not raw_time:
        return None
    cleaned = raw_time.strip()
    for fmt in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M"):
        try:
            dt = datetime.strptime(cleaned, fmt).replace(tzinfo=TAIPEI_TZ)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def parse_branch_search_html(html_text: str, default_city: str = "") -> List[BranchInfo]:
    """Parse branch radio rows from Branch.aspx search result table."""
    results: List[BranchInfo] = []
    seen_ids = set()

    row_pattern = re.compile(
        r'<input[^>]+name=["\']brn["\'][^>]+id=["\']brn([^"\']+)["\'][^>]+value=["\']([^"\']+)["\']([^>]*)>\s*'
        r'<label[^>]*>([^<]+)</label>\s*</th>\s*'
        r'<td[^>]*>([^<]*)</td>\s*'
        r'<td[^>]*>([^<]*)</td>',
        re.S | re.I,
    )
    for _id_code, val_code, attrs, name, phone, addr in row_pattern.findall(html_text):
        branch_id = val_code.strip()
        if not branch_id or branch_id in seen_ids:
            continue
        seen_ids.add(branch_id)
        is_disabled = "disabled" in attrs.lower()
        clean_addr = html.unescape(addr).strip()
        city = default_city
        if not city and len(clean_addr) >= 3:
            city_m = re.match(r"^(.{2}[市縣])", clean_addr)
            if city_m:
                city = city_m.group(1)
        results.append(
            BranchInfo(
                branch_id=branch_id,
                branch_name=html.unescape(name).strip(),
                city=city,
                phone=html.unescape(phone).strip(),
                address=clean_addr,
                is_disabled_on_site=is_disabled,
            )
        )
    return results


def parse_service_page_html(html_text: str, branch_id: str = "") -> BranchPageResult:
    """
    Parse Service.aspx HTML into structured branch metadata and service queue snapshots.
    Supports both standard `<div class="service s1~s4">` and wait-time `<div class="service s1t~s4t">`.
    """
    source_hash = hashlib.sha256(html_text.encode("utf-8", errors="ignore")).hexdigest()[:16]

    # Detect session expiration / redirect back to Default.aspx or SessionLogout.aspx
    if (
        'action="./Default.aspx"' in html_text
        or "SessionLogout.aspx" in html_text
        or ('id="lbtImmOrder"' in html_text and 'id="lbBrname"' not in html_text)
    ):
        return BranchPageResult(
            branch_id=branch_id,
            branch_name=None,
            phone=None,
            address=None,
            data_time_raw=None,
            source_reported_at=None,
            page_valid=False,
            close_message=None,
            status="session_expired",
            source_hash=source_hash,
            services=[],
        )

    brname_m = re.search(r'<span[^>]+id=["\']lbBrname["\'][^>]*>([^<]*)</span>', html_text, re.I)
    lbtime_m = re.search(r'<span[^>]+id=["\']lbTime["\'][^>]*>([^<]*)</span>', html_text, re.I)
    phone_m = re.search(r'<span[^>]+id=["\']lbPhone["\'][^>]*>([^<]*)</span>', html_text, re.I)
    addr_m = re.search(r'<span[^>]+id=["\']lbAddr["\'][^>]*>([^<]*)</span>', html_text, re.I)
    valid_m = re.search(r'<input[^>]+id=["\']hfPageValid["\'][^>]+value=["\']([^"\']*)["\']', html_text, re.I)
    close_m = re.search(r'<div[^>]+id=["\']CLOSEMESSAGE["\'][^>]*>([^<]*)</div>', html_text, re.I)

    branch_name = html.unescape(brname_m.group(1)).strip() if brname_m else None
    data_time_raw = html.unescape(lbtime_m.group(1)).strip() if lbtime_m else None
    source_reported_at = parse_reported_time_iso(data_time_raw)
    phone = html.unescape(phone_m.group(1)).strip() if phone_m else None
    address = html.unescape(addr_m.group(1)).strip() if addr_m else None
    page_valid = (valid_m.group(1).strip().lower() == "true") if valid_m else True
    close_message = html.unescape(close_m.group(1)).strip() if close_m else None

    if not branch_name and not data_time_raw:
        return BranchPageResult(
            branch_id=branch_id,
            branch_name=None,
            phone=None,
            address=None,
            data_time_raw=None,
            source_reported_at=None,
            page_valid=False,
            close_message=close_message,
            status="parse_error",
            source_hash=source_hash,
            services=[],
        )

    # Match each <div class="service s1"> or <div class="service s1t"> block
    service_blocks = re.finditer(
        r'<div\s+class=["\']service\s+(s\d+t?)["\']\s*>(.*?)(?=<div\s+class=["\']service\s+s\d+t?["\']|<div\s+class=["\']center_area\s+service_area["\']|<input[^>]+name=["\']hfKEY["\'])',
        html_text,
        re.S | re.I,
    )

    services: List[ServiceSnapshotItem] = []
    item_status = "ok" if page_valid else "closed"

    for idx, m in enumerate(service_blocks, start=1):
        slot_class = m.group(1).strip()
        block = m.group(2)

        title_m = re.search(r'<p\s+class=["\']service_title["\'][^>]*>(.*?)</p>', block, re.S | re.I)
        ty_m = re.search(r'<p\s+class=["\']service_ty["\'][^>]*>(.*?)</p>', block, re.S | re.I)
        tw_m = re.search(r'<p\s+class=["\']service_tw[^"\']*["\'][^>]*>(.*?)</p>', block, re.S | re.I)
        tc_m = re.search(r'<p\s+class=["\']service_tc[^"\']*["\'][^>]*>(.*?)</p>', block, re.S | re.I)
        key_m = re.search(r'data-order-key=["\']([^"\']+)["\']', block, re.I)

        service_name = html.unescape(re.sub(r"<[^>]+>", "", title_m.group(1))).strip() if title_m else f"業務_{idx}"
        if ty_m:
            raw_desc = re.sub(r"<br\s*/?>", " / ", ty_m.group(1), flags=re.I)
            raw_desc = html.unescape(re.sub(r"<[^>]+>", "", raw_desc)).replace("\xa0", " ")
            parts = [p.strip() for p in raw_desc.split("/") if p.strip()]
            service_desc = " / ".join(parts)
        else:
            service_desc = ""

        service_code = key_m.group(1).strip() if key_m else f"slot_{idx}"

        current_ticket_raw: Optional[str] = None
        if tw_m:
            current_ticket_raw = html.unescape(re.sub(r"<[^>]+>", "", tw_m.group(1))).strip()

        ticket_prefix, ticket_number = parse_ticket_string(current_ticket_raw)

        waiting_count: Optional[int] = None
        if tc_m:
            tc_text = html.unescape(re.sub(r"<[^>]+>", "", tc_m.group(1))).strip()
            tc_num_m = re.search(r"\d+", tc_text)
            if tc_num_m:
                waiting_count = int(tc_num_m.group(0))

        # After 15:30, online ticket-taking closes (hfPageValid=false and data-order-key is omitted),
        # but branches still clearing their queue (15:30-17:00) continue displaying live ticket/waiting numbers.
        if waiting_count is not None and current_ticket_raw:
            row_status = "ok"
        elif not page_valid:
            row_status = "closed"
        else:
            row_status = "parse_error"

        services.append(
            ServiceSnapshotItem(
                service_code=service_code,
                service_name=service_name,
                service_desc=service_desc,
                slot_class=slot_class,
                current_ticket_raw=current_ticket_raw,
                ticket_prefix=ticket_prefix,
                ticket_number=ticket_number,
                waiting_count=waiting_count,
                status=row_status,
            )
        )

    has_ok_service = any(s.status == "ok" for s in services)
    if has_ok_service:
        overall_status = "ok"
    elif not page_valid or any(s.status == "closed" for s in services):
        overall_status = "closed"
    else:
        overall_status = "parse_error"
    return BranchPageResult(
        branch_id=branch_id,
        branch_name=branch_name,
        phone=phone,
        address=address,
        data_time_raw=data_time_raw,
        source_reported_at=source_reported_at,
        page_valid=page_valid,
        close_message=close_message,
        status=overall_status,
        source_hash=source_hash,
        services=services,
    )
