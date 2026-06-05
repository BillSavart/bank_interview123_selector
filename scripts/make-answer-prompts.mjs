import { mkdir, writeFile } from 'node:fs/promises';
import { interviewQuestions } from '../src/data/questions.generated.ts';

const outDir = 'answer_prompts';
const chunkSize = Number(process.argv[2] || 10);

const variantKeys = [
  'ageUnder24',
  'age25to29',
  'age30plus',
  'workNone',
  'workUnder2',
  'work2to5',
  'work5plus',
  'freshGraduateYes',
  'freshGraduateNo',
  'bankExperienceYes',
  'bankExperienceNo',
  'bankYearsUnder1',
  'bankYears1to3',
  'bankYears3plus',
  'salesExperienceYes',
  'salesExperienceNo',
  'focusMotivation',
  'focusSales',
  'focusService',
  'focusCompliance',
  'focusNews',
];

const emptyEntry = (question) => ({
  meta: {
    category: question.category,
    difficulty: question.difficulty,
    tags: question.tags,
    question: question.question,
  },
  keyPoints: ['', '', ''],
  answer: '',
  variants: Object.fromEntries(variantKeys.map((key) => [key, ''])),
});

const questionBlock = (question) =>
  [
    `題號：${question.id}`,
    `分類：${question.category}`,
    `難度：${question.difficulty}`,
    `標籤：${question.tags.join(', ') || '無'}`,
    `題目：${question.question}`,
  ].join('\n');

const promptForQuestions = (questions, mode) =>
  [
    '你是台灣公股銀行面試輔導老師。請針對以下題目產生每題專屬的 answer_bank.json 內容。',
    '',
    '重要規則：',
    '- 只能輸出 JSON object，不要 markdown，不要說明文字。',
    '- key 必須是題號字串。',
    '- 每題都要有 meta、keyPoints、answer、variants。',
    '- meta 請原樣保留題目的 category、difficulty、tags、question。',
    '- answer 必須針對該題本身回答，不能用同一套模板套全部題目。',
    '- answer 用第一人稱，繁體中文，約 180-260 字。',
    '- keyPoints 每題 3 點，每點要具體。',
    '- variants 是依考生條件微調的補充句，不要重複主答案。',
    '- 如果某個條件不適合這題，也要給一句自然可用的調整方向，不要留空。',
    '- variants 必須完整包含這些 key：',
    variantKeys.join(', '),
    '',
    '欄位語意：',
    '- ageUnder24 / age25to29 / age30plus：年齡版本補充。',
    '- workNone / workUnder2 / work2to5 / work5plus：工作年資版本補充。',
    '- freshGraduateYes / freshGraduateNo：是否應屆畢業生補充。',
    '- bankExperienceYes / bankExperienceNo：是否有銀行經驗補充。',
    '- bankYearsUnder1 / bankYears1to3 / bankYears3plus：有銀行經驗時的銀行年資補充。',
    '- salesExperienceYes / salesExperienceNo：是否有銷售經驗補充。',
    '- focusMotivation / focusSales / focusService / focusCompliance / focusNews：準備重點補充。',
    '',
    'JSON 格式範例：',
    JSON.stringify(
      {
        '1': {
          meta: {
            category: '重要十大問題',
            difficulty: '核心必練',
            tags: ['experienced', 'top10'],
            question: '上一份工作離職的原因/為什麼會想轉換跑道?',
          },
          keyPoints: ['先正面說明離職原因', '連到銀行職涯', '補上已做的準備'],
          answer: '這題專屬完整示範回答...',
          variants: Object.fromEntries(variantKeys.map((key) => [key, `${key} 條件下的補充句。`])),
        },
      },
      null,
      2,
    ),
    '',
    mode === 'single' ? '題目：' : '題目清單：',
    ...questions.map(questionBlock),
    '',
    mode === 'single' ? '請輸出這一題的 JSON object。' : '請輸出這一批題目的 JSON object。',
  ].join('\n');

await mkdir(outDir, { recursive: true });

const template = Object.fromEntries(interviewQuestions.map((question) => [String(question.id), emptyEntry(question)]));
await writeFile('answer_bank.template.json', `${JSON.stringify(template, null, 2)}\n`);

for (const question of interviewQuestions) {
  const fileNo = String(question.id).padStart(3, '0');
  await writeFile(`${outDir}/question-${fileNo}.md`, promptForQuestions([question], 'single'));
}

for (let i = 0; i < interviewQuestions.length; i += chunkSize) {
  const chunk = interviewQuestions.slice(i, i + chunkSize);
  const chunkNo = String(Math.floor(i / chunkSize) + 1).padStart(2, '0');
  await writeFile(`${outDir}/chunk-${chunkNo}.md`, promptForQuestions(chunk, 'chunk'));
}

console.log(`Generated answer_bank.template.json, ${interviewQuestions.length} single-question prompts, and ${Math.ceil(interviewQuestions.length / chunkSize)} chunk prompts in ${outDir}/`);
