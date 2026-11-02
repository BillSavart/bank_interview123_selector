import { describe, expect, it } from 'vitest';
import {
  aggregateDailyForDate,
  assertReadOnlyPost,
  computeServiceDailyMetric,
  getBotBranchHistory,
  getBotQueueSummary,
  openBotQueueDb,
  parseServicePageHtml,
  saveBranchPageResult,
} from './bot-queue.mjs';

describe('bot-queue server store and factual aggregation', () => {
  it('seeds all 164 branches and blocks non-read-only postbacks', () => {
    const db = openBotQueueDb(':memory:');
    const summary = getBotQueueSummary(db);
    expect(summary.branch_counts).toEqual({
      total: 164,
      enabled: 151,
      disabled: 13,
    });

    expect(() => assertReadOnlyPost({ __EVENTTARGET: 'lbtRenew', hfKEY: '' })).not.toThrow();
    expect(() => assertReadOnlyPost({ __EVENTTARGET: 'lbtRenew', hfKEY: '001000001' })).toThrow(/SAFETY LOCK/);
    expect(() => assertReadOnlyPost({ __EVENTTARGET: 'lbtRsvOrder', hfKEY: '' })).toThrow(/SAFETY LOCK/);
    db.close();
  });

  it('computes pure factual daily metrics (avg/max waiting, peak hour, total_called_count)', () => {
    const db = openBotQueueDb(':memory:');
    const runId = Number(
      db
        .prepare("INSERT INTO crawl_runs (started_at, mode, total_targets) VALUES ('2026-11-03T01:00:00Z', 'pilot', 1)")
        .run().lastInsertRowid,
    );

    const sampleSnaps = [
      {
        branchId: '007',
        branchName: '館前分行',
        sourceReportedAt: '2026-11-03T09:10:00+08:00',
        pageValid: true,
        status: 'ok',
        sourceHash: 'h1',
        services: [
          {
            serviceCode: '001000001',
            serviceName: '一般收付',
            serviceDesc: '臺幣存匯',
            slotClass: 's1t',
            currentTicketRaw: '0101',
            ticketPrefix: '01',
            ticketNumber: 101,
            waitingCount: 4,
            status: 'ok',
          },
        ],
      },
      {
        branchId: '007',
        branchName: '館前分行',
        sourceReportedAt: '2026-11-03T11:25:15+08:00',
        pageValid: true,
        status: 'ok',
        sourceHash: 'h2',
        services: [
          {
            serviceCode: '001000001',
            serviceName: '一般收付',
            serviceDesc: '臺幣存匯',
            slotClass: 's1t',
            currentTicketRaw: '0145',
            ticketPrefix: '01',
            ticketNumber: 145,
            waitingCount: 14,
            status: 'ok',
          },
        ],
      },
      {
        branchId: '007',
        branchName: '館前分行',
        sourceReportedAt: '2026-11-03T16:10:00+08:00',
        pageValid: false,
        status: 'ok',
        sourceHash: 'h3',
        services: [
          {
            serviceCode: 'slot_1',
            serviceName: '一般收付',
            serviceDesc: '臺幣存匯',
            slotClass: 's1t',
            currentTicketRaw: '0231',
            ticketPrefix: '02',
            ticketNumber: 231,
            waitingCount: 0,
            status: 'ok',
          },
        ],
      },
    ];

    for (const s of sampleSnaps) {
      saveBranchPageResult(db, runId, s, s.sourceReportedAt);
    }

    const computed = aggregateDailyForDate(db, '2026-11-03');
    expect(computed).toHaveLength(1);
    expect(computed[0]).toMatchObject({
      date_local: '2026-11-03',
      branch_id: '007',
      service_code: '001000001',
      first_observed_at: '09:10:00',
      last_observed_at: '16:10:00',
      avg_waiting_count: 6,
      min_waiting_count: 0,
      max_waiting_count: 14,
      max_waiting_at: '11:25:15',
      peak_hour_local: '11:00-12:00',
      total_called_count: 130,
    });

    const summary = getBotQueueSummary(db, { date: '2026-11-03', city: '台北市' });
    expect(summary.daily_metrics).toHaveLength(1);
    expect(summary.daily_metrics[0].branch_name).toBe('館前分行');
    expect(summary.daily_metrics[0].service_name).toBe('一般收付');
    expect(summary.daily_metrics[0].total_called_count).toBe(130);

    const branchHistory = getBotBranchHistory(db, '007');
    expect(branchHistory?.branch.branch_name).toBe('館前分行');
    expect(branchHistory?.history).toHaveLength(1);
    db.close();
  });

  it('parses post-15:30 queue clearing vs closed blanked state', () => {
    const activePost1530Html = `
      <span id="lbBrname">館前分行</span>
      <span id="lbTime">2026/11/03 15:40:00</span>
      <input type="hidden" id="hfPageValid" value="false" />
      <div class="service s1t">
        <p class="service_title">一般收付</p>
        <p class="service_ty">臺幣</p>
        <p class="service_tw">0189</p>
        <p class="service_tc c1t">2</p>
      </div>
      <input type="hidden" name="hfKEY" value="" />
    `;
    const r1 = parseServicePageHtml(activePost1530Html, '007');
    expect(r1.status).toBe('ok');
    expect(r1.services[0].status).toBe('ok');
    expect(r1.services[0].waitingCount).toBe(2);

    const closedBlankHtml = activePost1530Html.replace('0189', '').replace('>2<', '><');
    const r2 = parseServicePageHtml(closedBlankHtml, '007');
    expect(r2.status).toBe('closed');
    expect(r2.services[0].status).toBe('closed');
  });
});
