import { describe, expect, it } from 'vitest';
import {
  extractDateTimes,
  extractTabfSlug,
  hasAnyCalendarDate,
  parseExamListingHtml,
  parseSchedulePageHtml,
  parseSchedulePdfData,
} from './tabf-calendar-parser.mjs';

describe('tabf-calendar-parser', () => {
  it('extracts canonical slugs from svc.tabf.org.tw URLs and ignores non-exam paths', () => {
    expect(extractTabfSlug('https://svc.tabf.org.tw/115tcbbank04/')).toBe('115tcbbank04');
    expect(extractTabfSlug('https://svc.tabf.org.tw/115bot04/Home/Schedule')).toBe('115bot04');
    expect(extractTabfSlug('https://svc.tabf.org.tw/_File/Download/115bot04/logo.jpg')).toBeNull();
    expect(extractTabfSlug('https://example.com/115bot04/')).toBeNull();
  });

  it('parses Exam.aspx cards, deduplicates repeats, and ignores news ticker items', () => {
    const html = `
      <a class="title" href="https://svc.tabf.org.tw/115fpat02/CheckOrder/Index">【複查】CFP測驗</a>
      <section class="sect-exam area">
        <a class="model-card-group exam" href='https://svc.tabf.org.tw/115tcbbank04/'>
          <span class="tag">報名中</span>
          <p class="title">合作金庫商業銀行116年新進人員甄試</p>
        </a>
        <a class="model-card-group exam" href='https://svc.tabf.org.tw/115bot04/'>
          <p class="title">臺灣銀行115年新進工員甄試</p>
        </a>
        <a class="model-card-group exam" href='https://svc.tabf.org.tw/115tcbbank04/'>
          <p class="title">合作金庫商業銀行116年新進人員甄試</p>
        </a>
      </section>
    `;
    const list = parseExamListingHtml(html);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      slug: '115tcbbank04',
      externalKey: 'tabf:115tcbbank04',
      url: 'https://svc.tabf.org.tw/115tcbbank04/',
      scheduleUrl: 'https://svc.tabf.org.tw/115tcbbank04/Home/Schedule',
      title: '合作金庫商業銀行116年新進人員甄試',
      isRegistering: true,
    });
    expect(list[1].isRegistering).toBe(false);
  });

  it('extracts schedule PDF URL and decoded title from /Home/Schedule HTML', () => {
    const html = `
      <div id="title">&#33274;&#28771;&#37504;&#34892;115&#24180;&#26032;&#36914;&#24037;&#21729;&#29956;&#35430;</div>
      <section id="ScheduleList">
        <a id="MainContent_ScheduleList_hlSchedulePDFDownload" href="/_File/Download/115bot04/Schedule/10543Schedule870825.pdf">重要時程表PDF下載</a>
      </section>
    `;
    const parsed = parseSchedulePageHtml(html, 'https://svc.tabf.org.tw/115bot04/Home/Schedule');
    expect(parsed).toEqual({
      pdfUrl: 'https://svc.tabf.org.tw/_File/Download/115bot04/Schedule/10543Schedule870825.pdf',
      pageTitle: '臺灣銀行115年新進工員甄試',
    });
  });

  it('normalizes ROC dates, full-width colons, and shorthand ranges', () => {
    expect(extractDateTimes('115 年 8 月 6 日(星期四)10：00 至 115 年 8 月 26 日(星期三)17：00')).toEqual([
      '2026-08-06 10:00',
      '2026-08-26 17:00',
    ]);
    expect(extractDateTimes('115年12月5日(六)至6日(日)')).toEqual(['2026-12-05', '2026-12-06']);
    expect(extractDateTimes('116 年 1 月 18 日(星期一)14：00')).toEqual(['2027-01-18 14:00']);
  });

  it('parses standard 2-stage written + oral exam (115bot04 pattern)', () => {
    const tables = [
      [
        ['試別', '要 項', '時 間', '說明'],
        ['第\n一\n試\n：\n筆\n試', '報名期間', '115 年 8 月 6 日(星期四)10：00\n至\n115 年 8 月 26 日(星期三)17：00', '1.一律採網路報名'],
        ['測驗入場通知書\n查詢', '115 年 9 月 7 日(星期一)14：00', '請於甄試專區查詢'],
        ['測驗日期', '115 年 9 月 12 日(星期六)下午', '僅設臺北(雙北)考區'],
        ['試題及選擇題\n解答公告', '115 年 9 月 14 日(星期一)14：00', '請於甄試專區查詢。'],
        ['試題疑義申請', '115 年 9 月 14 日(星期一)14：00\n至\n115 年 9 月 15 日(星期二)17：00', '請於甄試專區申請'],
        ['測驗結果查詢', '115 年 10 月 7 日(星期三)14：00', '請於甄試專區查詢'],
        ['複查結果查詢', '115 年 10 月 16 日(星期五)14：00', '請至甄試專區查詢'],
        ['第\n二\n試\n：\n口\n試\n/\n體\n能\n測\n驗', '測驗入場通知書\n查詢', '115 年 10 月 8 日(星期四)14：00', '請於甄試專區查詢'],
        ['測驗日期', '115 年 10 月 18 日(星期日)', '僅設臺北(雙北)考區'],
        ['錄取名單公告', '115 年 10 月 27 日(星期二)14：00', '請於甄試專區查詢'],
      ],
    ];
    const ev = parseSchedulePdfData({
      tables,
      text: '',
      title: '臺灣銀行115年新進工員甄試',
      url: 'https://svc.tabf.org.tw/115bot04/',
      slug: '115bot04',
    });
    expect(ev).toEqual({
      externalKey: 'tabf:115bot04',
      org: '臺灣銀行115年新進工員甄試',
      signupStart: '2026-08-06 10:00',
      signupEnd: '2026-08-26 17:00',
      writtenExam: '2026-09-12',
      answerKey: '2026-09-14 14:00',
      writtenResult: '2026-10-07 14:00',
      interview: '2026-10-18',
      interview2: '',
      finalResult: '2026-10-27 14:00',
      link: 'https://svc.tabf.org.tw/115bot04/',
      note: '',
    });
  });

  it('parses dual-track exam with separate signup deadlines and split time cells (115tcbbank04 pattern)', () => {
    const tables = [
      [
        ['試別', '要項', '時間', '備註'],
        ['甄才類別', '書面審查類別', '筆試測驗類別'],
        [
          '第\n一\n試\n：\n書\n面\n審\n查\n/\n筆\n試',
          '報名期間',
          '115年11月5日(星期四)\n10：00\n至\n115年12月2日(星期三)\n17：00',
          '115 年 11 月 5 日(星期四)\n10：00\n至\n115 年 11 月 18 日(星期三)\n17：00',
          '1.一律採網路報名',
        ],
        ['測驗日期', '-', '115 年 12 月 5 日(星期六)', '設台北(雙北)考區。'],
        ['試題與選擇題\n解答公告', '-', '115 年 12 月 7 日(星期一)\n14：00', '請至甄試專區查詢。'],
        ['書面審查暨筆試\n測驗結果查詢', '116 年 1 月 4 日(星期一)', '10：00', '甄試專區公告開放查詢'],
        ['第\n二\n試\n：\n口\n試', '測驗日期', '116 年 1 月 9 日(星期六)', '1.書面審查類別'],
        ['網路查詢\n甄試結果通知書', '116 年 1 月 18 日(星期一)14：00', '請至甄試專區查詢'],
      ],
    ];
    const ev = parseSchedulePdfData({
      tables,
      text: '',
      title: '合作金庫商業銀行116年新進人員甄試',
      url: 'https://svc.tabf.org.tw/115tcbbank04/',
      slug: '115tcbbank04',
    });
    expect(ev.signupStart).toBe('2026-11-05 10:00');
    expect(ev.signupEnd).toBe('2026-12-02 17:00');
    expect(ev.writtenExam).toBe('2026-12-05');
    expect(ev.answerKey).toBe('2026-12-07 14:00');
    expect(ev.writtenResult).toBe('2027-01-04 10:00');
    expect(ev.interview).toBe('2027-01-09');
    expect(ev.finalResult).toBe('2027-01-18 14:00');
    expect(ev.note).toContain('書面審查類別報名至 2026-12-02 17:00');
    expect(ev.note).toContain('筆試測驗類別報名至 2026-11-18 17:00');
  });

  it('recovers spanning signup cells split across columns using getText() (115hncb05 & 115chb05 patterns)', () => {
    const tables = [
      [
        ['試別', '要項', '時間', '備註'],
        ['', '甄選類別', '類別A', '類別B', '1.一律採網路報名作業。'],
        ['第\n一\n階\n段\n：\n書\n面\n審\n查', '報名期間', '115年 9 月 7 日(\n至\n115年 10 月 5 日(', '星期一)10：00星期一)17：00'],
        ['書面審查\n結果查詢', '115年 10 月 23 日', '(星期五)14：00', '請至甄選專區查詢'],
        ['第\n二\n階\n段\n：\n口\n試', '口試日期', '115年 11月 1', '日(星期日)', '1.僅設台北(雙北)考區。'],
        ['甄選結果查詢與\n口試成績公告', '115年 11月 9 日', '(星期一)14:00', '請至甄選專區查詢結果。'],
        ['第\n三\n階\n段\n：\n口\n試\n(複\n試)', '口試(複試)相關文件\n與應注意事項查詢', '-', '約三週內通知複試', '以 e-mail 通知'],
      ],
    ];
    const text = `
報名期間
115年 9 月 7 日(星期一)10：00
至
115年 10 月 5 日(星期一)17：00
書面審查結果查詢 115年 10 月 23 日(星期五)14：00
    `;
    const ev = parseSchedulePdfData({
      tables,
      text,
      title: '彰化銀行115年經驗行員暨專業人員甄選',
      url: 'https://svc.tabf.org.tw/115chb05/',
      slug: '115chb05',
    });
    expect(ev.signupStart).toBe('2026-09-07 10:00');
    expect(ev.signupEnd).toBe('2026-10-05 17:00');
    expect(ev.writtenExam).toBe('');
    // Pure 書面審查 should not populate 筆試放榜 (writtenResult), goes to note instead.
    expect(ev.writtenResult).toBe('');
    expect(ev.interview).toBe('2026-11-01');
    expect(ev.finalResult).toBe('2026-11-09 14:00');
    expect(ev.note).toContain('書面審查結果查詢：2026-10-23 14:00');
    expect(ev.note).toContain('約三週內通知複試');
  });

  it('handles review-only exam with individually notified interview/final result (115megabank04 pattern)', () => {
    const tables = [
      [
        ['試別', '要 項', '時 間', '備 註'],
        ['第\n一\n試\n：\n書\n面\n審\n查', '報名期間', '115年 10 月 8 日(星期四)10：00\n至\n115年 12 月 23 日(星期三)17：00', '1.一律採網路報名'],
        ['書面審查結果', '115年 12 月下旬起', '通過書面審查者，將由兆豐銀行個別通知面試時間。'],
        ['第\n二\n試\n：\n面\n試', '面試日期及通知', '面試日期由兆豐銀行個別通知', '1.地點：兆豐銀行總行。'],
        ['甄選結果查詢', '錄取結果預定於 116年 1 月上旬起，由\n兆豐銀行個別通知。', '錄取人員將由兆豐銀行個別通知'],
      ],
    ];
    const ev = parseSchedulePdfData({
      tables,
      text: '',
      title: '兆豐銀行115年第二次理財專員甄選',
      url: 'https://svc.tabf.org.tw/115megabank04/',
      slug: '115megabank04',
    });
    expect(ev.signupStart).toBe('2026-10-08 10:00');
    expect(ev.signupEnd).toBe('2026-12-23 17:00');
    expect(ev.writtenExam).toBe('');
    expect(ev.interview).toBe('');
    expect(ev.finalResult).toBe('');
    expect(ev.note).toContain('115年 12 月下旬起');
    expect(ev.note).toContain('面試日期由兆豐銀行個別通知');
    expect(hasAnyCalendarDate(ev)).toBe(true);
  });
});
