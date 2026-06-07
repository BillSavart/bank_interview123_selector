import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { fetchCalendar, type CalendarEvent } from '../lib/calendar';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_MS = 86_400_000;

// All segment kinds drawable on the calendar, with their short label and colour.
type SegKind = 'signup' | 'written' | 'answerKey' | 'writtenResult' | 'interview' | 'interview2' | 'final';

const KIND_LABEL: Record<SegKind, string> = {
  signup: '報名',
  written: '筆試',
  answerKey: '試題解答',
  writtenResult: '筆試放榜',
  interview: '面試',
  interview2: '二面',
  final: '放榜',
};

// Single-day markers, in display order, mapped to the event field they read.
const SINGLE_DAY: Array<{ field: keyof CalendarEvent; kind: SegKind }> = [
  { field: 'writtenExam', kind: 'written' },
  { field: 'answerKey', kind: 'answerKey' },
  { field: 'writtenResult', kind: 'writtenResult' },
  { field: 'interview', kind: 'interview' },
  { field: 'interview2', kind: 'interview2' },
  { field: 'finalResult', kind: 'final' },
];

// Parse a date that may carry a trailing time ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM')
// to a local-midnight Date, or null when empty/invalid.
function parseYMD(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY_MS);

interface Segment {
  event: CalendarEvent;
  kind: SegKind;
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
    const ss = parseYMD(ev.signupStart);
    const se = parseYMD(ev.signupEnd);
    if (ss || se) {
      const start = (ss || se) as Date;
      let end = (se || ss) as Date;
      if (end < start) end = start;
      segs.push({ event: ev, kind: 'signup', start, end });
    }
    for (const { field, kind } of SINGLE_DAY) {
      const d = parseYMD(ev[field] as string);
      if (d) segs.push({ event: ev, kind, start: d, end: d });
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

  useEffect(() => {
    fetchCalendar()
      .then((list) => {
        setEvents(list);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  const segments = useMemo(() => buildSegments(events), [events]);

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

      <div className="cal-toolbar">
        <h1 className="cal-month-title">
          {view.getFullYear()} 年 {view.getMonth() + 1} 月
        </h1>
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

      {state === 'loading' && <p className="calendar-empty">載入中…</p>}
      {state === 'error' && <p className="calendar-empty">行事曆載入失敗，請稍後再試。</p>}

      {state !== 'loading' && (
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
                    const ev = b.seg.event;
                    const label = `${KIND_LABEL[b.seg.kind]} ${ev.org}`;
                    return (
                      <button
                        key={bi}
                        type="button"
                        className={`cal-bar is-${b.seg.kind}`}
                        style={{
                          left: `calc(${(b.startCol / 7) * 100}% + 2px)`,
                          width: `calc(${(b.span / 7) * 100}% - 4px)`,
                          top: 28 + b.lane * 22,
                        }}
                        title={label}
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

// Make sure a user-entered link is treated as an external URL even if they
// forgot the scheme (e.g. "bot.com.tw" → "https://bot.com.tw").
const externalHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const fmtRange = (start: string, end: string) => {
  if (start && end) return `${start} ～ ${end}`;
  if (start) return `${start} 起`;
  if (end) return `截止 ${end}`;
  return '—';
};

function EventModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  // Only show rows the admin actually filled in.
  const rows: Array<[string, string]> = [];
  if (event.signupStart || event.signupEnd) rows.push(['報名期間', fmtRange(event.signupStart, event.signupEnd)]);
  if (event.writtenExam) rows.push(['筆試日期', event.writtenExam]);
  if (event.answerKey) rows.push(['試題與解答公告', event.answerKey]);
  if (event.writtenResult) rows.push(['筆試結果公佈', event.writtenResult]);
  if (event.interview) rows.push(['面試', event.interview]);
  if (event.interview2) rows.push(['二面', event.interview2]);
  if (event.finalResult) rows.push(['放榜', event.finalResult]);
  return (
    <div className="cal-modal-backdrop" onClick={onClose} role="presentation">
      <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cal-modal-close" onClick={onClose} aria-label="關閉">
          <X size={18} />
        </button>
        <h2 className="cal-modal-org">{event.org}</h2>

        <dl className="cal-modal-rows">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {event.note && <p className="cal-modal-note">{event.note}</p>}

        {event.link && (
          <a className="calendar-card-link" href={externalHref(event.link)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} />
            查看簡章
          </a>
        )}
      </div>
    </div>
  );
}
