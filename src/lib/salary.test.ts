import { describe, it, expect } from 'vitest';
import { salaryForYear, summarize, monthlyOvertimePay, MAX_YEARS } from './salary';

// 這些數字是依使用者給的調薪機制手算的對帳值。若機制改了，更新這裡才會發現。
describe('salaryForYear — 職等與升等時程', () => {
  it('依年資對應正確職等（5→6→7→8→9）', () => {
    const grades = [1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 30].map((y) => salaryForYear(y).grade);
    // 五:1-2、六:3-4、七:5-7、八:8-13、九:14+
    expect(grades).toEqual([5, 5, 6, 6, 7, 7, 7, 8, 8, 9, 9]);
  });

  it('升等當年領該等起薪（無 2% 加成）', () => {
    expect(salaryForYear(1).monthly).toBe(40900); // 五等
    expect(salaryForYear(3).monthly).toBe(47100); // 六等
    expect(salaryForYear(5).monthly).toBe(51800); // 七等
    expect(salaryForYear(8).monthly).toBe(62500); // 八等
    expect(salaryForYear(14).monthly).toBe(71000); // 九等（第 14 年起）
  });

  it('同一等期間每年複利 +2%', () => {
    expect(salaryForYear(2).monthly).toBe(Math.round(40900 * 1.02)); // 41718
    expect(salaryForYear(4).monthly).toBe(Math.round(47100 * 1.02)); // 48042
    expect(salaryForYear(7).monthly).toBe(Math.round(51800 * 1.02 * 1.02)); // 53893
  });
});

describe('salaryForYear — 年薪組成', () => {
  it('第 1 年的各項加總正確（獎金打八折）', () => {
    const y1 = salaryForYear(1);
    expect(y1.baseAnnual).toBe(40900 * 12); // 490,800
    expect(y1.bonus).toBe(Math.round(40900 * 4 * 0.8)); // 130,880（4 個月 × 八折）
    // 時薪 40900/30/8 × 12 時 = 2045（無條件捨去）→ 全年 ×12
    expect(y1.overtime).toBe(Math.floor((40900 / 30 / 8) * 12) * 12); // 2,045 × 12 = 24,540
    expect(y1.savingsInterest).toBe(62400);
    expect(y1.total).toBe(490800 + 130880 + 24540 + 62400); // 708,620
  });

  it('第 2 年起獎金為全額 4 個月（不打折）', () => {
    const y2 = salaryForYear(2);
    expect(y2.bonus).toBe(Math.round(y2.monthly * 4));
  });

  it('加班費：時薪（月薪/30/8）× 12 時，無條件捨去後 × 12 月', () => {
    const y2 = salaryForYear(2); // 月薪 41,718，× 12/240 = 2085.9 → 捨去 2085
    expect(monthlyOvertimePay(y2.monthly)).toBe(Math.floor((y2.monthly / 30 / 8) * 12));
    expect(monthlyOvertimePay(41718)).toBe(2085); // 確認是捨去而非四捨五入
    expect(y2.overtime).toBe(monthlyOvertimePay(y2.monthly) * 12);
  });

  it('total 一定等於四項加總', () => {
    for (let y = 1; y <= MAX_YEARS; y += 1) {
      const s = salaryForYear(y);
      expect(s.total).toBe(s.baseAnnual + s.bonus + s.overtime + s.savingsInterest);
    }
  });
});

describe('summarize — 總年薪與平均', () => {
  it('總年薪為逐年加總、平均為總和除以年數', () => {
    const s = summarize(3);
    const manual = s.perYear.reduce((sum, y) => sum + y.total, 0);
    expect(s.total).toBe(manual);
    expect(s.average).toBe(Math.round(manual / 3));
    expect(s.perYear).toHaveLength(3);
  });

  it('年資超出範圍會被夾到 1~30', () => {
    expect(summarize(0).years).toBe(1);
    expect(summarize(99).years).toBe(MAX_YEARS);
  });
});
