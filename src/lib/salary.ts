// 公股銀行年薪試算的純計算邏輯。所有金額單位為新臺幣（元）。
// UI 只負責呈現，數字怎麼來的都集中在這裡，方便對帳與測試。

// 各職等的「起薪」月薪（本薪）。升到某一等的那一年，月薪會跳到該等起薪；
// 之後在同一等期間，每年固定調薪 2%（見 ANNUAL_RAISE）。
export const GRADE_BASE: Record<number, number> = {
  5: 40900,
  6: 47100,
  7: 51800,
  8: 62500,
  9: 71000,
};

export const ANNUAL_RAISE = 0.02; // 每年固定調薪 2%
export const BONUS_MONTHS = 4; // 每年獎金固定 4 個月
export const FIRST_YEAR_BONUS_FACTOR = 0.8; // 第一年新人考績多為乙等，獎金再打八折
export const MONTHLY_OVERTIME = 3000; // 每月加班費固定（不隨調薪變動）
export const ANNUAL_SAVINGS_INTEREST = 62400; // 每年行儲利息（固定）

export const MIN_YEARS = 1;
export const MAX_YEARS = 30;

// 升等時程：五→六 2 年、六→七 2 年、七→八 3 年、八→九 6 年；到九等後不再升等。
// 換算成「每一等是從年資第幾年開始」（startYear 為含括的第一年）。
export const GRADE_SCHEDULE: { grade: number; startYear: number }[] = [
  { grade: 5, startYear: 1 }, // 五等：第 1~2 年
  { grade: 6, startYear: 3 }, // 六等：第 3~4 年
  { grade: 7, startYear: 5 }, // 七等：第 5~7 年
  { grade: 8, startYear: 8 }, // 八等：第 8~13 年
  { grade: 9, startYear: 14 }, // 九等：第 14 年起
];

export interface YearSalary {
  year: number; // 年資第幾年（1 起算）
  grade: number; // 當年職等
  yearsAtGrade: number; // 在這一等已經待了幾年（0 = 升等當年）
  monthly: number; // 當年月薪（本薪，已四捨五入到元）
  baseAnnual: number; // 12 個月本薪
  bonus: number; // 獎金（第一年打八折）
  overtime: number; // 全年加班費 = 3000 × 12
  savingsInterest: number; // 行儲利息
  total: number; // 年薪總計
}

export interface SalarySummary {
  years: number; // 設定的年資
  perYear: YearSalary[]; // 第 1 ~ N 年逐年明細
  total: number; // 這段期間的總年薪
  average: number; // 平均年薪
}

// 找出年資第 `year` 年所屬的職等與該等起始年。
function gradeForYear(year: number): { grade: number; startYear: number } {
  let current = GRADE_SCHEDULE[0];
  for (const entry of GRADE_SCHEDULE) {
    if (year >= entry.startYear) current = entry;
  }
  return current;
}

// 計算單一年度（年資第 `year` 年）的完整薪資明細。
export function salaryForYear(year: number): YearSalary {
  const { grade, startYear } = gradeForYear(year);
  const yearsAtGrade = year - startYear;
  // 升等當年領該等起薪，之後每多待一年就複利 +2%。
  const rawMonthly = GRADE_BASE[grade] * Math.pow(1 + ANNUAL_RAISE, yearsAtGrade);
  const monthly = Math.round(rawMonthly);

  const baseAnnual = monthly * 12;
  // 第一年新人考績多為乙等，獎金（4 個月）再打八折計。
  const bonusFactor = year === 1 ? FIRST_YEAR_BONUS_FACTOR : 1;
  const bonus = Math.round(monthly * BONUS_MONTHS * bonusFactor);
  const overtime = MONTHLY_OVERTIME * 12;
  const savingsInterest = ANNUAL_SAVINGS_INTEREST;
  const total = baseAnnual + bonus + overtime + savingsInterest;

  return { year, grade, yearsAtGrade, monthly, baseAnnual, bonus, overtime, savingsInterest, total };
}

// 計算年資第 1 ~ N 年的逐年明細、總年薪與平均年薪。
export function summarize(years: number): SalarySummary {
  const clamped = Math.min(MAX_YEARS, Math.max(MIN_YEARS, Math.round(years)));
  const perYear: YearSalary[] = [];
  for (let y = 1; y <= clamped; y += 1) perYear.push(salaryForYear(y));
  const total = perYear.reduce((sum, y) => sum + y.total, 0);
  const average = Math.round(total / clamped);
  return { years: clamped, perYear, total, average };
}

// 格式化成帶千分位的新臺幣字串，例如 1234567 → "1,234,567"。
export function formatNT(value: number): string {
  return Math.round(value).toLocaleString('zh-TW');
}
