// A bank's rounds may run several parallel exam tracks ("series"); a region's
// trend should only compare like-with-like (A vs A, 兆6 vs 兆6, 經驗 vs 經驗…).
// Returns a series key for a round label; '' = the bank's single/legacy track.
//
// Kept in its own (React-free) module so the rules are unit-testable: if a new
// round-label format ever appears in the source sheet, the tests in
// series.test.ts catch the mis-grouping before it ships.
export function seriesOf(bankName: string, label: string): string {
  switch (bankName) {
    case '第一銀行': return label.match(/(雙語|業務菁英|[ABC])$/)?.[1] ?? '';
    case '兆豐銀行': return label.match(/兆([678])/)?.[1] ?? '';
    case '台灣企銀': return /經驗/.test(label) ? '經驗' : '一般';
    // 華南: 一般 vs 經驗; a trailing A is noise (一般A/經驗A → 一般/經驗).
    case '華南銀行': return /經驗/.test(label) ? '經驗' : /一般/.test(label) ? '一般' : '';
    default: return '';
  }
}
