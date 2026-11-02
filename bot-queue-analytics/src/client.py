"""
Read-only, low-impact HTTP client for Bank of Taiwan online queue system.

Safety Guardrails:
1. Hard Read-Only Whitelist: Only navigation/refresh __EVENTTARGET values are permitted;
   hfKEY (ticket-taking key) is strictly locked to empty string "".
2. Session-Pinned lbtRenew: Caches per-branch Service.aspx session state so subsequent
   polls require only 1 lightweight POST request (~9.3 KB) per branch.
3. Polite Pacing & Latency Tracking: Enforces delays between steps and measures server
   response time so the collector can trip its circuit breaker if the bank server slows down.
"""

from __future__ import annotations

import http.cookiejar
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .parser import (
    BranchInfo,
    BranchPageResult,
    extract_hidden_fields,
    parse_branch_search_html,
    parse_service_page_html,
)

ALLOWED_POSTBACK_TARGETS = frozenset(
    {
        "lbtImmOrder",
        "lbtSearch",
        "lbtSearch2",
        "lbtCheck",
        "lbtRenew",
    }
)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@dataclass
class FetchOutcome:
    branch_id: str
    page_result: BranchPageResult
    http_status: int
    elapsed_sec: float
    used_renew: bool
    request_count: int
    retry_after_sec: Optional[int] = None
    error_message: Optional[str] = None


class BOTQueueClient:
    """Polite, read-only ASP.NET WebForms client with per-branch pinned session cache."""

    def __init__(
        self,
        base_url: str = "https://ino.bot.com.tw/INOWeb/",
        session_cache_path: Optional[str | Path] = None,
        timeout_sec: float = 12.0,
        step_delay_sec: float = 0.6,
        verify_ssl: bool = False,
    ) -> None:
        self.base_url = base_url if base_url.endswith("/") else base_url + "/"
        self.session_cache_path = Path(session_cache_path) if session_cache_path else None
        self.timeout_sec = timeout_sec
        self.step_delay_sec = step_delay_sec
        self.ssl_ctx = self._build_ssl_context(verify_ssl)
        self.session_cache: Dict[str, Dict[str, object]] = self._load_session_cache()

    @staticmethod
    def _build_ssl_context(verify_ssl: bool) -> ssl.SSLContext:
        ctx = ssl.create_default_context()
        if not verify_ssl:
            # ino.bot.com.tw uses a TWCA/GRCA chain that may be missing from default Python OpenSSL stores
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        return ctx

    def _load_session_cache(self) -> Dict[str, Dict[str, object]]:
        if not self.session_cache_path or not self.session_cache_path.exists():
            return {}
        try:
            data = json.loads(self.session_cache_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        return {}

    def save_session_cache(self) -> None:
        if not self.session_cache_path:
            return
        self.session_cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.session_cache_path.write_text(
            json.dumps(self.session_cache, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def _make_opener(self, initial_cookies: Optional[Dict[str, str]] = None) -> Tuple[urllib.request.OpenerDirector, http.cookiejar.CookieJar]:
        cj = http.cookiejar.CookieJar()
        if initial_cookies:
            for name, val in initial_cookies.items():
                cookie = http.cookiejar.Cookie(
                    version=0,
                    name=name,
                    value=val,
                    port=None,
                    port_specified=False,
                    domain="ino.bot.com.tw",
                    domain_specified=True,
                    domain_initial_dot=False,
                    path="/",
                    path_specified=True,
                    secure=True,
                    expires=None,
                    discard=True,
                    comment=None,
                    comment_url=None,
                    rest={},
                    rfc2109=False,
                )
                cj.set_cookie(cookie)
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=self.ssl_ctx),
            urllib.request.HTTPCookieProcessor(cj),
        )
        opener.addheaders = [
            ("User-Agent", DEFAULT_USER_AGENT),
            ("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
            ("Accept-Language", "zh-TW,zh;q=0.9,en;q=0.8"),
        ]
        return opener, cj

    @staticmethod
    def _extract_cookies_dict(cj: http.cookiejar.CookieJar) -> Dict[str, str]:
        return {c.name: c.value for c in cj}

    @staticmethod
    def _assert_read_only_post(form_data: Dict[str, str]) -> None:
        """Hard safety check: forbid any ticket-taking or reservation action."""
        target = form_data.get("__EVENTTARGET", "")
        if target not in ALLOWED_POSTBACK_TARGETS:
            raise PermissionError(
                f"Read-only safety guardrail blocked disallowed __EVENTTARGET={target!r}"
            )
        if form_data.get("hfKEY", ""):
            raise PermissionError(
                "Read-only safety guardrail blocked non-empty hfKEY (ticket-taking is strictly forbidden)"
            )

    def _request(
        self,
        opener: urllib.request.OpenerDirector,
        url: str,
        form_data: Optional[Dict[str, str]] = None,
        referer: Optional[str] = None,
    ) -> Tuple[str, str, int, float]:
        headers: Dict[str, str] = {}
        data_bytes: Optional[bytes] = None
        if form_data is not None:
            self._assert_read_only_post(form_data)
            data_bytes = urllib.parse.urlencode(form_data).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            headers["Origin"] = "https://ino.bot.com.tw"
        if referer:
            headers["Referer"] = referer

        req = urllib.request.Request(url, data=data_bytes, headers=headers)
        t0 = time.monotonic()
        resp = opener.open(req, timeout=self.timeout_sec)
        body = resp.read().decode("utf-8", errors="replace")
        elapsed = time.monotonic() - t0
        return body, resp.geturl(), int(getattr(resp, "status", 200)), elapsed

    def discover_all_branches(self) -> List[BranchInfo]:
        """
        Discover all 164 branches using only 2 keyword searches ('分行' + '營業部')
        on Branch.aspx instead of 22 county searches.
        """
        opener, _cj = self._make_opener()
        default_url = self.base_url + "Default.aspx"
        h1, u1, _, _ = self._request(opener, default_url)
        f1 = extract_hidden_fields(h1)

        time.sleep(self.step_delay_sec)
        p1 = {
            "__EVENTTARGET": "lbtImmOrder",
            "__EVENTARGUMENT": "",
            "__VIEWSTATE": f1.get("__VIEWSTATE", ""),
            "__VIEWSTATEGENERATOR": f1.get("__VIEWSTATEGENERATOR", ""),
            "__EVENTVALIDATION": f1.get("__EVENTVALIDATION", ""),
            "txtPhone1": "",
            "txtPhone2": "",
            "txtCAPTCHA": "",
            "IMMORDER": "",
            "IMMORDER_BRN": "",
            "RSVORDER_BRN": "",
            "ACTION": "",
        }
        h_branch, branch_url, _, _ = self._request(opener, u1, form_data=p1, referer=u1)
        f_branch = extract_hidden_fields(h_branch)

        discovered: Dict[str, BranchInfo] = {}
        for kw in ("分行", "營業部"):
            time.sleep(self.step_delay_sec)
            p_kw = {
                "__EVENTTARGET": "lbtSearch2",
                "__EVENTARGUMENT": "",
                "__VIEWSTATE": f_branch.get("__VIEWSTATE", ""),
                "__VIEWSTATEGENERATOR": f_branch.get("__VIEWSTATEGENERATOR", ""),
                "__EVENTVALIDATION": f_branch.get("__EVENTVALIDATION", ""),
                "txtKey": kw,
                "selCity": "",
                "selArea": "",
                "selCity2": "",
                "selArea2": "",
                "txtaddr": "",
                "hfBRNO": "",
                "hfBRNO2": "",
                "hfCITY": "",
                "hfAREA": "",
                "hfLONG": "",
                "hfLATI": "",
                "hfTAB": "1",
            }
            h_kw, branch_url, _, _ = self._request(opener, branch_url, form_data=p_kw, referer=branch_url)
            f_branch = extract_hidden_fields(h_kw)
            for b in parse_branch_search_html(h_kw):
                discovered[b.branch_id] = b

        return sorted(discovered.values(), key=lambda x: x.branch_id)

    def fetch_branch_queue(self, branch_id: str, branch_name: str) -> FetchOutcome:
        """
        Fetch queue status for a single branch.
        1. Tries 1-request Session-Pinned `lbtRenew` first if cached session exists.
        2. Falls back to polite Warm-up (Default -> Branch -> lbtSearch2 -> lbtCheck) only if needed.
        """
        req_count = 0
        total_elapsed = 0.0

        # 1. Try Fast Path: Session-Pinned lbtRenew (1 HTTP POST, ~9.3 KB)
        cached = self.session_cache.get(branch_id)
        if cached and isinstance(cached.get("cookies"), dict) and cached.get("viewstate"):
            opener, cj = self._make_opener(cached["cookies"])  # type: ignore[arg-type]
            service_url = str(cached.get("service_url") or (self.base_url + "ImmOrder/Service.aspx"))
            p_renew = {
                "__EVENTTARGET": "lbtRenew",
                "__EVENTARGUMENT": "",
                "__VIEWSTATE": str(cached.get("viewstate", "")),
                "__VIEWSTATEGENERATOR": str(cached.get("viewstategenerator", "")),
                "__EVENTVALIDATION": str(cached.get("eventvalidation", "")),
                "hfKEY": "",
            }
            try:
                html_ren, final_url, status_code, elapsed = self._request(
                    opener, service_url, form_data=p_renew, referer=service_url
                )
                req_count += 1
                total_elapsed += elapsed
                parsed = parse_service_page_html(html_ren, branch_id=branch_id)
                if parsed.status in ("ok", "closed") and parsed.services:
                    f_new = extract_hidden_fields(html_ren)
                    self.session_cache[branch_id] = {
                        "cookies": self._extract_cookies_dict(cj),
                        "viewstate": f_new.get("__VIEWSTATE", ""),
                        "viewstategenerator": f_new.get("__VIEWSTATEGENERATOR", ""),
                        "eventvalidation": f_new.get("__EVENTVALIDATION", ""),
                        "service_url": final_url,
                        "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                    }
                    self.save_session_cache()
                    return FetchOutcome(
                        branch_id=branch_id,
                        page_result=parsed,
                        http_status=status_code,
                        elapsed_sec=total_elapsed,
                        used_renew=True,
                        request_count=req_count,
                    )
            except urllib.error.HTTPError as e:
                retry_after = int(e.headers.get("Retry-After", 0)) if e.headers and e.headers.get("Retry-After", "").isdigit() else None
                return FetchOutcome(
                    branch_id=branch_id,
                    page_result=BranchPageResult(
                        branch_id=branch_id,
                        branch_name=branch_name,
                        phone=None,
                        address=None,
                        data_time_raw=None,
                        source_reported_at=None,
                        page_valid=False,
                        close_message=None,
                        status="http_error",
                        source_hash="",
                    ),
                    http_status=e.code,
                    elapsed_sec=total_elapsed,
                    used_renew=True,
                    request_count=req_count + 1,
                    retry_after_sec=retry_after,
                    error_message=f"HTTP {e.code} on lbtRenew",
                )
            except Exception:
                # Session expired or transient socket reset -> proceed to polite warm-up
                pass

        # 2. Warm-up Path: Establish fresh session for this branch
        opener, cj = self._make_opener()
        default_url = self.base_url + "Default.aspx"
        try:
            h1, u1, _, el1 = self._request(opener, default_url)
            req_count += 1
            total_elapsed += el1
            f1 = extract_hidden_fields(h1)

            time.sleep(self.step_delay_sec)
            p1 = {
                "__EVENTTARGET": "lbtImmOrder",
                "__EVENTARGUMENT": "",
                "__VIEWSTATE": f1.get("__VIEWSTATE", ""),
                "__VIEWSTATEGENERATOR": f1.get("__VIEWSTATEGENERATOR", ""),
                "__EVENTVALIDATION": f1.get("__EVENTVALIDATION", ""),
                "txtPhone1": "",
                "txtPhone2": "",
                "txtCAPTCHA": "",
                "IMMORDER": "",
                "IMMORDER_BRN": "",
                "RSVORDER_BRN": "",
                "ACTION": "",
            }
            h2, branch_url, _, el2 = self._request(opener, u1, form_data=p1, referer=u1)
            req_count += 1
            total_elapsed += el2
            f2 = extract_hidden_fields(h2)

            time.sleep(self.step_delay_sec)
            p_kw = {
                "__EVENTTARGET": "lbtSearch2",
                "__EVENTARGUMENT": "",
                "__VIEWSTATE": f2.get("__VIEWSTATE", ""),
                "__VIEWSTATEGENERATOR": f2.get("__VIEWSTATEGENERATOR", ""),
                "__EVENTVALIDATION": f2.get("__EVENTVALIDATION", ""),
                "txtKey": branch_name,
                "selCity": "",
                "selArea": "",
                "selCity2": "",
                "selArea2": "",
                "txtaddr": "",
                "hfBRNO": "",
                "hfBRNO2": "",
                "hfCITY": "",
                "hfAREA": "",
                "hfLONG": "",
                "hfLATI": "",
                "hfTAB": "1",
            }
            h3, branch_url, _, el3 = self._request(opener, branch_url, form_data=p_kw, referer=branch_url)
            req_count += 1
            total_elapsed += el3
            f3 = extract_hidden_fields(h3)

            time.sleep(self.step_delay_sec)
            p_check = {
                "__EVENTTARGET": "lbtCheck",
                "__EVENTARGUMENT": "",
                "__VIEWSTATE": f3.get("__VIEWSTATE", ""),
                "__VIEWSTATEGENERATOR": f3.get("__VIEWSTATEGENERATOR", ""),
                "__EVENTVALIDATION": f3.get("__EVENTVALIDATION", ""),
                "txtKey": branch_name,
                "selCity": "",
                "selArea": "",
                "brn": branch_id,
                "selCity2": "",
                "selArea2": "",
                "txtaddr": "",
                "hfBRNO": branch_id,
                "hfBRNO2": "",
                "hfCITY": "",
                "hfAREA": "",
                "hfLONG": "",
                "hfLATI": "",
                "hfTAB": "1",
            }
            h4, srv_url, status_code, el4 = self._request(opener, branch_url, form_data=p_check, referer=branch_url)
            req_count += 1
            total_elapsed += el4

            parsed = parse_service_page_html(h4, branch_id=branch_id)
            if parsed.status in ("ok", "closed") and parsed.services:
                f_srv = extract_hidden_fields(h4)
                self.session_cache[branch_id] = {
                    "cookies": self._extract_cookies_dict(cj),
                    "viewstate": f_srv.get("__VIEWSTATE", ""),
                    "viewstategenerator": f_srv.get("__VIEWSTATEGENERATOR", ""),
                    "eventvalidation": f_srv.get("__EVENTVALIDATION", ""),
                    "service_url": srv_url,
                    "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                }
                self.save_session_cache()

            return FetchOutcome(
                branch_id=branch_id,
                page_result=parsed,
                http_status=status_code,
                elapsed_sec=total_elapsed,
                used_renew=False,
                request_count=req_count,
            )

        except urllib.error.HTTPError as e:
            retry_after = int(e.headers.get("Retry-After", 0)) if e.headers and e.headers.get("Retry-After", "").isdigit() else None
            return FetchOutcome(
                branch_id=branch_id,
                page_result=BranchPageResult(
                    branch_id=branch_id,
                    branch_name=branch_name,
                    phone=None,
                    address=None,
                    data_time_raw=None,
                    source_reported_at=None,
                    page_valid=False,
                    close_message=None,
                    status="http_error",
                    source_hash="",
                ),
                http_status=e.code,
                elapsed_sec=total_elapsed,
                used_renew=False,
                request_count=req_count,
                retry_after_sec=retry_after,
                error_message=f"HTTP {e.code}",
            )
        except Exception as e:
            return FetchOutcome(
                branch_id=branch_id,
                page_result=BranchPageResult(
                    branch_id=branch_id,
                    branch_name=branch_name,
                    phone=None,
                    address=None,
                    data_time_raw=None,
                    source_reported_at=None,
                    page_valid=False,
                    close_message=None,
                    status="http_error",
                    source_hash="",
                ),
                http_status=0,
                elapsed_sec=total_elapsed,
                used_renew=False,
                request_count=req_count,
                error_message=str(e),
            )
