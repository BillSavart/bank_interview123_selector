import { useMemo, useState } from 'react';
import { Calculator, Coins, TrendingUp, Wallet, Info } from 'lucide-react';
import {
  summarize,
  formatNT,
  GRADE_BASE,
  ANNUAL_RAISE,
  BONUS_MONTHS,
  FIRST_YEAR_BONUS_FACTOR,
  MONTHLY_OVERTIME,
  ANNUAL_SAVINGS_INTEREST,
  MIN_YEARS,
  MAX_YEARS,
  type YearSalary,
} from '../lib/salary';

export function SalaryCalculatorPage() {
  const [years, setYears] = useState(1);

  const summary = useMemo(() => summarize(years), [years]);
  // 「當年」＝拉桿設定的第 N 年；明細區跟著拉桿自動切換，不再另開選單。
  const focus = summary.perYear[summary.years - 1];
  // 逐年表固定列出 1～30 年，不隨拉桿變動。
  const allYears = useMemo(() => summarize(MAX_YEARS).perYear, []);

  return (
    <div className="container py-4 salary-page">
      <div className="interview-kicker">
        <Calculator size={18} />
        年薪計算機
      </div>

      <h1 className="display-title salary-title">公股銀行年薪計算機</h1>
      <p className="salary-intro">
        設定年資 1～30 年，試算這段期間的<strong>總薪資</strong>；下方的「當年年薪明細」會跟著拉桿，
        顯示你拉到第 N 年那一年的薪資組成。月薪以五等 40,900 元起、每年固定調薪 2%，並依升等時程逐步晉等計算。
      </p>

      {/* --- 調薪與升等機制（置頂說明） --- */}
      <section className="salary-card salary-mechanism">
        <h2 className="salary-h2">
          <Info size={18} />
          調薪與升等機制
        </h2>
        <ul className="salary-mechanism-list">
          <li>
            <strong>起薪：</strong>以五等月薪 <b>{formatNT(GRADE_BASE[5])}</b> 元起算。
          </li>
          <li>
            <strong>每年調薪：</strong>同一職等期間，每年月薪固定調升{' '}
            <b>{Math.round(ANNUAL_RAISE * 100)}%</b>。
          </li>
          <li>
            <strong>升等時程：</strong>一開始每 2 年升一等（五→六、六→七）；七→八抓 3 年；八→九抓 6 年。
            升等當年月薪直接跳到該職等起薪。
          </li>
          <li>
            <strong>各職等起薪（月薪）：</strong>
            五等 {formatNT(GRADE_BASE[5])}、六等 {formatNT(GRADE_BASE[6])}、七等 {formatNT(GRADE_BASE[7])}、
            八等 {formatNT(GRADE_BASE[8])}、九等 {formatNT(GRADE_BASE[9])} 元。
          </li>
          <li>
            <strong>年薪組成：</strong>12 個月本薪 ＋ 獎金 <b>{BONUS_MONTHS}</b> 個月 ＋ 每月加班費{' '}
            <b>{formatNT(MONTHLY_OVERTIME)}</b> 元（全年 {formatNT(MONTHLY_OVERTIME * 12)}）＋ 行儲利息每年{' '}
            <b>{formatNT(ANNUAL_SAVINGS_INTEREST)}</b> 元。
          </li>
          <li>
            <strong>第一年獎金：</strong>新人首年考績多為乙等，獎金以 {BONUS_MONTHS} 個月再打八折（×
            {FIRST_YEAR_BONUS_FACTOR}）計算；第 2 年起恢復全額 {BONUS_MONTHS} 個月。
          </li>
          <li className="salary-mechanism-note">
            升等時程的對照：五等＝第 1～2 年、六等＝第 3～4 年、七等＝第 5～7 年、八等＝第 8～13 年、
            九等＝第 14 年起。
          </li>
        </ul>
      </section>

      {/* --- 免責聲明（往上移） --- */}
      <p className="salary-disclaimer">
        ※ 以上數字皆為依固定公式試算的<strong>估計值，僅供參考</strong>，且未計算勞健保與勞退自提。
        實際薪資、獎金月數、加班費與升等時程，依各銀行制度、年度盈餘與個人考核而有不同，請以任職銀行的正式規定為準。
      </p>

      {/* --- 設定（只剩年資拉桿） --- */}
      <section className="salary-card salary-controls">
        <div className="salary-control">
          <label className="salary-control-label" htmlFor="salary-years">
            年資
            <span className="salary-control-value">{summary.years} 年</span>
          </label>
          <input
            id="salary-years"
            className="salary-range"
            type="range"
            min={MIN_YEARS}
            max={MAX_YEARS}
            value={summary.years}
            onChange={(e) => setYears(Number(e.target.value))}
          />
          <div className="salary-range-scale">
            <span>{MIN_YEARS} 年</span>
            <span>{MAX_YEARS} 年</span>
          </div>
        </div>
      </section>

      {/* --- 總結 --- */}
      <section className="salary-stats">
        <div className="salary-stat is-primary">
          <span className="salary-stat-icon">
            <Wallet size={20} />
          </span>
          <span className="salary-stat-label">前 {summary.years} 年總薪資</span>
          <span className="salary-stat-value">
            {formatNT(summary.total)} <small>元</small>
          </span>
        </div>
        <div className="salary-stat">
          <span className="salary-stat-icon">
            <TrendingUp size={20} />
          </span>
          <span className="salary-stat-label">第 {summary.years} 年當年年薪</span>
          <span className="salary-stat-value">
            {formatNT(focus.total)} <small>元</small>
          </span>
        </div>
        <div className="salary-stat">
          <span className="salary-stat-icon">
            <Coins size={20} />
          </span>
          <span className="salary-stat-label">平均月領（年薪 ÷ 12）</span>
          <span className="salary-stat-value">
            {formatNT(summary.average / 12)} <small>元 / 月</small>
          </span>
        </div>
      </section>

      {/* --- 當年年薪明細（跟著拉桿） --- */}
      {focus && <FocusYearCard focus={focus} />}

      {/* --- 逐年表 --- */}
      <section className="salary-card">
        <h2 className="salary-h2">逐年年薪明細</h2>
        <div className="salary-table-wrap">
          <table className="salary-table">
            <thead>
              <tr>
                <th>年資</th>
                <th>職等</th>
                <th className="is-num">月薪（本薪）</th>
                <th className="is-num">12 個月本薪</th>
                <th className="is-num">獎金 {BONUS_MONTHS} 個月</th>
                <th className="is-num">加班費</th>
                <th className="is-num">行儲利息</th>
                <th className="is-num">當年年薪</th>
              </tr>
            </thead>
            <tbody>
              {allYears.map((y) => (
                <tr key={y.year}>
                  <td>第 {y.year} 年</td>
                  <td>
                    {y.grade} 等{y.yearsAtGrade === 0 && y.year !== 1 ? ' ⤴' : ''}
                  </td>
                  <td className="is-num">{formatNT(y.monthly)}</td>
                  <td className="is-num">{formatNT(y.baseAnnual)}</td>
                  <td className="is-num">{formatNT(y.bonus)}</td>
                  <td className="is-num">{formatNT(y.overtime)}</td>
                  <td className="is-num">{formatNT(y.savingsInterest)}</td>
                  <td className="is-num salary-table-total">{formatNT(y.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="salary-table-hint">
          標記 ⤴ 的年份代表當年升等、月薪跳到新職等起薪；第 1 年獎金已依新人八折計入。
        </p>
      </section>
    </div>
  );
}

// 把當年（拉桿設定的第 N 年）攤開成清楚的明細卡片。
function FocusYearCard({ focus }: { focus: YearSalary }) {
  const isFirstYear = focus.year === 1;
  const bonusLabel = isFirstYear ? `獎金（${BONUS_MONTHS} 個月 ×八折）` : `獎金（${BONUS_MONTHS} 個月）`;
  const bonusHint = isFirstYear
    ? `月薪 ${formatNT(focus.monthly)} × ${BONUS_MONTHS} × ${FIRST_YEAR_BONUS_FACTOR}（新人考績乙）`
    : `月薪 ${formatNT(focus.monthly)} × ${BONUS_MONTHS}`;
  const rows: { label: string; value: number; hint?: string }[] = [
    { label: '12 個月本薪', value: focus.baseAnnual, hint: `月薪 ${formatNT(focus.monthly)} × 12` },
    { label: bonusLabel, value: focus.bonus, hint: bonusHint },
    { label: '加班費（全年）', value: focus.overtime, hint: `每月 ${formatNT(MONTHLY_OVERTIME)} × 12` },
    { label: '行儲利息', value: focus.savingsInterest, hint: '每年固定' },
  ];

  return (
    <section className="salary-card salary-focus">
      <div className="salary-focus-head">
        <div>
          <span className="salary-focus-eyebrow">當年年薪明細</span>
          <h2 className="salary-focus-title">
            第 {focus.year} 年 · {focus.grade} 等
            <span className="salary-focus-monthly">月薪 {formatNT(focus.monthly)} 元</span>
          </h2>
        </div>
        <div className="salary-focus-total">
          <span className="salary-focus-total-label">當年年薪</span>
          <span className="salary-focus-total-value">{formatNT(focus.total)} 元</span>
        </div>
      </div>

      <div className="salary-focus-rows">
        {rows.map((r) => (
          <div key={r.label} className="salary-focus-row">
            <span className="salary-focus-row-label">
              {r.label}
              {r.hint && <small>{r.hint}</small>}
            </span>
            <span className="salary-focus-row-value">{formatNT(r.value)} 元</span>
          </div>
        ))}
      </div>
    </section>
  );
}
