import { describe, it, expect } from 'vitest';
import { seriesOf } from './series';

// These cases are pinned to the real round labels in public/banks-data.json.
// If the source sheet introduces a new label format (e.g. a "D" track or "兆9"),
// add it to the sheet's rules in series.ts and a case here — a silent mis-group
// of the trend line then shows up as a failing test instead of a quiet bug.
describe('seriesOf', () => {
  it('第一銀行: trailing A/B/C and named tracks', () => {
    expect(seriesOf('第一銀行', '114一招A')).toBe('A');
    expect(seriesOf('第一銀行', '113二招C')).toBe('C');
    expect(seriesOf('第一銀行', '112一招雙語')).toBe('雙語');
    expect(seriesOf('第一銀行', '113一招業務菁英')).toBe('業務菁英');
    // Pre-split single-track rounds have no suffix → legacy series ''.
    expect(seriesOf('第一銀行', '106')).toBe('');
    expect(seriesOf('第一銀行', '107一招')).toBe('');
  });

  it('兆豐銀行: 兆6 / 兆7 / 兆8', () => {
    expect(seriesOf('兆豐銀行', '107二招兆6')).toBe('6');
    expect(seriesOf('兆豐銀行', '113兆7')).toBe('7');
    expect(seriesOf('兆豐銀行', '114兆8')).toBe('8');
  });

  it('台灣企銀: 經驗 vs 一般 (everything else)', () => {
    expect(seriesOf('台灣企銀', '114二招經驗')).toBe('經驗');
    expect(seriesOf('台灣企銀', '114二招')).toBe('一般');
    expect(seriesOf('台灣企銀', '108')).toBe('一般');
  });

  it('華南銀行: 經驗/一般 with trailing A ignored', () => {
    expect(seriesOf('華南銀行', '113華南一招一般')).toBe('一般');
    expect(seriesOf('華南銀行', '111八月一般A')).toBe('一般');
    expect(seriesOf('華南銀行', '112九月經驗A')).toBe('經驗');
    expect(seriesOf('華南銀行', '112年12月經驗A')).toBe('經驗');
    // Pre-split rounds with neither marker → legacy series ''.
    expect(seriesOf('華南銀行', '107二招')).toBe('');
    expect(seriesOf('華南銀行', '111五月')).toBe('');
  });

  it('other banks are a single series', () => {
    expect(seriesOf('臺灣銀行', '114一招')).toBe('');
    expect(seriesOf('土地銀行', '114')).toBe('');
    expect(seriesOf('合作金庫', '113二招')).toBe('');
    expect(seriesOf('彰化銀行', '114')).toBe('');
  });
});
