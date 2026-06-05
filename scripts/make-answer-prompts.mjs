import { mkdir, writeFile } from 'node:fs/promises';
import { interviewQuestions } from '../src/data/questions.generated.ts';

const outDir = 'answer_prompts';
const chunkSize = Number(process.argv[2] || 10);

const variantKeys = [
  'freshGraduate',
  'experienced',
  'hasBankExperience',
  'noBankExperience',
  'hasSalesExperience',
  'noSalesExperience',
  'focusMotivation',
  'focusSales',
  'focusService',
  'focusCompliance',
  'focusNews',
];

await mkdir(outDir, { recursive: true });

for (let i = 0; i < interviewQuestions.length; i += chunkSize) {
  const chunk = interviewQuestions.slice(i, i + chunkSize);
  const chunkNo = String(Math.floor(i / chunkSize) + 1).padStart(2, '0');
  const prompt = [
    '你是台灣公股銀行面試輔導老師。請針對以下題目產生「每題專屬」預製答案 JSON。',
    '',
    '重要規則：',
    '- 只能輸出 JSON object，不要 markdown，不要說明文字。',
    '- key 必須是題號字串。',
    '- 每題都要有 keyPoints、answer、variants。',
    '- answer 必須針對該題本身回答，不能用同一套模板套全部題目。',
    '- answer 用第一人稱，繁體中文，約 180-260 字。',
    '- keyPoints 每題 3 點，每點要具體。',
    '- variants 是依考生條件微調的補充句，不要重複 answer。',
    '- variants 可使用這些 key：',
    variantKeys.join(', '),
    '',
    'JSON 格式範例：',
    JSON.stringify(
      {
        '1': {
          keyPoints: ['先正面說明離職原因', '連到銀行職涯', '補上已做的準備'],
          answer: '完整示範回答...',
          variants: {
            freshGraduate: '如果是應屆畢業生，要改成第一份工作的職涯選擇。',
            noBankExperience: '如果沒有銀行經驗，要補上如何補足實務落差。',
          },
        },
      },
      null,
      2,
    ),
    '',
    '題目：',
    ...chunk.map((question) =>
      [
        `題號：${question.id}`,
        `分類：${question.category}`,
        `難度：${question.difficulty}`,
        `標籤：${question.tags.join(', ') || '無'}`,
        `題目：${question.question}`,
      ].join('\n'),
    ),
    '',
    '請輸出這一批題目的 JSON object。',
  ].join('\n');

  await writeFile(`${outDir}/chunk-${chunkNo}.md`, prompt);
}

console.log(`Generated ${Math.ceil(interviewQuestions.length / chunkSize)} prompt files in ${outDir}/`);
