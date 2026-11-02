"""
Lightweight local web dashboard & Stage-B API preview server for BOT Queue Analytics.
Displays 100% factual observed statistics without any modeled/estimated values.

Usage:
  python3 -m src.dashboard --db data/bot_queue.db --port 8502
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>臺灣銀行分行叫號與等候實測統計儀表板</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #475569;
      --primary: #991b1b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 24px;
    }
    .container { max-width: 1240px; margin: 0 auto; }
    .header {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    h1 { margin: 0 0 8px 0; font-size: 1.4rem; color: var(--primary); }
    .note {
      background: #f1f5f9;
      border-left: 4px solid var(--primary);
      padding: 10px 14px;
      font-size: 0.9rem;
      color: #334155;
      margin-top: 12px;
      border-radius: 4px;
    }
    .controls {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 16px;
      background: var(--card);
      padding: 14px 18px;
      border-radius: 12px;
      border: 1px solid var(--border);
      align-items: center;
    }
    select, input, button {
      padding: 7px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.92rem;
    }
    button {
      background: var(--primary);
      color: #fff;
      border: none;
      cursor: pointer;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 20px;
      overflow-x: auto;
    }
    h2 { margin-top: 0; font-size: 1.15rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    th { background: #f1f5f9; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>臺灣銀行分行叫號與現場等候人數實測統計</h1>
      <div id="stats-bar" style="color: var(--muted); font-size: 0.92rem;">載入中...</div>
      <div class="note">
        📊 <strong>100% 實測觀測統計</strong>：本表所有數據皆直接取自臺銀線上取號頁面（<code>Service.aspx</code>）全分行共通顯示之實測快照（目前叫號與等待人數），不含任何推估模型或僅部分分行顯示之欄位。
      </div>
    </div>

    <div class="controls">
      <label>日期：<input type="date" id="dateFilter" /></label>
      <label>分行：
        <select id="branchFilter"><option value="">全部分行</option></select>
      </label>
      <button onclick="reloadData()">重新整理</button>
    </div>

    <div class="card">
      <h2>每日實測統計彙整（Daily Observed Statistics）</h2>
      <table id="metricsTable">
        <thead>
          <tr>
            <th>日期</th>
            <th>分行</th>
            <th>業務類別</th>
            <th>觀測起訖時間</th>
            <th class="num">平均等待人數</th>
            <th class="num">最高等待人數 (發生時間)</th>
            <th>最忙碌時段</th>
            <th class="num">總叫號人數</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <div class="card">
      <h2>最新即時快照（Latest Queue Snapshots）</h2>
      <table id="snapshotsTable">
        <thead>
          <tr>
            <th>頁面資料時間 (lbTime)</th>
            <th>分行</th>
            <th>業務類別</th>
            <th class="num">目前叫號</th>
            <th class="num">現場等待人數</th>
            <th>狀態</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <script>
    async function reloadData() {
      const dateVal = document.getElementById('dateFilter').value;
      const branchVal = document.getElementById('branchFilter').value;
      const res = await fetch(`/api/bot-queue/summary?date=${encodeURIComponent(dateVal)}&branch_id=${encodeURIComponent(branchVal)}`);
      const data = await res.json();

      document.getElementById('stats-bar').textContent =
        `系統登錄據點：${data.branch_counts.total} 間（啟用 ${data.branch_counts.enabled} 間 / 停用 ${data.branch_counts.disabled} 間）｜累積實測快照：${data.total_snapshots} 筆`;

      const branchSel = document.getElementById('branchFilter');
      if (branchSel.options.length <= 1 && data.branches_with_data.length > 0) {
        data.branches_with_data.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.branch_id;
          opt.textContent = `${b.branch_id} ${b.branch_name} (${b.city})`;
          branchSel.appendChild(opt);
        });
      }

      const mBody = document.querySelector('#metricsTable tbody');
      mBody.innerHTML = '';
      data.daily_metrics.forEach(r => {
        const tr = document.createElement('tr');
        const timeRange = (r.first_observed_at && r.last_observed_at) ? `${r.first_observed_at} ~ ${r.last_observed_at}` : '-';
        const maxWaitStr = r.max_waiting_count != null ? `${r.max_waiting_count} 人 (${r.max_waiting_at || '-'})` : '-';
        const totalCalledStr = r.total_called_count != null ? `${r.total_called_count} 人` : '-';
        tr.innerHTML = `
          <td>${r.date_local}</td>
          <td>${r.branch_id} ${r.branch_name || ''}</td>
          <td>${r.service_name || ''}</td>
          <td>${timeRange}</td>
          <td class="num"><strong>${r.avg_waiting_count != null ? r.avg_waiting_count + ' 人' : '-'}</strong></td>
          <td class="num">${maxWaitStr}</td>
          <td>${r.peak_hour_local || '-'}</td>
          <td class="num"><strong>${totalCalledStr}</strong></td>
        `;
        mBody.appendChild(tr);
      });

      const sBody = document.querySelector('#snapshotsTable tbody');
      sBody.innerHTML = '';
      data.latest_snapshots.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${s.source_reported_at || s.observed_at}</td>
          <td>${s.branch_id} ${s.branch_name || ''}</td>
          <td>${s.service_name || ''}</td>
          <td class="num"><strong>${s.current_ticket_raw || '-'}</strong></td>
          <td class="num">${s.waiting_count != null ? s.waiting_count + ' 人' : '-'}</td>
          <td>${s.status}</td>
        `;
        sBody.appendChild(tr);
      });
    }
    reloadData();
  </script>
</body>
</html>
"""


def query_dashboard_payload(db_path: Path, date_filter: str = "", branch_filter: str = "") -> Dict[str, Any]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        counts = conn.execute(
            """
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN is_disabled_on_site = 0 THEN 1 ELSE 0 END) AS enabled,
                SUM(CASE WHEN is_disabled_on_site = 1 THEN 1 ELSE 0 END) AS disabled
            FROM branches
            """
        ).fetchone()
        total_snaps = conn.execute("SELECT COUNT(*) AS cnt FROM queue_snapshots").fetchone()["cnt"]

        branches_with_data = [
            dict(r)
            for r in conn.execute(
                """
                SELECT DISTINCT b.branch_id, b.branch_name, b.city
                FROM branches b
                JOIN queue_snapshots q ON q.branch_id = b.branch_id
                ORDER BY b.branch_id
                """
            ).fetchall()
        ]

        m_sql = """
            SELECT m.*, b.branch_name, s.service_name
            FROM daily_metrics m
            LEFT JOIN branches b ON b.branch_id = m.branch_id
            LEFT JOIN service_types s ON s.branch_id = m.branch_id AND s.service_code = m.service_code
            WHERE 1=1
        """
        m_params: List[Any] = []
        if date_filter:
            m_sql += " AND m.date_local = ?"
            m_params.append(date_filter)
        if branch_filter:
            m_sql += " AND m.branch_id = ?"
            m_params.append(branch_filter)
        m_sql += " ORDER BY m.date_local DESC, m.avg_waiting_count DESC, m.branch_id ASC"
        daily_metrics = [dict(r) for r in conn.execute(m_sql, m_params).fetchall()]

        s_sql = """
            SELECT q.*, b.branch_name, s.service_name
            FROM queue_snapshots q
            LEFT JOIN branches b ON b.branch_id = q.branch_id
            LEFT JOIN service_types s ON s.branch_id = q.branch_id AND s.service_code = q.service_code
            WHERE q.service_code != '__BRANCH__'
        """
        s_params: List[Any] = []
        if branch_filter:
            s_sql += " AND q.branch_id = ?"
            s_params.append(branch_filter)
        s_sql += " ORDER BY q.id DESC LIMIT 100"
        latest_snapshots = [dict(r) for r in conn.execute(s_sql, s_params).fetchall()]

        return {
            "branch_counts": {
                "total": counts["total"] or 0,
                "enabled": counts["enabled"] or 0,
                "disabled": counts["disabled"] or 0,
            },
            "total_snapshots": total_snaps,
            "branches_with_data": branches_with_data,
            "daily_metrics": daily_metrics,
            "latest_snapshots": latest_snapshots,
        }
    finally:
        conn.close()


def run_server(db_path: Path, port: int = 8502) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/api/bot-queue/summary":
                qs = urllib.parse.parse_qs(parsed.query)
                date_val = qs.get("date", [""])[0]
                branch_val = qs.get("branch_id", [""])[0]
                payload = query_dashboard_payload(db_path, date_filter=date_val, branch_filter=branch_val)
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            body = DASHBOARD_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            return

    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Dashboard running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run local BOT Queue Analytics dashboard")
    parser.add_argument("--db", default="data/bot_queue.db", help="Path to SQLite database")
    parser.add_argument("--port", type=int, default=8502, help="Local port")
    args = parser.parse_args()
    run_server(Path(args.db), port=args.port)
