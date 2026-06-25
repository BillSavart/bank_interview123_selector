import { useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Info,
  MapPin,
  MessagesSquare,
  UserX,
} from 'lucide-react';
import { VENUE_REPORTS, type VenueReport, type VenueStage } from '../data/venues';
import { VenueMap } from '../components/VenueMap';

const STAGE_LABEL: Record<VenueStage, string> = { written: '筆試', interview: '面試' };

// 把日期顯示成「2026/06/13」。
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${y}/${m}/${d}` : iso;
}

export function VenuePage() {
  // 由新到舊排序，最新的招考排在最前面。
  const reports = useMemo(
    () => [...VENUE_REPORTS].sort((a, b) => b.date.localeCompare(a.date)),
    [],
  );

  // 依銀行分組（保留新到舊順序），選單以「銀行 → 各場次」兩層呈現，資料變多時可收合。
  const groups = useMemo(() => {
    const map = new Map<string, VenueReport[]>();
    for (const r of reports) {
      const list = map.get(r.bank) ?? [];
      list.push(r);
      map.set(r.bank, list);
    }
    return Array.from(map, ([bank, items]) => ({ bank, items }));
  }, [reports]);

  // 左側選單選到的那一場；'all' = 顯示全部。預設停在最新一場。
  const [selected, setSelected] = useState<string>(reports[0]?.id ?? 'all');
  // 預設只展開「目前選到那一場」所屬的銀行，其餘收合。
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    reports[0] ? { [reports[0].bank]: true } : {},
  );

  const visible = selected === 'all' ? reports : reports.filter((r) => r.id === selected);
  const toggle = (bank: string) => setExpanded((prev) => ({ ...prev, [bank]: !prev[bank] }));

  return (
    <div className="container py-4 venue-page">
      <div className="interview-kicker">
        <MapPin size={18} />
        試場資訊
      </div>
      <p className="venue-intro">
        各家銀行招考的試場資訊：<strong>筆試</strong>統計各試場缺考人數、<strong>面試</strong>彙整各試場考題。左側選單依銀行分組，之後有新資料會陸續新增。
      </p>

      <div className="venue-disclaimer">
        <Info size={16} />
        <p>
          這裡的面試題目來自考生回報，<strong>會因面試官、考生背景與當下情況而異，僅供準備方向參考</strong>，不代表你會被問到相同題目。缺考人數與各項數據同樣以考生回報為準，可能與官方公告有出入。
        </p>
      </div>

      <VenueMap />

      <div className="venue-layout">
        {/* 左側選單：銀行可收合，展開後列出各場次。新增資料會自動出現在這裡。 */}
        <aside className="venue-menu">
          <button
            type="button"
            className={`venue-menu-all ${selected === 'all' ? 'is-active' : ''}`}
            onClick={() => setSelected('all')}
          >
            <span>全部場次</span>
            <span className="venue-menu-count">{reports.length}</span>
          </button>

          {groups.map(({ bank, items }) => {
            const isOpen = expanded[bank] ?? false;
            return (
              <div key={bank} className="venue-menu-group">
                <button type="button" className="venue-menu-head" onClick={() => toggle(bank)}>
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <Building2 size={15} />
                  <span className="venue-menu-bank">{bank}</span>
                  <span className="venue-menu-count">{items.length}</span>
                </button>
                {isOpen && (
                  <div className="venue-menu-dates">
                    {items.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className={`venue-menu-date ${selected === r.id ? 'is-active' : ''}`}
                        onClick={() => setSelected(r.id)}
                      >
                        <span className={`venue-stagetag stage-${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                        {formatDate(r.date)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <section className="venue-main">
          {visible.map((report) => (
            <VenueReportBlock key={report.id} report={report} />
          ))}
        </section>
      </div>
    </div>
  );
}

function VenueReportBlock({ report }: { report: VenueReport }) {
  const isWritten = report.stage === 'written';
  // 缺考統計：有填 absent 的試場才納入加總。
  const absentRooms = report.sessions.filter((s) => typeof s.absent === 'number');
  const absentTotal = absentRooms.reduce((n, s) => n + (s.absent ?? 0), 0);
  const hasAbsentData = absentRooms.length > 0;

  return (
    <section id={report.id} className="venue-report">
      <header className="venue-report-head">
        <h2 className="venue-report-title">
          <Building2 size={18} />
          {report.bank}
        </h2>
        <span className={`venue-stage-badge stage-${report.stage}`}>
          {isWritten ? <ClipboardList size={13} /> : <MessagesSquare size={13} />}
          {STAGE_LABEL[report.stage]}
        </span>
        <span className="venue-report-date">{formatDate(report.date)}</span>
        {report.note && <span className="venue-report-note">{report.note}</span>}
      </header>

      {/* 統計摘要：試場數，以及（有資料時）缺考總人數。 */}
      <div className="venue-summary">
        <span className="venue-summary-chip">
          {report.sessions.length} 個試場
        </span>
        {hasAbsentData && (
          <span className="venue-summary-chip venue-summary-absent">
            <UserX size={13} />
            缺考共 {absentTotal} 人
          </span>
        )}
      </div>

      <div className="venue-grid">
        {report.sessions.map((s) => (
          <article key={s.room} className="venue-card">
            <div className="venue-card-head">
              <span className="venue-room">{s.room}</span>
              {s.grade && <span className="venue-badge venue-badge-grade">{s.grade}</span>}
              {typeof s.absent === 'number' &&
                (s.absent > 0 ? (
                  <span className="venue-badge venue-badge-absent">
                    <UserX size={12} />
                    缺 {s.absent} 人
                  </span>
                ) : (
                  <span className="venue-badge venue-badge-none">無缺考</span>
                ))}
            </div>
            {s.questions && s.questions.length > 0 && (
              <ul className="venue-qlist">
                {s.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
            {s.note && <p className="venue-card-note">{s.note}</p>}
          </article>
        ))}
      </div>

      {report.extras && report.extras.length > 0 && (
        <div className="venue-extras">
          <h3 className="venue-extras-title">其他未標示試場的考題</h3>
          <ul className="venue-qlist">
            {report.extras.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
