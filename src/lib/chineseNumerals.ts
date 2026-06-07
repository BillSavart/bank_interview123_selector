// 大寫數字（國字大寫金額）工具：產生隨機金額、轉成大寫顯示。
//
// 訓練器的出題方向是「看大寫、填阿拉伯數字」，所以這裡主要負責把一個整數金額
// 轉成大寫字串當題目；驗證時直接比對使用者填入的數字，與大寫的寫法變體無關。

/** 大寫數字 0–9。注意「參」也可寫作「叁」、「肆」也可寫作「䦉」，見 VARIANTS。 */
const DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'] as const;

/** 同一個位數內的單位：個、拾、佰、仟。 */
const SMALL_UNITS = ['', '拾', '佰', '仟'] as const;

/** 每四位一組的大單位：個級、萬級、億級。對齊表頭「億 仟佰拾萬 仟佰拾元」。 */
const BIG_UNITS = ['', '萬', '億'] as const;

/** 常見的異體字寫法（銀行實務上都通用）。 */
const VARIANTS: Record<string, string[]> = {
  參: ['參', '叁'],
  肆: ['肆', '䦉'],
};

/** 表頭欄位，由高位到低位，對齊使用者要填的方格。 */
export const PLACE_HEADERS = ['億', '仟', '佰', '拾', '萬', '仟', '佰', '拾', '元'] as const;

/** 方格數 = 表頭數。最大可表示 999,999,999。 */
export const PLACE_COUNT = PLACE_HEADERS.length;

/** 此訓練器支援的最大金額（九位數，對齊九個方格）。 */
export const MAX_AMOUNT = 999_999_999;

export interface CapitalOptions {
  /** 隨機採用異體字（參/叁、肆/䦉），預設 false（用標準字）。 */
  variants?: boolean;
}

// 把 0..9999 的數字轉成大寫，內部的 0 以「零」表示（首尾的零不在這裡處理）。
function fourDigitGroup(num: number): string {
  let out = '';
  let zeroPending = false;
  for (let pos = 3; pos >= 0; pos--) {
    const digit = Math.floor(num / 10 ** pos) % 10;
    if (digit === 0) {
      // 只有在已經輸出過字、且後面還有非零位時才補「零」。
      if (out.length > 0) zeroPending = true;
    } else {
      if (zeroPending) {
        out += '零';
        zeroPending = false;
      }
      out += DIGITS[digit] + SMALL_UNITS[pos];
    }
  }
  return out;
}

// Randomly pick a variant glyph for a single character (參/叁, 肆/䦉), or return
// it unchanged when it has no variants.
function pickVariant(ch: string): string {
  const choices = VARIANTS[ch];
  return choices ? choices[Math.floor(Math.random() * choices.length)] : ch;
}

function applyVariants(text: string): string {
  let out = '';
  for (const ch of text) out += pickVariant(ch);
  return out;
}

// 大寫金額的數字主體（含「零」、不含「元」尾綴）。例：20600 → 「貳萬零陸佰」。
function capitalDigits(amount: number): string {
  const n = Math.floor(amount);
  if (n <= 0) return '零';

  // 由低位到高位，每四位切成一組。
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 10000);
    rest = Math.floor(rest / 10000);
  }

  let result = '';
  for (let g = groups.length - 1; g >= 0; g--) {
    const value = groups[g];
    if (value === 0) {
      // 整組為零：在兩個非零組之間補一個「零」（避免重複）。
      if (result && !result.endsWith('零')) result += '零';
      continue;
    }
    // 這一組不足千、且前面已有更高位時，需要一個「零」當間隔（例：壹萬零伍）。
    if (result && value < 1000 && !result.endsWith('零')) result += '零';
    result += fourDigitGroup(value) + BIG_UNITS[g];
  }

  return result.replace(/零+$/, ''); // 去掉尾端多餘的零
}

// 整段套用「同題一致」的異體字（用了參就整段都參），與 toGridCells 規則相同。
function applyVariantsConsistent(text: string): string {
  const map: Record<string, string> = {};
  for (const [base, choices] of Object.entries(VARIANTS)) {
    map[base] = choices[Math.floor(Math.random() * choices.length)];
  }
  let out = '';
  for (const ch of text) out += map[ch] ?? ch;
  return out;
}

/**
 * 把整數金額轉成大寫字串，結尾固定加「元」。
 * 例：20600 → 「貳萬零陸佰元」、105 → 「壹佰零伍元」、10000 → 「壹萬元」。
 */
export function toCapital(amount: number, options: CapitalOptions = {}): string {
  let result = capitalDigits(amount);
  if (options.variants) result = applyVariants(result);
  return `${result}元`;
}

/**
 * 支票金額寫法：與標準大寫相同（含「零」），結尾改加「元整」。
 * 例：280300 → 「貳拾捌萬零參佰元整」、1000000 → 「壹佰萬元整」。
 */
export function toCheckCapital(amount: number, options: CapitalOptions = {}): string {
  let result = capitalDigits(amount);
  if (options.variants) result = applyVariantsConsistent(result);
  return `${result}元整`;
}

/** 把整數拆成對齊 PLACE_HEADERS 的每位數字（高位在前，不足補 0）。 */
export function toPlaceDigits(amount: number): number[] {
  const s = String(Math.max(0, Math.floor(amount))).padStart(PLACE_COUNT, '0');
  return s.slice(-PLACE_COUNT).split('').map(Number);
}

// 最高位的位置索引（0 = 元，5 = 拾萬，8 = 億）。
const MSD_TEN_THOUSAND = 5; // 拾萬

/**
 * 產生一個隨機金額，最高位的位置呈鐘型分布、以「拾萬」為中心（≈ 六位數最常見），
 * 偶爾更小或更大到「億」。用三個均勻亂數相加近似常態（中央極限），再縮放、夾在
 * 1（拾）到 8（億）之間。
 */
export function randomAmount(): number {
  const bell = (Math.random() + Math.random() + Math.random()) / 3; // 鐘型，平均 0.5
  const spread = 8; // (bell-0.5) ∈ ±0.5 → 偏移 ±4 位
  const msd = Math.min(8, Math.max(1, Math.round(MSD_TEN_THOUSAND + (bell - 0.5) * spread)));

  let n = (1 + Math.floor(Math.random() * 9)) * 10 ** msd; // 最高位 1~9
  for (let pos = msd - 1; pos >= 0; pos--) {
    n += Math.floor(Math.random() * 10) * 10 ** pos; // 其餘位 0~9
  }
  return Math.min(n, MAX_AMOUNT);
}

/** 方格內容：大寫數字、寫「零」、或打叉（前導/省略的空位）。 */
export type GridCell =
  | { kind: 'digit'; char: string }
  | { kind: 'zero' }
  | { kind: 'cross' };

/**
 * 把金額轉成對齊 PLACE_HEADERS 的九個方格內容（高位在前）：
 * - 非零位：顯示大寫數字。
 * - 最前面的前導 0：一律打叉。
 * - 非前導的 0（中間或結尾）：整題一致 —— 要嘛全寫「零」、要嘛全打叉，不混用。
 *
 * 變體字（參/叁、肆/䦉）也是整題一致：用了參就整題都用參，不會同題又出現叁。
 */
export function toGridCells(amount: number, options: CapitalOptions = {}): GridCell[] {
  const digits = toPlaceDigits(amount);
  const firstSignificant = digits.findIndex((d) => d !== 0);

  // 每題只決定一次：非前導 0 要寫「零」還是打叉。
  const nonLeadingZeroAsZero = Math.random() < 0.5;

  // 每題只決定一次：每個有異體字的數字固定用哪個寫法。
  const variantMap: Record<string, string> = {};
  if (options.variants) {
    for (const [base, choices] of Object.entries(VARIANTS)) {
      variantMap[base] = choices[Math.floor(Math.random() * choices.length)];
    }
  }
  const glyph = (d: number) => variantMap[DIGITS[d]] ?? DIGITS[d];

  return digits.map((d, i) => {
    if (d !== 0) return { kind: 'digit', char: glyph(d) };
    // 前導 0（在最高位之前）一律打叉；其餘 0 依整題一致的樣式。
    if (firstSignificant === -1 || i < firstSignificant) return { kind: 'cross' };
    return nonLeadingZeroAsZero ? { kind: 'zero' } : { kind: 'cross' };
  });
}
