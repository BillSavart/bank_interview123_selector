// 招考行事曆前端的日期運算：把事件攤成時程項目、倒數看板、月份清單與銀行篩選。
// 全部是純函式（傳入 now），方便測試。日期一律以瀏覽器本地時間的「日」為單位。
import { CALENDAR_KIND_LABEL, type CalendarEvent, type CalendarScheduleItem, type CalendarScheduleKind } from './calendar';

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_MS = 86_400_000;

// Date fields used for records saved without a detailed timeline.
const SINGLE_DAY = [
  { field: 'writtenExam', kind: 'written' },
  { field: 'answerKey', kind: 'answerKey' },
  { field: 'writtenResult', kind: 'writtenResult' },
  { field: 'interview', kind: 'interview' },
  { field: 'interview2', kind: 'interview2' },
  { field: 'finalResult', kind: 'final' },
] as const;

export function getSchedule(event: CalendarEvent): CalendarScheduleItem[] {
  const items = [...(event.scheduleDetails || [])];
  const kinds = new Set(items.map(({ kind }) => kind));
  if (!kinds.has('signup') && (event.signupStart || event.signupEnd)) {
    items.push({ kind: 'signup', label: '', start: event.signupStart, end: event.signupEnd, period: '' });
  }
  for (const { field, kind } of SINGLE_DAY) {
    if (!kinds.has(kind) && event[field]) {
      items.push({ kind, label: '', start: event[field], end: '', period: '' });
    }
  }
  return items.sort((a, b) => (a.start || a.end).localeCompare(b.start || b.end));
}

// Parse a date that may carry a trailing time ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM')
// to a local-midnight Date, or null when empty/invalid.
export function parseYMD(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 取出 'YYYY-MM-DD HH:MM' 的時間部分；沒有時間回傳空字串。 */
export function timeOf(s: string): string {
  return s.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/)?.[1] ?? '';
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);

/** 例：11/25（三） */
export const formatMonthDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;

export const itemLabel = (item: CalendarScheduleItem) => item.label || CALENDAR_KIND_LABEL[item.kind];

// --- 銀行篩選 -----------------------------------------------------------------

// 招考名稱 → 簡短機構名，與筆試門檻頁的行庫名稱一致。
const BANK_ALIASES: Array<[RegExp, string]> = [
  [/^(臺灣|台灣)銀行/, '臺灣銀行'],
  [/^((臺灣|台灣)?土地銀行|土銀)/, '土地銀行'],
  [/^合作金庫/, '合作金庫'],
  [/^第一(商業)?銀行/, '第一銀行'],
  [/^華南(商業)?銀行/, '華南銀行'],
  [/^彰化(商業)?銀行/, '彰化銀行'],
  [/^兆豐(國際商業)?銀行/, '兆豐銀行'],
  [/^((臺灣|台灣)中小企業銀行|(臺|台)企銀|(臺灣|台灣)企銀)/, '臺灣企銀'],
  [/^(全國)?農業金庫/, '農業金庫'],
  [/^中央銀行/, '中央銀行'],
  [/^財金資訊/, '財金公司'],
  [/^中華郵政/, '中華郵政'],
];

/** 公股八大行庫優先排前面，其他機構依筆畫排序接在後面。 */
export const BANK_ORDER = ['臺灣銀行', '土地銀行', '合作金庫', '第一銀行', '華南銀行', '彰化銀行', '兆豐銀行', '臺灣企銀'];

export function orgBank(org: string): string {
  const name = org.trim();
  for (const [pattern, bank] of BANK_ALIASES) {
    if (pattern.test(name)) return bank;
  }
  // Unknown org: keep the part before the year, e.g. 「某某公司115年…」→「某某公司」.
  return name.replace(/\s*(民國)?\d.*$/, '').trim() || name;
}

export function listBanks(events: CalendarEvent[]): string[] {
  const banks = Array.from(new Set(events.map((event) => orgBank(event.org))));
  const rank = (bank: string) => {
    const index = BANK_ORDER.indexOf(bank);
    return index === -1 ? BANK_ORDER.length : index;
  };
  return banks.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant'));
}

/** 空集合代表「全部」。 */
export const filterByBanks = (events: CalendarEvent[], banks: ReadonlySet<string>) =>
  banks.size === 0 ? events : events.filter((event) => banks.has(orgBank(event.org)));

// --- 倒數看板 -----------------------------------------------------------------

export interface CountdownItem {
  event: CalendarEvent;
  item: CalendarScheduleItem;
  label: string;
  /** 這個節點的日期（截止日或考試日）。 */
  date: Date;
  /** 'HH:MM'，沒有則為空字串。 */
  time: string;
  /** 距今天幾天（0 = 今天）。 */
  daysLeft: number;
  /** 同一招考同一階段還有幾天場次（含這一天）。 */
  sessions: number;
}

const DEADLINE_KINDS: ReadonlySet<CalendarScheduleKind> = new Set(['signup', 'upload']);
const EXAM_KINDS: ReadonlySet<CalendarScheduleKind> = new Set(['written', 'onlineTest', 'interview', 'interview2']);

const byDate = (a: CountdownItem, b: CountdownItem) =>
  a.date.getTime() - b.date.getTime() || a.time.localeCompare(b.time) || a.event.org.localeCompare(b.event.org, 'zh-Hant');

/** N 天內（含今天）的報名截止與文件上傳截止；已過截止時間的不列。 */
export function upcomingDeadlines(events: CalendarEvent[], now: Date, withinDays = 7): CountdownItem[] {
  const result: CountdownItem[] = [];
  for (const event of events) {
    for (const item of getSchedule(event)) {
      if (!DEADLINE_KINDS.has(item.kind)) continue;
      // 報名看截止日；文件上傳截止本身就是單一時間點。
      const raw = item.kind === 'signup' ? item.end : item.start || item.end;
      const date = parseYMD(raw);
      if (!date) continue;
      const time = timeOf(raw);
      const [hh, mm] = time ? time.split(':').map(Number) : [23, 59];
      const deadline = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, 59);
      const daysLeft = dayDiff(date, now);
      if (deadline < now || daysLeft > withinDays) continue;
      const base = itemLabel(item);
      const label = item.kind === 'signup' ? `${base}截止` : base;
      result.push({ event, item, label, date, time, daysLeft, sessions: 1 });
    }
  }
  return result.sort(byDate);
}

/** N 天內的筆試、線上測驗與面試。同一招考同一階段有多天場次時只列第一天並記錄場次數。 */
export function upcomingExams(events: CalendarEvent[], now: Date, withinDays = 30): CountdownItem[] {
  const groups = new Map<string, CountdownItem>();
  for (const event of events) {
    for (const item of getSchedule(event)) {
      if (!EXAM_KINDS.has(item.kind)) continue;
      const start = parseYMD(item.start || item.end);
      if (!start) continue;
      const end = parseYMD(item.end) || start;
      if (dayDiff(end, now) < 0) continue;
      const daysLeft = Math.max(0, dayDiff(start, now));
      if (daysLeft > withinDays) continue;
      const label = itemLabel(item);
      const key = `${event.id}|${item.kind}|${label}`;
      const existing = groups.get(key);
      if (existing) {
        existing.sessions += 1;
        if (start < existing.date) Object.assign(existing, { item, date: start, time: timeOf(item.start), daysLeft });
        continue;
      }
      groups.set(key, { event, item, label, date: start, time: timeOf(item.start), daysLeft, sessions: 1 });
    }
  }
  return [...groups.values()].sort(byDate);
}

// --- 月份清單 -----------------------------------------------------------------

export interface AgendaEntry {
  event: CalendarEvent;
  item: CalendarScheduleItem;
  kind: CalendarScheduleKind;
  label: string;
  date: Date;
  /** 顯示用時間：'17:00'、'下午'，或跨日項目的結束時間說明。 */
  when: string;
}

export interface AgendaDay {
  date: Date;
  entries: AgendaEntry[];
}

/** 指定月份（month 為 0-based）的逐日清單。報名期間拆成「開始」「截止」兩筆。 */
export function monthAgenda(events: CalendarEvent[], year: number, month: number): AgendaDay[] {
  const entries: AgendaEntry[] = [];
  const push = (event: CalendarEvent, item: CalendarScheduleItem, label: string, raw: string, when: string) => {
    const date = parseYMD(raw);
    if (date && date.getFullYear() === year && date.getMonth() === month) {
      entries.push({ event, item, kind: item.kind, label, date, when });
    }
  };

  for (const event of events) {
    for (const item of getSchedule(event)) {
      const label = itemLabel(item);
      const start = parseYMD(item.start);
      const end = parseYMD(item.end);
      if (item.kind === 'signup' && start && end && !sameDay(start, end)) {
        push(event, item, `${label}開始`, item.start, timeOf(item.start));
        push(event, item, `${label}截止`, item.end, timeOf(item.end));
        continue;
      }
      const raw = item.start || item.end;
      let when = timeOf(raw) || item.period;
      if (start && end && !sameDay(start, end)) {
        const endTime = timeOf(item.end);
        when = `${when ? `${when} ` : ''}～ ${end.getMonth() + 1}/${end.getDate()}${endTime ? ` ${endTime}` : ''}`;
      }
      push(event, item, item.kind === 'signup' && !start ? `${label}截止` : label, raw, when);
    }
  }

  const days = new Map<number, AgendaDay>();
  for (const entry of entries) {
    const key = entry.date.getTime();
    if (!days.has(key)) days.set(key, { date: entry.date, entries: [] });
    days.get(key)!.entries.push(entry);
  }
  for (const day of days.values()) {
    day.entries.sort((a, b) => a.when.localeCompare(b.when) || a.event.org.localeCompare(b.event.org, 'zh-Hant'));
  }
  return [...days.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
