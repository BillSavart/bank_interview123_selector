import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pdfPath = path.join(rootDir, 'public', '20260515bank123.pdf');
const outputPath = path.join(rootDir, 'src', 'data', 'questions.generated.ts');

const headingPattern = /^(壹|貳|參|肆|伍|陸|柒|捌|玖|拾|壹拾|一|二|三|四|五|六|七|八|九|十).*[、．]/;
const questionPattern = /^(\d{1,3})[.、．]?\s*(.+)$/;

const containsAny = (value, terms) => terms.some((term) => value.includes(term));

const normalizeCategory = (line) =>
  line
    .replace(/^壹拾/g, '拾')
    .replace(/^[壹貳參肆伍陸柒捌玖拾]+[、．]/, '')
    .trim();

const getTags = (question, category, id) => {
  const text = `${question} ${category}`.toLowerCase();
  const tags = new Set();

  if (id <= 10) tags.add('top10');
  if (containsAny(text, ['為什麼', '動機', '應徵', '報考', '錄取'])) tags.add('motivation');
  if (containsAny(text, ['大學', '畢業', '科目', '社團', '升學', '研究所', '實習', '應屆'])) tags.add('freshGraduate');
  if (containsAny(text, ['上一份工作', '離職', '轉換跑道', '工作經驗', '過去', '職涯'])) tags.add('experienced');
  if (containsAny(text, ['沒有經驗', '無銀行', '非本科系', '白紙'])) tags.add('noBankExperience');
  if (containsAny(text, ['銀行經驗', '實習', '櫃檯', '存匯', '業務', '部門'])) tags.add('bankExperience');
  if (containsAny(text, ['銷售', '推銷', '行銷', '業績', '產品', '金融商品', '理專', '保險', '債券'])) tags.add('sales');
  if (containsAny(text, ['客戶', '客人', '奧客', '客訴', 'vip', '服務', '大聲', '抱怨'])) tags.add('customerService');
  if (containsAny(text, ['洗錢', '法規', '內控', '內部控制', '金管會', '通報', '防詐', '違法', '規定'])) tags.add('compliance');
  if (containsAny(text, ['數位', '金融科技', '行動支付', '台灣pay', '開放銀行'])) tags.add('fintech');
  if (containsAny(text, ['央行', '升息', '降息', '匯率', '房市', '通膨', '新聞', '關稅', '碳', '美元', '日幣'])) tags.add('marketNews');
  if (containsAny(text, ['如果', '遇到', '怎麼處理', '如何處理', '怎麼辦'])) tags.add('scenario');
  if (containsAny(text, ['主管', '長官'])) tags.add('manager');
  if (containsAny(text, ['同事', '團隊'])) tags.add('teamwork');
  if (containsAny(text, ['壓力', '挫折', '抗壓', '情緒', '不合理'])) tags.add('pressure');

  return [...tags].sort();
};

const getDifficulty = (question, id) => {
  if (id <= 10) return '核心必練';
  if (containsAny(question, ['央行', '洗錢', '內部控制', '金管會', '外匯', '升息', '降息', '匯率'])) return '進階';
  if (containsAny(question, ['如果', '遇到', '推銷', '銷售', '客戶', '主管'])) return '情境題';
  return '基礎';
};

const parseQuestions = async () => {
  const buffer = await fs.readFile(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  const lines = result.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^-- \d+ of \d+ --$/.test(line))
    .filter((line) => !line.startsWith('為反應最新口試趨勢'));

  const questions = [];
  let category = '重要十大問題';
  let current = null;

  for (const line of lines) {
    if (headingPattern.test(line)) {
      if (current) {
        questions.push(current);
        current = null;
      }
      category = normalizeCategory(line);
      continue;
    }

    const match = line.match(questionPattern);
    if (match) {
      if (current) questions.push(current);
      current = {
        id: Number(match[1]),
        category,
        question: match[2].trim(),
      };
      continue;
    }

    if (current) {
      current.question = `${current.question} ${line}`.replace(/\s+/g, ' ').trim();
    }
  }

  if (current) questions.push(current);

  return questions.map((item) => ({
    ...item,
    difficulty: getDifficulty(item.question, item.id),
    tags: getTags(item.question, item.category, item.id),
  }));
};

const questions = await parseQuestions();
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  `// Auto-generated from public/20260515bank123.pdf. Run \`npm run extract:questions\` after replacing the PDF.\n` +
    `import type { InterviewQuestion } from './types';\n\n` +
    `export const interviewQuestions: InterviewQuestion[] = ${JSON.stringify(questions, null, 2)};\n`,
  'utf8',
);

console.log(`Generated ${questions.length} questions at ${path.relative(rootDir, outputPath)}`);
