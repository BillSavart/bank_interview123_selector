import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlarmClock, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, List, PenLine, X } from 'lucide-react';
import {
  fetchCalendar,
  CALENDAR_KIND_LABEL,
  type CalendarEvent,
  type CalendarScheduleItem,
  type CalendarScheduleKind,
} from '../lib/calendar';
import {
  WEEKDAYS,
  dayDiff,
  filterByBanks,
  formatMonthDay,
  getSchedule,
  listBanks,
  monthAgenda,
  orgBank,
  parseYMD,
  sameDay,
  upcomingDeadlines,
  upcomingExams,
  type AgendaDay,
  type CountdownItem,
} from '../lib/calendarView';

const DETAIL_LABEL: Partial<Record<CalendarScheduleKind, string>> = {
  signup: '報名期間',
  written: '筆試日期',
  answerKey: '試題與解答公告',
  writtenResult: '筆試結果公佈',
};

const DEADLINE_DAYS = 7;
const EXAM_DAYS = 30;
const BOARD_LIMIT = 6;

// --- 檢視偏好（月曆／清單、銀行篩選）只存在這台裝置 --------------------------------

type CalendarViewMode = 'month' | 'list';

interface CalendarPrefs {
  view: CalendarViewMode;
  banks: string[];
}

const PREFS_KEY = 'bank-interview-calendar-prefs';

function loadPrefs(): CalendarPrefs {
  // Phones get the list by default: stacked bars in a 7-column grid are hard to read there.
  const fallbackView: CalendarViewMode = window.matchMedia?.('(max-width: 640px)').matches ? 'list' : 'month';
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') as Partial<CalendarPrefs> | null;
    return {
      view: raw?.view === 'month' || raw?.view === 'list' ? raw.view : fallbackView,
      banks: Array.isArray(raw?.banks) ? raw.banks.filter((bank): bank is string => typeof bank === 'string') : [],
    };
  } catch {
    return { view: fallbackView, banks: [] };
  }
}

function savePrefs(prefs: CalendarPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
}

// --- 月曆格線 -------------------------------------------------------------------

interface Segment {
  event: CalendarEvent;
  item: CalendarScheduleItem;
  start: Date;
  end: Date;
}

interface PlacedBar {
  seg: Segment;
  startCol: number; // 0–6
  span: number;
  lane: number;
}

function buildSegments(events: CalendarEvent[]): Segment[] {
  const segs: Segment[] = [];
  for (const ev of events) {
    for (const item of getSchedule(ev)) {
      const start = parseYMD(item.start || item.end);
      if (!start) continue;
      const end = parseYMD(item.end) || start;
      segs.push({ event: ev, item, start, end: end < start ? start : end });
    }
  }
  return segs;
}

// Greedy lane assignment so overlapping bars in a week stack instead of collide.
function layoutWeek(segments: Segment[], weekStart: Date, weekEnd: Date): PlacedBar[] {
  const items: PlacedBar[] = [];
  for (const seg of segments) {
    if (seg.end < weekStart || seg.start > weekEnd) continue;
    const s = seg.start < weekStart ? weekStart : seg.start;
    const e = seg.end > weekEnd ? weekEnd : seg.end;
    const startCol = dayDiff(s, weekStart);
    const span = dayDiff(e, weekStart) - startCol + 1;
    items.push({ seg, startCol, span, lane: 0 });
  }
  items.sort((a, b) => a.startCol - b.startCol || b.span - a.span);

  const lanes: Array<Array<{ start: number; end: number }>> = [];
  for (const it of items) {
    const end = it.startCol + it.span - 1;
    let lane = 0;
    while ((lanes[lane] || []).some((r) => !(end < r.start || it.startCol > r.end))) lane++;
    (lanes[lane] ||= []).push({ start: it.startCol, end });
    it.lane = lane;
  }
  return items;
}

export function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [view, setView] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [prefs, setPrefs] = useState<CalendarPrefs>(loadPrefs);

  useEffect(() => {
    fetchCalendar()
      .then((list) => {
        setEvents(list);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const banks = useMemo(() => listBanks(events), [events]);
  // Ignore saved banks that no longer have any recruitment, so a stale filter never hides everything.
  const selectedBanks = useMemo(() => new Set(prefs.banks.filter((bank) => banks.includes(bank))), [prefs.banks, banks]);
  const visibleEvents = useMemo(() => filterByBanks(events, selectedBanks), [events, selectedBanks]);
  const segments = useMemo(() => buildSegments(visibleEvents), [visibleEvents]);

  const toggleBank = (bank: string) =>
    setPrefs((current) => {
      const active = current.banks.filter((name) => banks.includes(name));
      return {
        ...current,
        banks: active.includes(bank) ? active.filter((name) => name !== bank) : [...active, bank],
      };
    });
  const clearBanks = () => setPrefs((current) => ({ ...current, banks: [] }));
  const setMode = (mode: CalendarViewMode) => setPrefs((current) => ({ ...current, view: mode }));

  // 42-cell grid (6 weeks) starting from the Sunday on/before the 1st.
  const weeks = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    const all: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      all.push(d);
    }
    const rows: Date[][] = [];
    for (let w = 0; w < 6; w++) rows.push(all.slice(w * 7, w * 7 + 7));
    return rows;
  }, [view]);

  const today = new Date();
  const deadlines = upcomingDeadlines(visibleEvents, today, DEADLINE_DAYS);
  const exams = upcomingExams(visibleEvents, today, EXAM_DAYS);
  const agenda = monthAgenda(visibleEvents, view.getFullYear(), view.getMonth());

  // Only the window 上個月 ~ 下下下個月 (−1 ~ +3) is browsable; data outside it is
  // discarded on the server to save disk, so navigating further would show nothing.
  const baseMonth = today.getFullYear() * 12 + today.getMonth();
  const viewMonth = view.getFullYear() * 12 + view.getMonth();
  const canPrev = viewMonth > baseMonth - 1;
  const canNext = viewMonth < baseMonth + 3;
  const goMonth = (delta: number) => {
    const target = viewMonth + delta;
    if (target < baseMonth - 1 || target > baseMonth + 3) return;
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  };
  const goToday = () => setView(new Date(today.getFullYear(), today.getMonth(), 1));

  return (
    <div className="container py-4 calendar-page">
      <div className="interview-kicker">
        <CalendarDays size={18} />
        招考行事曆
      </div>

      {state === 'ready' && banks.length > 1 && (
        <div className="cal-filter" role="group" aria-label="依招考機構篩選">
          <span className="cal-filter-label">篩選機構</span>
          <button type="button" className={selectedBanks.size === 0 ? 'is-active' : ''} aria-pressed={selectedBanks.size === 0} onClick={clearBanks}>
            全部
          </button>
          {banks.map((bank) => (
            <button
              key={bank}
              type="button"
              className={selectedBanks.has(bank) ? 'is-active' : ''}
              aria-pressed={selectedBanks.has(bank)}
              onClick={() => toggleBank(bank)}
            >
              {bank}
            </button>
          ))}
        </div>
      )}

      {state === 'ready' && events.length > 0 && (
        <section className="cal-board" aria-label="近期倒數">
          <CountdownColumn
            icon={<AlarmClock size={17} />}
            title={`${DEADLINE_DAYS} 天內報名截止`}
            empty={`${DEADLINE_DAYS} 天內沒有報名截止。`}
            items={deadlines}
            isDeadline
            onSelect={setSelected}
          />
          <CountdownColumn
            icon={<PenLine size={17} />}
            title="近期筆試／面試"
            empty={`${EXAM_DAYS} 天內沒有筆試或面試。`}
            items={exams}
            onSelect={setSelected}
          />
        </section>
      )}

      <div className="cal-toolbar">
        <h1 className="cal-month-title">
          {view.getFullYear()} 年 {view.getMonth() + 1} 月
        </h1>
        <div className="cal-toolbar-actions">
          <div className="cal-view-toggle" role="group" aria-label="檢視方式">
            <button type="button" className={prefs.view === 'month' ? 'is-active' : ''} aria-pressed={prefs.view === 'month'} onClick={() => setMode('month')}>
              <CalendarDays size={16} />
              月曆
            </button>
            <button type="button" className={prefs.view === 'list' ? 'is-active' : ''} aria-pressed={prefs.view === 'list'} onClick={() => setMode('list')}>
              <List size={16} />
              清單
            </button>
          </div>
          <div className="cal-nav">
            <button
              type="button"
              className="cal-nav-btn"
              onClick={() => goMonth(-1)}
              disabled={!canPrev}
              aria-label="上個月"
            >
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="cal-today-btn" onClick={goToday}>
              今天
            </button>
            <button
              type="button"
              className="cal-nav-btn"
              onClick={() => goMonth(1)}
              disabled={!canNext}
              aria-label="下個月"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {state === 'loading' && <p className="calendar-empty">載入中…</p>}
      {state === 'error' && <p className="calendar-empty">行事曆載入失敗，請稍後再試。</p>}

      {state !== 'loading' && prefs.view === 'list' && events.length > 0 && (
        <AgendaList key={viewMonth} days={agenda} today={today} onSelect={setSelected} />
      )}

      {state !== 'loading' && prefs.view === 'month' && (
        <div className="cal-grid">
          <div className="cal-weekday-row">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-weekday">
                {w}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => {
            const bars = layoutWeek(segments, week[0], week[6]);
            const laneCount = bars.reduce((m, b) => Math.max(m, b.lane + 1), 0);
            // Keep cells tall like a real month calendar, and grow with stacked bars.
            const minHeight = Math.max(104, 34 + laneCount * 22);
            return (
              <div key={wi} className="cal-week" style={{ minHeight }}>
                <div className="cal-week-days">
                  {week.map((d) => {
                    const isOther = d.getMonth() !== view.getMonth();
                    const isToday = sameDay(d, today);
                    return (
                      <div key={d.toISOString()} className={`cal-day ${isOther ? 'is-other' : ''}`}>
                        <span className={`cal-day-num ${isToday ? 'is-today' : ''}`}>{d.getDate()}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="cal-week-bars">
                  {bars.map((b, bi) => {
                    const { event: ev, item } = b.seg;
                    const label = `${item.label || CALENDAR_KIND_LABEL[item.kind]} ${ev.org}`;
                    return (
                      <button
                        key={bi}
                        type="button"
                        className={`cal-bar is-${item.kind}`}
                        style={{
                          left: `calc(${(b.startCol / 7) * 100}% + 2px)`,
                          width: `calc(${(b.span / 7) * 100}% - 4px)`,
                          top: 28 + b.lane * 22,
                        }}
                        title={`${label}　${formatScheduleDate(item)}`}
                        onClick={() => setSelected(ev)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {state === 'ready' && events.length === 0 && (
        <p className="calendar-empty">目前還沒有招考資料，敬請期待。</p>
      )}

      {selected && <EventModal event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

interface CountdownColumnProps {
  icon: ReactNode;
  title: string;
  empty: string;
  items: CountdownItem[];
  isDeadline?: boolean;
  onSelect: (event: CalendarEvent) => void;
}

function CountdownColumn({ icon, title, empty, items, isDeadline = false, onSelect }: CountdownColumnProps) {
  const shown = items.slice(0, BOARD_LIMIT);
  return (
    <div className="cal-board-col">
      <h2 className="cal-board-title">
        {icon}
        {title}
        {items.length > 0 && <span className="cal-board-count">{items.length}</span>}
      </h2>
      {shown.length === 0 ? (
        <p className="cal-board-empty">{empty}</p>
      ) : (
        <ul className="cal-board-list">
          {shown.map((entry) => (
            <li key={`${entry.event.id}-${entry.item.kind}-${entry.label}-${entry.date.getTime()}`}>
              <CountdownCard entry={entry} isDeadline={isDeadline} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
      {items.length > shown.length && (
        <p className="cal-board-more">另有 {items.length - shown.length} 項，可在下方月曆或清單查看。</p>
      )}
    </div>
  );
}

function CountdownCard({
  entry,
  isDeadline,
  onSelect,
}: {
  entry: CountdownItem;
  isDeadline: boolean;
  onSelect: (event: CalendarEvent) => void;
}) {
  const { event, item, label, date, time, daysLeft, sessions } = entry;
  const urgent = isDeadline && daysLeft <= 1;
  const when = [formatMonthDay(date), time || item.period].filter(Boolean).join(' ');
  return (
    <button type="button" className={`cal-countdown ${urgent ? 'is-urgent' : ''}`} onClick={() => onSelect(event)}>
      <span className="cal-countdown-days">
        {daysLeft === 0 ? <strong>今天</strong> : daysLeft === 1 ? <strong>明天</strong> : (
          <>
            <small>{isDeadline ? '剩' : '還有'}</small>
            <strong>{daysLeft}</strong>
            <small>天</small>
          </>
        )}
      </span>
      <span className="cal-countdown-info">
        <span className="cal-countdown-head">
          <span className={`cal-kind is-${item.kind}`}>{label}</span>
          <span className="cal-countdown-bank">{orgBank(event.org)}</span>
        </span>
        <span className="cal-countdown-org">{event.org}</span>
        <span className="cal-countdown-date">
          {when}
          {isDeadline ? ' 截止' : sessions > 1 ? ` 起，共 ${sessions} 天` : ''}
        </span>
      </span>
    </button>
  );
}

function AgendaList({ days, today, onSelect }: { days: AgendaDay[]; today: Date; onSelect: (event: CalendarEvent) => void }) {
  const [showPast, setShowPast] = useState(false);
  if (days.length === 0) return <p className="calendar-empty">這個月沒有符合篩選的招考時程。</p>;

  // In the current month, fold the days already gone so the list opens on what's next.
  // A month that is entirely past (上個月) is shown in full.
  const pastCount = days.filter((day) => dayDiff(day.date, today) < 0).length;
  const canFold = pastCount > 0 && pastCount < days.length;
  const shown = canFold && !showPast ? days.slice(pastCount) : days;

  return (
    <div className="cal-agenda">
      {canFold && (
        <button type="button" className="cal-agenda-toggle" aria-expanded={showPast} onClick={() => setShowPast((value) => !value)}>
          {showPast ? '收合本月已過的日期' : `顯示本月已過的 ${pastCount} 天`}
        </button>
      )}
      <ol className="cal-agenda-days">
        {shown.map((day) => {
          const diff = dayDiff(day.date, today);
          return (
            <li key={day.date.getTime()} className={`cal-agenda-day ${diff < 0 ? 'is-past' : ''} ${diff === 0 ? 'is-today' : ''}`}>
              <div className="cal-agenda-date">
                <strong>
                  {day.date.getMonth() + 1}/{day.date.getDate()}
                </strong>
                <span>週{WEEKDAYS[day.date.getDay()]}</span>
                {diff === 0 && <em>今天</em>}
              </div>
              <ul className="cal-agenda-entries">
                {day.entries.map((entry, index) => (
                  <li key={`${entry.event.id}-${index}`}>
                    <button type="button" className="cal-agenda-entry" onClick={() => onSelect(entry.event)}>
                      <span className={`cal-kind is-${entry.kind}`}>{entry.label}</span>
                      <span className="cal-agenda-org">{entry.event.org}</span>
                      {entry.when && <span className="cal-agenda-when">{entry.when}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Make sure a user-entered link is treated as an external URL even if they
// forgot the scheme (e.g. "bot.com.tw" → "https://bot.com.tw").
const externalHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const fmtRange = (start: string, end: string) => {
  if (start && end) return `${start} ～ ${end}`;
  if (start) return `${start} 起`;
  if (end) return `截止 ${end}`;
  return '—';
};

const formatScheduleDate = ({ kind, start, end, period }: CalendarScheduleItem) => {
  if (kind === 'signup' || end) return fmtRange(start, end);
  return period ? `${start} ${period}` : start;
};

function EventModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const rows = new Map<string, string[]>();
  for (const item of getSchedule(event)) {
    const label = item.label || DETAIL_LABEL[item.kind] || CALENDAR_KIND_LABEL[item.kind];
    const values = rows.get(label) || [];
    values.push(formatScheduleDate(item));
    rows.set(label, values);
  }
  return (
    <div className="cal-modal-backdrop" onClick={onClose} role="presentation">
      <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cal-modal-close" onClick={onClose} aria-label="關閉">
          <X size={18} />
        </button>
        <h2 className="cal-modal-org">{event.org}</h2>

        <dl className="cal-modal-rows">
          {[...rows].map(([label, values]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{values.join('\n')}</dd>
            </div>
          ))}
        </dl>

        {event.note && <p className="cal-modal-note">{event.note}</p>}

        {event.link && (
          <a className="calendar-card-link" href={externalHref(event.link)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} />
            查看招考資料
          </a>
        )}
      </div>
    </div>
  );
}
