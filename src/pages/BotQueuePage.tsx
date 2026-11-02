import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  Phone,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  fetchBotBranchHistory,
  fetchBotQueueSummary,
  type BotBranchHistoryResponse,
  type BotBranchItem,
  type BotDailyMetricRow,
  type BotQueueSummaryResponse,
} from '../lib/botQueue';

type SortKey = 'total_called' | 'avg_waiting' | 'max_waiting' | 'branch_id';
type TabMode = 'daily' | 'branches';

function formatDateSlash(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${y}/${m}/${d}` : isoDate;
}

export function BotQueuePage() {
  const [data, setData] = useState<BotQueueSummaryResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tab, setTab] = useState<TabMode>('daily');

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey>('total_called');

  const [historyModal, setHistoryModal] = useState<{
    branchId: string;
    loading: boolean;
    payload: BotBranchHistoryResponse | null;
  } | null>(null);

  useEffect(() => {
    setState('loading');
    fetchBotQueueSummary({ date: selectedDate || undefined })
      .then((res) => {
        setData(res);
        if (!selectedDate && res.selected_date) {
          setSelectedDate(res.selected_date);
        }
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [selectedDate]);

  const availableDates = data?.available_dates ?? [];
  const currentDateIdx = selectedDate ? availableDates.indexOf(selectedDate) : -1;
  // availableDates is ordered newest first (index 0 = newest, index length-1 = oldest)
  const canPrevDay = currentDateIdx >= 0 && currentDateIdx < availableDates.length - 1;
  const canNextDay = currentDateIdx > 0;

  const goPrevDay = () => {
    if (canPrevDay) setSelectedDate(availableDates[currentDateIdx + 1]);
  };
  const goNextDay = () => {
    if (canNextDay) setSelectedDate(availableDates[currentDateIdx - 1]);
  };

  const filteredMetrics = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = data.daily_metrics.filter((row) => {
      if (selectedCity && row.city !== selectedCity) return false;
      if (selectedService && row.service_name !== selectedService) return false;
      if (q) {
        const matchId = row.branch_id.toLowerCase().includes(q);
        const matchName = (row.branch_name || '').toLowerCase().includes(q);
        const matchCity = (row.city || '').toLowerCase().includes(q);
        const matchSvc = (row.service_name || '').toLowerCase().includes(q);
        if (!matchId && !matchName && !matchCity && !matchSvc) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'total_called') {
        const diff = (b.total_called_count ?? -1) - (a.total_called_count ?? -1);
        if (diff !== 0) return diff;
      } else if (sortBy === 'avg_waiting') {
        const diff = (b.avg_waiting_count ?? -1) - (a.avg_waiting_count ?? -1);
        if (diff !== 0) return diff;
      } else if (sortBy === 'max_waiting') {
        const diff = (b.max_waiting_count ?? -1) - (a.max_waiting_count ?? -1);
        if (diff !== 0) return diff;
      }
      return a.branch_id.localeCompare(b.branch_id);
    });

    return list;
  }, [data, selectedCity, selectedService, searchQuery, sortBy]);

  const filteredBranches = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.branches.filter((b) => {
      if (selectedCity && b.city !== selectedCity) return false;
      if (q) {
        const matchId = b.branch_id.toLowerCase().includes(q);
        const matchName = b.branch_name.toLowerCase().includes(q);
        const matchAddr = b.address.toLowerCase().includes(q);
        if (!matchId && !matchName && !matchAddr) return false;
      }
      return true;
    });
  }, [data, selectedCity, searchQuery]);

  const openBranchHistory = (branchId: string) => {
    setHistoryModal({ branchId, loading: true, payload: null });
    fetchBotBranchHistory(branchId)
      .then((payload) => {
        setHistoryModal({ branchId, loading: false, payload });
      })
      .catch(() => {
        setHistoryModal(null);
      });
  };

  return (
    <div className="container py-4 bot-queue-page">
      <div className="interview-kicker">
        <Clock size={18} />
        叫號統計
      </div>
      <h1 className="bot-queue-title">各分行叫號與等待統計</h1>
      <p className="venue-intro">
        系統於每個營業日（週一至週五 <strong>09:00–17:00</strong>）自動觀測並彙整各分行各業務之<strong>平均等待人數</strong>、<strong>最高等待人數</strong>、<strong>最忙碌時段</strong>與<strong>總叫號人數</strong>，協助掌握各分行實際臨櫃業務量。
      </p>

      <div className="venue-disclaimer">
        <Info size={16} />
        <p>
          本頁所有數據皆為營業時段內自銀行線上叫號查詢頁面實際觀測之<strong>純實測統計數據</strong>（不含任何模型推估）。點擊任一分行名稱可檢視該分行的跨日歷史統計紀錄。
        </p>
      </div>

      {/* 銀行切換列（預留未來擴充其他銀行） */}
      <div className="admin-chips mb-3" role="group" aria-label="選擇銀行">
        <button type="button" className="admin-chip is-active">
          <Building2 size={14} />
          臺灣銀行
          <span className="admin-chip-count">{data?.branch_counts.total ?? 164}</span>
        </button>
      </div>

      {/* 頂部統計指標與分頁切換 */}
      <div className="bot-queue-top-bar">
        <div className=" official-doc-type-switch" role="tablist" aria-label="檢視模式">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'daily'}
            className={tab === 'daily' ? 'is-active' : ''}
            onClick={() => setTab('daily')}
          >
            <strong>每日統計查閱</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'branches'}
            className={tab === 'branches' ? 'is-active' : ''}
            onClick={() => setTab('branches')}
          >
            <strong>全臺據點名冊 ({data?.branch_counts.total ?? 164})</strong>
          </button>
        </div>

        {tab === 'daily' && (
          <div className="bot-queue-date-bar">
            <Calendar size={16} className="bot-queue-date-icon" />
            <span className="bot-queue-date-label">統計日期：</span>
            <button
              type="button"
              className="cal-nav-btn"
              onClick={goPrevDay}
              disabled={!canPrevDay}
              aria-label="前一個有資料日"
              title="前一個有資料日"
            >
              <ChevronLeft size={17} />
            </button>
            <select
              className="bot-queue-select"
              value={selectedDate || data?.selected_date || ''}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="選擇統計日期"
            >
              {availableDates.length === 0 ? (
                <option value={data?.selected_date || ''}>
                  {formatDateSlash(data?.selected_date || '尚無歷史日期')}
                </option>
              ) : (
                availableDates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateSlash(d)}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              className="cal-nav-btn"
              onClick={goNextDay}
              disabled={!canNextDay}
              aria-label="後一個有資料日"
              title="後一個有資料日"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>

      {/* 篩選與搜尋列 */}
      <section className="bot-queue-filter-card" aria-label="篩選條件">
        <div className="bot-queue-filter-row">
          <div className="bot-queue-search-wrap">
            <Search size={16} className="bot-queue-search-icon" />
            <input
              type="search"
              className="form-control bot-queue-search-input"
              placeholder="搜尋分行名稱、代碼（如：館前、營業部、007）…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="bot-queue-filter-selects">
            <select
              className="form-select bot-queue-select"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              aria-label="篩選縣市"
            >
              <option value="">全部縣市</option>
              {(data?.cities ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {tab === 'daily' && (
              <>
                <select
                  className="form-select bot-queue-select"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  aria-label="篩選業務類別"
                >
                  <option value="">全部業務類別</option>
                  {(data?.services ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  className="form-select bot-queue-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  aria-label="排序方式"
                >
                  <option value="total_called">排序：總叫號人數（高 → 低）</option>
                  <option value="avg_waiting">排序：平均等待人數（高 → 低）</option>
                  <option value="max_waiting">排序：最高等待人數（高 → 低）</option>
                  <option value="branch_id">排序：分行代碼（小 → 大）</option>
                </select>
              </>
            )}
          </div>
        </div>
      </section>

      {state === 'loading' && <p className="calendar-empty">統計資料載入中…</p>}
      {state === 'error' && <p className="calendar-empty">資料載入失敗，請稍後再試。</p>}

      {state === 'ready' && tab === 'daily' && (
        <section className="bot-queue-table-card">
          {filteredMetrics.length === 0 ? (
            <div className="bot-queue-empty">
              <Users size={28} />
              <h2>目前所選日期或篩選條件尚無統計資料</h2>
              <p>
                系統會在每個營業日（週一至週五 09:00–17:00）自動採集並彙整當日數據。你也可以切換至「全臺據點名冊」查看全臺 164 間營業據點資訊。
              </p>
            </div>
          ) : (
            <div className="bot-queue-table-wrap">
              <table className="bot-queue-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>分行</th>
                    <th>業務類別</th>
                    <th>觀測起訖時間</th>
                    <th className="is-num">平均等待人數</th>
                    <th className="is-num">最高等待人數 (發生時間)</th>
                    <th>最忙碌時段</th>
                    <th className="is-num">總叫號人數</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMetrics.map((row, idx) => (
                    <DailyMetricRowItem
                      key={`${row.date_local}-${row.branch_id}-${row.service_name}-${idx}`}
                      row={row}
                      onSelectBranch={openBranchHistory}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {state === 'ready' && tab === 'branches' && (
        <section className="bot-queue-branches-section">
          <div className="venue-summary mb-3">
            <span className="venue-summary-chip">
              全臺共 {data?.branch_counts.total ?? 164} 間據點
            </span>
            <span className="venue-summary-chip">
              啟用線上叫號 {data?.branch_counts.enabled ?? 151} 間
            </span>
            <span className="venue-summary-chip">
              網站未開放線上取號 {data?.branch_counts.disabled ?? 13} 間
            </span>
          </div>

          <div className="venue-grid">
            {filteredBranches.map((b) => (
              <BranchCardItem key={b.branch_id} branch={b} onOpenHistory={openBranchHistory} />
            ))}
          </div>
        </section>
      )}

      {historyModal && (
        <BranchHistoryModal
          loading={historyModal.loading}
          payload={historyModal.payload}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  );
}

function DailyMetricRowItem({
  row,
  onSelectBranch,
}: {
  row: BotDailyMetricRow;
  onSelectBranch: (branchId: string) => void;
}) {
  const timeRange =
    row.first_observed_at && row.last_observed_at
      ? `${row.first_observed_at} ~ ${row.last_observed_at}`
      : '—';
  const maxWaitStr =
    row.max_waiting_count != null
      ? `${row.max_waiting_count} 人 (${row.max_waiting_at || '—'})`
      : '—';

  return (
    <tr>
      <td className="bot-queue-td-date">{formatDateSlash(row.date_local)}</td>
      <td>
        <button
          type="button"
          className="bot-queue-branch-btn"
          onClick={() => onSelectBranch(row.branch_id)}
          title="查看此分行的歷史每日統計"
        >
          <span className="bot-queue-branch-code">{row.branch_id}</span>
          <span className="bot-queue-branch-name">{row.branch_name || row.branch_id}</span>
        </button>
        {row.city && <span className="bot-queue-city-tag">{row.city}</span>}
      </td>
      <td>
        <span className="bot-queue-service-badge">{row.service_name || '—'}</span>
      </td>
      <td className="bot-queue-td-time">{timeRange}</td>
      <td className="is-num">
        <strong>{row.avg_waiting_count != null ? `${row.avg_waiting_count} 人` : '—'}</strong>
      </td>
      <td className="is-num">{maxWaitStr}</td>
      <td>{row.peak_hour_local || '—'}</td>
      <td className="is-num">
        <strong className="bot-queue-called-num">
          {row.total_called_count != null ? `${row.total_called_count} 人` : '—'}
        </strong>
      </td>
    </tr>
  );
}

function BranchCardItem({
  branch,
  onOpenHistory,
}: {
  branch: BotBranchItem;
  onOpenHistory: (branchId: string) => void;
}) {
  const isDisabled = Boolean(branch.is_disabled_on_site);
  return (
    <article className="venue-card bot-queue-branch-card">
      <div className="venue-card-head">
        <span className="venue-room">
          {branch.branch_id} {branch.branch_name}
        </span>
        {branch.city && <span className="venue-badge venue-badge-grade">{branch.city}</span>}
        {isDisabled ? (
          <span className="venue-badge venue-badge-absent">未開放線上叫號</span>
        ) : (
          <span className="venue-badge venue-badge-none">定期觀測中</span>
        )}
      </div>

      <div className="bot-queue-branch-meta">
        {branch.address && (
          <p>
            <MapPin size={13} />
            <span>{branch.address}</span>
          </p>
        )}
        {branch.phone && (
          <p>
            <Phone size={13} />
            <span>{branch.phone}</span>
          </p>
        )}
      </div>

      {!isDisabled && (
        <button
          type="button"
          className="bot-queue-history-trigger"
          onClick={() => onOpenHistory(branch.branch_id)}
        >
          <Building2 size={14} />
          查看每日統計紀錄
        </button>
      )}
    </article>
  );
}

function BranchHistoryModal({
  loading,
  payload,
  onClose,
}: {
  loading: boolean;
  payload: BotBranchHistoryResponse | null;
  onClose: () => void;
}) {
  return (
    <div className="cal-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="cal-modal bot-queue-history-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button type="button" className="cal-modal-close" onClick={onClose} aria-label="關閉">
          <X size={18} />
        </button>

        {loading || !payload ? (
          <p className="calendar-empty">載入分行歷史資料中…</p>
        ) : (
          <>
            <div className="interview-kicker mb-1">
              <Building2 size={16} />
              {payload.branch.city || '臺灣銀行'}
            </div>
            <h2 className="cal-modal-org">
              {payload.branch.branch_id} {payload.branch.branch_name}
            </h2>
            <p className="bot-queue-modal-sub">
              {payload.branch.address}
              {payload.branch.phone ? `　｜　電話：${payload.branch.phone}` : ''}
            </p>

            {payload.history.length === 0 ? (
              <p className="calendar-empty">此分行目前尚無歷史每日統計紀錄。</p>
            ) : (
              <div className="bot-queue-table-wrap mt-3">
                <table className="bot-queue-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>業務類別</th>
                      <th>觀測起訖時間</th>
                      <th className="is-num">平均等待人數</th>
                      <th className="is-num">最高等待人數 (發生時間)</th>
                      <th>最忙碌時段</th>
                      <th className="is-num">總叫號人數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.history.map((h, i) => (
                      <tr key={`${h.date_local}-${h.service_name}-${i}`}>
                        <td className="bot-queue-td-date">{formatDateSlash(h.date_local)}</td>
                        <td>
                          <span className="bot-queue-service-badge">{h.service_name || '—'}</span>
                        </td>
                        <td className="bot-queue-td-time">
                          {h.first_observed_at && h.last_observed_at
                            ? `${h.first_observed_at} ~ ${h.last_observed_at}`
                            : '—'}
                        </td>
                        <td className="is-num">
                          <strong>
                            {h.avg_waiting_count != null ? `${h.avg_waiting_count} 人` : '—'}
                          </strong>
                        </td>
                        <td className="is-num">
                          {h.max_waiting_count != null
                            ? `${h.max_waiting_count} 人 (${h.max_waiting_at || '—'})`
                            : '—'}
                        </td>
                        <td>{h.peak_hour_local || '—'}</td>
                        <td className="is-num">
                          <strong className="bot-queue-called-num">
                            {h.total_called_count != null ? `${h.total_called_count} 人` : '—'}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
