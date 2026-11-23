// Pure HTML + PDF schedule parsers for 台灣金融研訓院 (TABF) 受託甄試專區.
// Kept side-effect-free so Vitest can verify all parsing rules without network.

const TABF_ORIGIN = 'https://svc.tabf.org.tw';

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeHtmlEntities(input) {
  return String(input ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, body) => {
    const lower = body.toLowerCase();
    if (lower.startsWith('#x')) {
      const cp = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    if (lower.startsWith('#')) {
      const cp = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    return NAMED_ENTITIES[lower] ?? full;
  });
}

export function normalizeWhitespace(input) {
  return decodeHtmlEntities(input)
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toHalfWidth(input) {
  return String(input ?? '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[～〜]/g, '~')
    .replace(/\u3000/g, ' ');
}

/**
 * Extract canonical TABF exam slug from a svc.tabf.org.tw URL, or null.
 * Example: "https://svc.tabf.org.tw/115tcbbank04/Home/Read" -> "115tcbbank04".
 */
export function extractTabfSlug(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.hostname.toLowerCase() !== 'svc.tabf.org.tw') return null;
  const seg = parsed.pathname.split('/').filter(Boolean)[0];
  if (!seg || seg.startsWith('_')) return null;
  if (!/^[a-z0-9][a-z0-9_-]{1,48}$/i.test(seg)) return null;
  return seg;
}

/**
 * Parse https://www.tabf.org.tw/Exam.aspx and return deduplicated exam cards
 * from the 「甄試專區」 section.
 */
export function parseExamListingHtml(html) {
  const source = String(html ?? '');
  const bySlug = new Map();
  const cardRe = /<a\b([^>]*class\s*=\s*["'][^"']*\bmodel-card-group\b[^"']*\bexam\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of source.matchAll(cardRe)) {
    const attrs = match[1];
    const inner = match[2];
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    const rawHref = decodeHtmlEntities(hrefMatch?.[1] || hrefMatch?.[2] || '').trim();
    const slug = extractTabfSlug(rawHref);
    if (!slug) continue;

    const titleMatch = inner.match(/<p\b[^>]*class\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const title = normalizeWhitespace((titleMatch?.[1] || '').replace(/<[^>]+>/g, ''));
    if (!title) continue;

    const tagMatch = inner.match(/<span\b[^>]*class\s*=\s*["'][^"']*\btag\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const tag = normalizeWhitespace((tagMatch?.[1] || '').replace(/<[^>]+>/g, ''));
    const isRegistering = tag.includes('報名中');

    const key = slug.toLowerCase();
    const existing = bySlug.get(key);
    if (existing) {
      existing.isRegistering = existing.isRegistering || isRegistering;
    } else {
      bySlug.set(key, {
        slug,
        externalKey: `tabf:${key}`,
        url: `${TABF_ORIGIN}/${slug}/`,
        scheduleUrl: `${TABF_ORIGIN}/${slug}/Home/Schedule`,
        title,
        isRegistering,
      });
    }
  }

  return [...bySlug.values()];
}

/**
 * Parse https://svc.tabf.org.tw/<slug>/Home/Schedule to locate the Schedule PDF URL.
 */
export function parseSchedulePageHtml(html, baseUrl) {
  const source = String(html ?? '');
  const titleMatch = source.match(/<div\b[^>]*id\s*=\s*["']title["'][^>]*>([\s\S]*?)<\/div>/i);
  const pageTitle = titleMatch ? normalizeWhitespace(titleMatch[1].replace(/<[^>]+>/g, '')) : '';

  const section = source.match(/<section\b[^>]*id\s*=\s*["']ScheduleList["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || source;

  const candidates = [
    section.match(/<a\b[^>]*id\s*=\s*["'][^"']*hlSchedulePDFDownload[^"']*["'][^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')/i),
    section.match(/<a\b[^>]*href\s*=\s*(?:"([^"]+\.pdf[^"]*)"|'([^']+\.pdf[^']*)')/i),
  ];

  let pdfUrl = null;
  for (const m of candidates) {
    const rawHref = decodeHtmlEntities(m?.[1] || m?.[2] || '').trim();
    if (!rawHref) continue;
    try {
      const resolved = new URL(rawHref, baseUrl);
      if (resolved.protocol === 'https:' && resolved.hostname.toLowerCase() === 'svc.tabf.org.tw') {
        pdfUrl = resolved.href;
        break;
      }
    } catch {
      // ignore malformed URL
    }
  }

  return { pdfUrl, pageTitle };
}

const pad2 = (n) => String(n).padStart(2, '0');

function formatValidDateTime(rawYear, rawMonth, rawDay, rawHour, rawMinute, meridiem = '') {
  let year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1911) year += 1911;
  if (year < 2020 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const datePart = `${year}-${pad2(month)}-${pad2(day)}`;
  if (rawHour !== undefined && rawHour !== null && rawHour !== '') {
    let hh = Number(rawHour);
    const mm = Number(rawMinute ?? 0);
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return datePart;
    }
    if ((meridiem === '下午' || meridiem === '晚上') && hh >= 1 && hh <= 11) hh += 12;
    return `${datePart} ${pad2(hh)}:${pad2(mm)}`;
  }
  return datePart;
}

/**
 * Extract all ROC or Western dates (with optional HH:MM) from text in reading order.
 * Also expands shorthand ranges such as "115年12月5日(六)至6日(日)".
 */
function extractScheduleDates(input) {
  const s = toHalfWidth(input);
  const results = [];
  const fullDateRe =
    /(?:民國\s*)?(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*\([^)]{0,12}\))?(?:\s*(?:(上午|下午|中午|晚上)?\s*(\d{1,2})\s*:\s*(\d{2})|(上午|下午|中午|晚上|全日)))?/g;

  const matches = [...s.matchAll(fullDateRe)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const formatted = formatValidDateTime(m[1], m[2], m[3], m[5], m[6], m[4] || '');
    if (!formatted) continue;
    results.push({ start: formatted, period: m[7] || '' });

    // Check for shorthand range continuation right after this match (e.g., "至 6 日(日)17:00" or "至 12 月 6 日").
    const tailEnd = i + 1 < matches.length ? matches[i + 1].index : s.length;
    const tail = s.slice(m.index + m[0].length, tailEnd);
    const shortMatch = tail.match(
      /^\s*(?:起\s*)?(?:至|~|-|–|—)\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日(?:\s*\([^)]{0,12}\))?(?:\s*(?:(上午|下午|中午|晚上)?\s*(\d{1,2})\s*:\s*(\d{2})|(上午|下午|中午|晚上|全日)))?/,
    );
    if (shortMatch) {
      const endMonth = shortMatch[1] || m[2];
      const endFormatted = formatValidDateTime(m[1], endMonth, shortMatch[2], shortMatch[4], shortMatch[5], shortMatch[3] || '');
      if (endFormatted) results.push({ start: endFormatted, period: shortMatch[6] || '' });
    }
  }

  return results;
}

export function extractDateTimes(input) {
  return extractScheduleDates(input).map(({ start }) => start);
}

function isRemarkCell(cell) {
  const s = toHalfWidth(cell).replace(/\s+/g, '');
  if (!s) return false;
  if (/^1[.\u3001]/.test(s)) return true;
  if (/請至|請於|不另行|逾期|恕不受理|僅設|考區|公告於|錄取人員|以e-mail|以email|線上方式|視同|地點:|辦理報到|通過.*審查|※/.test(s)) {
    return true;
  }
  return false;
}

function isPlaceholderCell(cell) {
  const s = toHalfWidth(cell).replace(/\s+/g, '');
  return !s || /^[-–—]+$/.test(s);
}

function isFragmentedTimeCells(cells) {
  if (cells.length < 2) return false;
  for (let i = 0; i < cells.length; i++) {
    const s = toHalfWidth(cells[i]).trim();
    if (!s) continue;
    // Left fragment ends mid-date or has unclosed parenthesis.
    if (/(?:年|月|\()\s*$/.test(s)) return true;
    if (/\d{2,4}\s*年\s*\d{1,2}\s*月(?!\s*\d{1,2}\s*日)/.test(s)) return true;
    const opens = (s.match(/\(/g) || []).length;
    const closes = (s.match(/\)/g) || []).length;
    if (opens !== closes) return true;
    // Right fragment starts mid-date, weekday, or standalone clock time.
    if (i > 0 && /^(?:\d{1,2}\s*日|日|\(|星期|至\s*\d{1,2}\s*日|\d{1,2}:\d{2}$)/.test(s)) return true;
  }
  return false;
}

function stitchTimeCells(cells) {
  if (!cells.length) return '';
  if (cells.length === 1) return cells[0];
  const joined = cells.join(' ');
  const singleDates = extractDateTimes(joined);
  if (singleDates.length >= 1) {
    // Check if cell 0 had multiple lines (e.g., split two-line range across 2 cells).
    const lines0 = cells[0].split('\n').map((l) => l.trim()).filter(Boolean);
    const lines1 = cells[1].split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines0.length > 1 && lines0.length === lines1.length) {
      const zipped = lines0.map((l, idx) => `${l} ${lines1[idx]}`.replace(/至\s*(\d{1,2}\s*日)/g, '$1')).join('\n');
      const zippedDates = extractDateTimes(zipped);
      if (zippedDates.length > singleDates.length) return zipped;
    }
  }
  return joined;
}

/**
 * Extract the intact text slice immediately following a label (e.g. "報名期間")
 * from pdf-parse's visual-order getText() output, stopping before remarks or next row.
 */
function extractRangeFromFullText(fullText, anchorPattern) {
  const s = toHalfWidth(fullText || '');
  const m = s.match(anchorPattern);
  if (!m) return [];
  const after = s.slice(m.index + m[0].length, m.index + m[0].length + 450);
  const stopIdx = after.search(/\n\s*(?:1\.|請至|請於|書面履歷|測驗入場|筆試\s*入場|試題|書面審查|測驗日期|筆試日期|口試|面試|第\s*[二三]\s*[試階段])/);
  const slice = stopIdx >= 0 ? after.slice(0, stopIdx) : after;
  return extractDateTimes(slice);
}

function parseStageHeader(cell) {
  const compact = toHalfWidth(cell).replace(/\s+/g, '');
  const m = compact.match(/^第([一二三123])(試|階段)(?:[:：](.*))?$/);
  if (!m) return null;
  const numMap = { 一: 1, 二: 2, 三: 3, '1': 1, '2': 2, '3': 3 };
  const num = numMap[m[1]] || 1;
  const desc = m[3] || '';
  return {
    num,
    raw: compact,
    desc,
    hasWritten: /筆試/.test(desc),
    isReviewOnly: /書面審查|書審/.test(desc) && !/筆試/.test(desc),
    isInterview: /口試|面試|複試/.test(desc),
  };
}

function extractVagueSchedulePhrase(raw) {
  const clean = normalizeWhitespace(toHalfWidth(raw));
  if (!clean || isPlaceholderCell(clean)) return '';
  if (clean.length > 60) return '';
  if (/個別通知|另行通知|下旬|上旬|中旬|約.*週|擇期/.test(clean)) return clean;
  return '';
}

function parseRowsFromTables(tables, fullText) {
  const rows = [];
  let trackLabels = [];
  let stage = { num: 1, raw: '', desc: '', hasWritten: false, isReviewOnly: false, isInterview: false };

  for (const table of tables || []) {
    for (const rawRow of table || []) {
      if (!Array.isArray(rawRow) || rawRow.length < 2) continue;
      const cells = rawRow.map((c) => String(c ?? '').trim());
      const firstCompact = toHalfWidth(cells[0]).replace(/\s+/g, '');
      const secondCompact = toHalfWidth(cells[1] || '').replace(/\s+/g, '');

      // Skip table header row.
      if (firstCompact === '試別' && /要項/.test(secondCompact)) continue;

      // Capture track sub-header row (e.g. ["甄才類別", "書面審查類別", "筆試測驗類別"]).
      if (/^(?:甄才類別|甄選類別|甄試類別)$/.test(firstCompact) || /^(?:甄才類別|甄選類別|甄試類別)$/.test(secondCompact)) {
        const startIdx = /^(?:甄才類別|甄選類別|甄試類別)$/.test(firstCompact) ? 1 : 2;
        const labels = cells
          .slice(startIdx)
          .filter((c) => c && !isRemarkCell(c))
          .map((c) => normalizeWhitespace(c));
        if (labels.length >= 2) trackLabels = labels;
        continue;
      }

      // Check stage cell in column 0.
      const parsedStage = parseStageHeader(cells[0]);
      let itemLabel;
      let restCells;
      if (parsedStage) {
        stage = parsedStage;
        itemLabel = cells[1] || '';
        restCells = cells.slice(2);
      } else {
        itemLabel = cells[0] || '';
        restCells = cells.slice(1);
      }

      const compactLabel = toHalfWidth(itemLabel).replace(/\s+/g, '');
      if (!compactLabel) continue;

      // Separate trailing remark cell when present.
      let timeCells = [...restCells];
      let noteCell = '';
      if (timeCells.length >= 2 && isRemarkCell(timeCells[timeCells.length - 1])) {
        noteCell = timeCells.pop();
      }
      // Trim trailing empty cells, keep positional info if multi-track.
      const nonPlaceholder = timeCells.filter((c) => !isPlaceholderCell(c));

      rows.push({
        stage: { ...stage },
        label: compactLabel,
        rawLabel: normalizeWhitespace(itemLabel),
        timeCells,
        nonPlaceholder,
        noteCell,
        trackLabels: [...trackLabels],
      });
    }
  }

  // Fallback when pdf-parse getTable() finds no bordered table.
  if (rows.length === 0 && fullText) {
    return parseRowsFromPlainText(fullText);
  }
  return rows;
}

function parseRowsFromPlainText(fullText) {
  const lines = toHalfWidth(fullText)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [];
  let stage = { num: 1, raw: '', desc: '', hasWritten: false, isReviewOnly: false, isInterview: false };

  const anchorLabels = [
    '報名期間',
    '網路報名',
    '書面履歷上傳截止時間',
    '第一階段結果查詢',
    '數理邏輯測驗',
    '筆試日期',
    '試題與選擇題解答公告',
    '試題及選擇題解答公告',
    '書面審查暨筆試測驗結果查詢',
    '書面審查結果查詢',
    '第一試測驗結果查詢',
    '測驗結果查詢',
    '口試日期',
    '面試日期',
    '專業知識評量及面試日期',
    '測驗日期',
    '錄取名單公告',
    '甄試結果查詢',
    '甄選結果查詢',
    '網路查詢甄試結果通知書',
  ];

  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].replace(/\s+/g, '');
    const st = parseStageHeader(compact);
    if (st) {
      stage = st;
      continue;
    }
    const matchedLabel = anchorLabels.find((lbl) => compact.startsWith(lbl));
    if (matchedLabel) {
      const window = lines.slice(i, i + 5);
      const end = window.findIndex((line, index) => index > 0 && (
        parseStageHeader(line) || isRemarkCell(line) ||
        anchorLabels.some((label) => line.replace(/\s+/g, '').startsWith(label))
      ));
      const windowText = (end < 0 ? window : window.slice(0, end)).join('\n');
      const dates = extractDateTimes(windowText);
      if (dates.length) {
        rows.push({
          stage: { ...stage },
          label: matchedLabel,
          rawLabel: matchedLabel,
          timeCells: [windowText],
          nonPlaceholder: [windowText],
          noteCell: '',
          trackLabels: [],
        });
      }
    }
  }
  return rows;
}

/**
 * Convert extracted PDF schedule table + text into a CalendarEvent payload
 * matching server/ratings-api.mjs calendarFields.
 */
export function parseSchedulePdfData({ tables = [], text = '', title, url, slug }) {
  const rows = parseRowsFromTables(tables, text);

  const event = {
    externalKey: `tabf:${String(slug).toLowerCase()}`,
    org: normalizeWhitespace(title),
    signupStart: '',
    signupEnd: '',
    writtenExam: '',
    answerKey: '',
    writtenResult: '',
    interview: '',
    interview2: '',
    finalResult: '',
    link: url,
    note: '',
    scheduleDetails: [],
  };

  const addDetail = (kind, start, { label = '', end = '', period = '' } = {}) => {
    if (!start || event.scheduleDetails.some((item) =>
      item.kind === kind && item.start === start && item.end === end &&
      item.label === label && item.period === period
    )) return;
    event.scheduleDetails.push({ kind, label, start, end, period });
  };

  const notes = [];
  const addNote = (entry) => {
    const cleaned = normalizeWhitespace(entry)
      .replace(/([\u4e00-\u9fff，。、：；])\s+([\u4e00-\u9fff])/g, '$1$2')
      .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff，。、：；])/g, '$1$2');
    if (cleaned && !notes.includes(cleaned)) notes.push(cleaned);
  };
  const addPrefixedNote = (prefix, body) => {
    const cleanBody = normalizeWhitespace(body);
    if (!cleanBody) return;
    addNote(cleanBody.startsWith(prefix) ? cleanBody : `${prefix}：${cleanBody}`);
  };

  const hasAnyWrittenStage = rows.some(
    (r) => r.stage.hasWritten || /筆試日期|試題.*解答/.test(r.label),
  );
  const hasThirdStage = rows.some((row) => row.stage.num === 3);
  const uploadRequired = rows.some(({ label, noteCell }) =>
    label.includes('報名期間') && /上傳.*視同未完成報名/.test(noteCell.replace(/\s+/g, '')),
  );

  for (const row of rows) {
    const { stage, label, timeCells, nonPlaceholder, trackLabels } = row;
    const fragmented = isFragmentedTimeCells(nonPlaceholder);

    // 1. 報名期間
    if (/報名期間|網路報名|線上報名/.test(label) && !/說明|流程|方式/.test(label)) {
      let dates = [];
      let trackRanges = [];

      if (!fragmented && nonPlaceholder.length >= 2) {
        // Potential multi-track distinct registration windows (e.g. 合庫 書面審查 vs 筆試).
        for (let i = 0; i < timeCells.length; i++) {
          const d = extractDateTimes(timeCells[i]);
          if (d.length >= 2) {
            trackRanges.push({
              track: trackLabels[i] || `類別${i + 1}`,
              start: d[0],
              end: d[d.length - 1],
            });
          }
          dates.push(...d);
        }
      }

      if (fragmented || dates.length < 2) {
        const textDates = extractRangeFromFullText(text, /報名期間/);
        if (textDates.length >= 2) {
          dates = textDates;
        } else {
          dates = extractDateTimes(stitchTimeCells(nonPlaceholder));
        }
      }

      if (dates.length >= 1) {
        const sortedStarts = trackRanges.length
          ? trackRanges.map((t) => t.start).sort()
          : [dates[0]];
        const sortedEnds = trackRanges.length
          ? trackRanges.map((t) => t.end).sort()
          : dates.length >= 2
            ? [dates[dates.length - 1]]
            : [];

        event.signupStart = sortedStarts[0];
        if (sortedEnds.length) event.signupEnd = sortedEnds[sortedEnds.length - 1];

        const uniqueRanges = new Set(trackRanges.map((t) => `${t.start}~${t.end}`));
        if (uniqueRanges.size >= 2) {
          for (const { track, start, end } of trackRanges) {
            const name = track.replace(/書面審查類別/g, '書審類').replace(/筆試測驗類別/g, '筆試類');
            addDetail('signup', start, { label: `${name}報名`, end });
          }
        } else {
          addDetail('signup', event.signupStart, { end: event.signupEnd });
        }
      }
      continue;
    }

    // 2. 試題與選擇題解答公告
    if (/試題.*解答|選擇題解答/.test(label) && !/疑義/.test(label)) {
      const dates = extractDateTimes(stitchTimeCells(nonPlaceholder));
      if (dates[0] && !event.answerKey) {
        event.answerKey = dates[0];
        addDetail('answerKey', dates[0]);
      }
      continue;
    }

    if (/上傳.*截止/.test(label)) {
      const deadline = extractDateTimes(stitchTimeCells(nonPlaceholder)).at(-1);
      addDetail('upload', deadline, { label: '文件上傳截止' });
      if (deadline && uploadRequired) addNote('逾期未上傳文件視同未完成報名。');
      continue;
    }

    if (/^第一階段.*視訊(?:面試|面談)/.test(label)) {
      const approximate = toHalfWidth(nonPlaceholder.join(' ')).match(/\d{1,2}\s*月\s*(?:上旬|中旬|下旬)/)?.[0];
      if (approximate) {
        const excluded = /除儲備菁英人才A、儲備菁英人才B毋須參加/.test(label) ? '（儲備菁英人才 A、B 免參加）' : '';
        addPrefixedNote('第一階段視訊面試', `${approximate.replace(/\s+/g, '')}起陸續個別通知${excluded}`);
      }
      continue;
    }

    // 3. Skip non-calendar administrative steps (admissions pass, appeals, uploads, etc.)
    // Exception: capture Stage-3 vague interview notice (e.g. 彰銀 第三階段口試(複試)).
    if (/入場通知書|疑義|複查|上傳|履歷|適性測驗|適性評量|視訊面談|注意事項|列印|繳費|繳款|退費/.test(label)) {
      if (stage.num === 3 && /複試|口試|面試/.test(stage.raw + label)) {
        const vague = extractVagueSchedulePhrase(nonPlaceholder.join(' '));
        if (vague) addNote(`第三階段口試(複試)：${vague}`);
      }
      continue;
    }

    // 4. Online test with its own window and applicable groups.
    if (/數理邏輯測驗|線上測驗/.test(label)) {
      const dates = extractDateTimes(stitchTimeCells(nonPlaceholder));
      const test = label.includes('數理邏輯測驗') ? '線上數理邏輯測驗' : '線上測驗';
      const groups = /僅儲備菁英人才A、儲備菁英人才B/.test(label) ? '（僅儲備菁英人才 A、B）' : '';
      addDetail('onlineTest', dates[0], { label: test + groups, end: dates.length > 1 ? dates.at(-1) : '' });
      continue;
    }

    // Extract dates for remaining substantive schedule rows.
    const stitched = stitchTimeCells(nonPlaceholder);
    const sittings = extractScheduleDates(stitched);
    const dates = sittings.map(({ start }) => start);
    const vague = dates.length === 0 ? extractVagueSchedulePhrase(stitched) : '';

    // 5. 筆試日期
    if (
      /筆試日期/.test(label) ||
      (stage.num === 1 && !stage.isReviewOnly && !stage.isInterview && /^(?:測驗日期|考試日期|第一試日期)$/.test(label))
    ) {
      if (dates[0] && !event.writtenExam) event.writtenExam = dates[0];
      for (const { start, period } of sittings) addDetail('written', start, { period });
      continue;
    }

    // 6. 第二試 / 第三試 口試・面試日期
    const isThirdStageInterview =
      stage.num === 3 || /二面|第二次(?:口試|面試)|口試\(複試\)|面試\(複試\)/.test(stage.raw + label);
    const isInterviewRow =
      /口試日期|面試日期|面談日期|評量及面試日期|複試日期/.test(label) ||
      (stage.num >= 2 && /^(?:測驗日期|考試日期|口試|面試|面試日期及通知)$/.test(label));

    if (isInterviewRow) {
      const kind = isThirdStageInterview ? 'interview2' : 'interview';
      const interviewLabel = stage.desc.includes('體能') ? '口試／體能測驗' : '';
      for (const { start, period } of sittings) addDetail(kind, start, { period, label: interviewLabel });
      if (isThirdStageInterview) {
        if (dates[0] && !event.interview2) event.interview2 = dates[0];
        else if (vague) addPrefixedNote('二面', vague);
      } else {
        if (dates[0] && !event.interview) event.interview = dates[0];
        else if (vague) addPrefixedNote('面試', vague);
      }
      continue;
    }

    // 7. 筆試結果公佈 / 第一階段結果
    if (
      stage.num === 1 &&
      /(?:結果|成績)/.test(label) &&
      !/錄取名單|最終/.test(label)
    ) {
      const isWrittenResult = (stage.hasWritten || /筆試|測驗/.test(label)) && (hasAnyWrittenStage || /筆試/.test(label));
      if (isWrittenResult) {
        if (dates[0] && !event.writtenResult) {
          event.writtenResult = dates[0];
          addDetail('writtenResult', dates[0], {
            label: /書面審查|書審/.test(label) ? '書審／筆試結果' : '',
          });
        }
      } else if (dates[0]) {
        addDetail('stageResult', dates[0], { label: row.rawLabel.replace(/\s+/g, '') });
      } else if (vague) {
        addPrefixedNote(row.rawLabel.replace(/\s+/g, ''), vague);
      }
      continue;
    }

    // 8. 放榜 / 最終錄取名單公告
    if (hasThirdStage && stage.num === 2 && /口試成績/.test(label) && dates[0]) {
      addDetail('interviewResult', dates[0], { label: '第二階段口試成績（三階段類組）' });
      if (/甄試結果|甄選結果|錄取名單/.test(label)) {
        event.finalResult = dates[0];
        addDetail('final', dates[0], { label: '甄選結果（兩階段類組）' });
      }
      continue;
    }
    if (/錄取名單|榜示|甄試結果|甄選結果|放榜|最終結果/.test(label) || (stage.num >= 2 && /(?:結果|成績)/.test(label))) {
      if (dates[0]) {
        event.finalResult = dates[0];
        addDetail('final', dates[0]);
      } else if (vague) addPrefixedNote('錄取結果', vague);
      continue;
    }
  }

  if (notes.length) {
    event.note = notes.join('；').slice(0, 280);
  }

  return event;
}

export function hasAnyCalendarDate(event) {
  const fields = [
    'signupStart',
    'signupEnd',
    'writtenExam',
    'answerKey',
    'writtenResult',
    'interview',
    'interview2',
    'finalResult',
  ];
  return fields.some((f) => /^\d{4}-\d{2}-\d{2}/.test(String(event?.[f] || ''))) ||
    Boolean(event?.scheduleDetails?.length);
}
