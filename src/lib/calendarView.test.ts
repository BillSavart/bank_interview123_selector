import { describe, expect, it } from 'vitest';
import type { CalendarEvent, CalendarScheduleItem } from './calendar';
import { filterByBanks, listBanks, monthAgenda, orgBank, upcomingDeadlines, upcomingExams } from './calendarView';

const item = (kind: CalendarScheduleItem['kind'], start: string, end = '', label = '', period = ''): CalendarScheduleItem => ({
  kind,
  label,
  start,
  end,
  period,
});

const event = (id: string, org: string, scheduleDetails: CalendarScheduleItem[]): CalendarEvent => ({
  id,
  org,
  signupStart: '',
  signupEnd: '',
  writtenExam: '',
  answerKey: '',
  writtenResult: '',
  interview: '',
  interview2: '',
  finalResult: '',
  link: '',
  note: '',
  scheduleDetails,
});

// 2026-11-24（二）中午
const NOW = new Date(2026, 10, 24, 12, 0);

const huanan = event('hn', '華南銀行116年度新進人員甄試', [
  item('signup', '2026-10-22 17:00', '2026-11-25 17:00'),
  item('upload', '2026-11-27 17:00', '', '文件上傳截止'),
  item('written', '2026-12-19'),
  item('interview', '2027-01-17'),
]);
const fisc = event('fisc', '財金資訊股份有限公司115年第3次新進人員甄試', [
  item('signup', '2026-10-29 10:00', '2026-11-18 17:00'),
  item('written', '2026-12-05', '', '', '上午'),
  item('interview', '2027-01-07'),
  item('interview', '2027-01-08'),
]);
const tcb = event('tcb', '合作金庫商業銀行116年新進人員甄試', [
  item('signup', '2026-11-05 10:00', '2026-12-02 17:00', '書審類報名'),
  item('signup', '2026-11-05 10:00', '2026-11-18 17:00', '筆試類報名'),
  item('written', '2026-12-05'),
]);
const todayClosed = event('closed', '第一銀行115年第二次新進人員甄選', [item('signup', '2026-11-01 10:00', '2026-11-24 10:00')]);
const legacy: CalendarEvent = { ...event('legacy', '臺灣中小企業銀行115年度甄試', []), signupStart: '2026-11-20', signupEnd: '2026-11-24', interview: '2026-11-29' };
delete legacy.scheduleDetails;

describe('orgBank', () => {
  it('把招考名稱對應到簡短機構名', () => {
    expect(orgBank('臺灣銀行115年第2次新進人員甄試')).toBe('臺灣銀行');
    expect(orgBank('台灣銀行115年新進工員甄試')).toBe('臺灣銀行');
    expect(orgBank('臺灣中小企業銀行115年度第二次新進人員甄試')).toBe('臺灣企銀');
    expect(orgBank('臺灣土地銀行115年甄試')).toBe('土地銀行');
    expect(orgBank('合作金庫商業銀行116年新進人員甄試')).toBe('合作金庫');
    expect(orgBank('兆豐銀行115年第二次理財專員甄選')).toBe('兆豐銀行');
    expect(orgBank('財金資訊股份有限公司115年第3次資訊專業人員甄試')).toBe('財金公司');
  });

  it('未知機構取年份前的名稱', () => {
    expect(orgBank('某某產物保險115年甄試')).toBe('某某產物保險');
    expect(orgBank('沒有年份的招考')).toBe('沒有年份的招考');
  });

  it('八大行庫排前面，其他接在後面', () => {
    expect(listBanks([fisc, huanan, tcb, legacy])).toEqual(['合作金庫', '華南銀行', '臺灣企銀', '財金公司']);
  });

  it('空集合代表全部', () => {
    expect(filterByBanks([huanan, fisc], new Set())).toHaveLength(2);
    expect(filterByBanks([huanan, fisc], new Set(['財金公司']))).toEqual([fisc]);
  });
});

describe('upcomingDeadlines', () => {
  it('列出 7 天內未過期的報名與上傳截止，依時間排序', () => {
    const list = upcomingDeadlines([huanan, fisc, tcb, todayClosed, legacy], NOW);
    expect(list.map((d) => [d.event.id, d.label, d.daysLeft, d.time])).toEqual([
      ['legacy', '報名截止', 0, ''],
      ['hn', '報名截止', 1, '17:00'],
      ['hn', '文件上傳截止', 3, '17:00'],
    ]);
  });

  it('今天稍早已截止的不列；超過 7 天的不列', () => {
    const ids = upcomingDeadlines([todayClosed, tcb], NOW).map((d) => d.event.id);
    expect(ids).toEqual([]);
    expect(upcomingDeadlines([tcb], NOW, 8).map((d) => d.label)).toEqual(['書審類報名截止']);
  });
});

describe('upcomingExams', () => {
  it('列出 30 天內的筆試／面試，同階段多天只列第一天', () => {
    const list = upcomingExams([huanan, fisc, tcb, legacy], NOW);
    expect(list.map((d) => [d.event.id, d.label, d.daysLeft])).toEqual([
      ['legacy', '面試', 5],
      ['tcb', '筆試', 11],
      ['fisc', '筆試', 11],
      ['hn', '筆試', 25],
    ]);
  });

  it('記錄多天場次數', () => {
    const list = upcomingExams([fisc], NOW, 60);
    const interview = list.find((d) => d.label === '面試');
    expect(interview?.sessions).toBe(2);
    expect(interview?.date).toEqual(new Date(2027, 0, 7));
  });

  it('跨日項目進行中時倒數為 0', () => {
    const ongoing = event('ot', '華南銀行115年度第三次菁英人才甄選', [item('onlineTest', '2026-11-23 14:00', '2026-11-25 17:00', '線上測驗')]);
    expect(upcomingExams([ongoing], NOW).map((d) => d.daysLeft)).toEqual([0]);
  });
});

describe('monthAgenda', () => {
  it('報名期間拆成開始與截止，依日期分組', () => {
    const days = monthAgenda([huanan, fisc, tcb], 2026, 10);
    const flat = days.map((day) => [day.date.getDate(), day.entries.map((e) => `${e.event.id}:${e.label}:${e.when}`)]);
    expect(flat).toEqual([
      [5, ['tcb:書審類報名開始:10:00', 'tcb:筆試類報名開始:10:00']],
      // 同一天依時間、再依機構名筆畫排序（合 < 財）。
      [18, ['tcb:筆試類報名截止:17:00', 'fisc:報名截止:17:00']],
      [25, ['hn:報名截止:17:00']],
      [27, ['hn:文件上傳截止:17:00']],
    ]);
  });

  it('時段與跨日範圍寫進 when', () => {
    const ranged = event('ot', '華南銀行115年度第三次菁英人才甄選', [item('onlineTest', '2026-12-14 14:00', '2026-12-15 17:00', '線上測驗')]);
    const days = monthAgenda([fisc, ranged], 2026, 11);
    expect(days.map((day) => day.entries.map((e) => `${e.label}:${e.when}`))).toEqual([['筆試:上午'], ['線上測驗:14:00 ～ 12/15 17:00']]);
  });

  it('舊格式（沒有 scheduleDetails）也能產生清單', () => {
    const days = monthAgenda([legacy], 2026, 10);
    expect(days.map((day) => [day.date.getDate(), day.entries.map((e) => e.label)])).toEqual([
      [20, ['報名開始']],
      [24, ['報名截止']],
      [29, ['面試']],
    ]);
  });
});
