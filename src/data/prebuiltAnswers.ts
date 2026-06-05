import { focusLabel } from '../lib/scoring';
import type { CandidateProfile, InterviewQuestion, QuestionTag } from './types';

const tagAdvice: Partial<Record<QuestionTag, string>> = {
  motivation: '把動機扣回公股銀行的穩健、服務、合規與長期職涯，不要只說穩定。',
  freshGraduate: '新鮮人要強調學習速度、細心度、服務經驗，以及願意從櫃檯基本功做起。',
  experienced: '有工作經驗時，要把過去的責任感、跨部門溝通或客戶應對轉成銀行可用的能力。',
  noBankExperience: '沒有銀行經驗不需要硬裝懂，重點是說清楚補足專業落差的方法。',
  bankExperience: '有銀行經驗要講出實務細節，例如臨櫃流程、風險意識、客戶溝通與內控觀念。',
  sales: '銷售題要避開強迫推銷，改成需求了解、適合度評估、風險揭露與長期信任。',
  customerService: '客戶題可以用傾聽、同理、釐清需求、依規定處理、回報主管的順序回答。',
  compliance: '法遵題的底線是依法令與內規處理，遇到壓力也不能省略確認、紀錄與通報。',
  fintech: '數位金融題要同時看到效率、資安、普惠服務與高齡客戶的適應問題。',
  marketNews: '時事題要用「事件、對銀行影響、我的觀察」三段式，避免只背新聞標題。',
  scenario: '情境題建議用先穩定現場、排序風險、回報主管、事後檢討的架構。',
  manager: '主管題要表現尊重權責，但也要有原則、紀錄與適度向上溝通。',
  teamwork: '團隊題要凸顯合作、補位、溝通與不把問題推給別人的態度。',
  pressure: '抗壓題要講具體做法，例如拆解任務、確認優先順序、維持服務品質。',
};

const categoryFrames: Record<string, string> = {
  重要十大問題: '這類題目通常是面試官判斷「人選是否穩定、是否理解銀行工作」的核心題。',
  銀行基本知識: '這類題目要答得精準，先給定義，再補一個臨櫃或銀行實務上的例子。',
  銀行報考動機與工作內容: '回答時要把個人動機、職務理解、願意從基礎做起三件事連在一起。',
  銀行業務推廣: '業務推廣題不能只講成交，要把客戶需求、商品適合度與風險揭露一起講清楚。',
  與客戶互動: '客戶互動題最重要的是服務態度、情緒穩定，以及在規範內解決問題。',
  金融科技: '金融科技題適合從便利性、風險控管、資安與分眾服務切入。',
  實習與證照: '這類題目要把經驗或證照轉換成實際工作能力，而不是只列清單。',
  人格特質與過去經驗: '人格特質題要用一個具體例子支撐，避免只講抽象形容詞。',
  抗壓與情緒管理: '抗壓題要讓面試官相信你能在繁忙櫃檯維持正確率與服務品質。',
  與主管應對: '主管題要呈現尊重、溝通、紀錄與遵守制度的平衡。',
  與同事應對相處: '同事題要凸顯團隊合作與成熟溝通，不要把重點放在抱怨。',
  未來規劃: '未來規劃題要有方向，但也要表現願意先把基礎業務做好。',
  洗錢防制: '洗防題要站穩法遵底線，回答中最好出現 KYC、異常交易、通報或內規概念。',
  最新時事與財經新聞: '時事題建議用近期事件連到利率、匯率、房市、風險控管或銀行業務。',
};

const profileLines = (profile: CandidateProfile) => {
  const lines: string[] = [];

  if (profile.isFreshGraduate === 'yes' || profile.workYears === 'none' || profile.ageRange === 'under24') {
    lines.push('你的版本可以走新鮮人路線：強調學習速度、細心、願意從基礎櫃檯流程扎根。');
  } else if (profile.workYears === '2to5' || profile.workYears === '5plus' || profile.ageRange === '30plus') {
    lines.push('你的版本可以走轉職或有年資路線：把過去工作中的責任感、溝通與抗壓能力轉成銀行工作優勢。');
  }

  if (profile.hasBankExperience === 'yes') {
    const yearText = profile.bankYears === 'under1' ? '未滿一年' : profile.bankYears === '1to3' ? '一到三年' : '三年以上';
    lines.push(`因為你有${yearText}銀行經驗，答案要多放實務語彙，例如內規、覆核、客戶風險屬性、洗防與服務流程。`);
  } else {
    lines.push('如果沒有銀行經驗，答案要坦白但積極：承認需要補足專業，並說明會用證照、法規、產品知識與前輩請益快速到位。');
  }

  if (profile.hasSalesExperience === 'yes') {
    lines.push('你有銷售經驗時，可以強調不是硬推商品，而是先理解需求，再做合適推薦與風險說明。');
  } else {
    lines.push('如果沒有銷售經驗，可以把重點放在願意學習、重視信任關係，並用服務品質累積客戶接受度。');
  }

  if (profile.targetFocus !== 'balanced') {
    lines.push(`本次準備重點是「${focusLabel[profile.targetFocus]}」，回答時可以主動把例子扣回這個方向。`);
  }

  return lines.slice(0, 4);
};

const strongestAdvice = (question: InterviewQuestion) => {
  const advice = question.tags.map((tag) => tagAdvice[tag]).filter(Boolean);
  return advice.length ? advice.slice(0, 2) : [categoryFrames[question.category] || '這題要用具體例子回答，讓面試官聽得到你的判斷方式。'];
};

const modelAnswer = (question: InterviewQuestion, profile: CandidateProfile) => {
  const profileHint = profile.hasBankExperience === 'yes'
    ? '我會把過去接觸客戶、遵循內規與處理細節的經驗帶進新職務'
    : '雖然我還需要補足銀行實務，但我會用主動學習、確實覆核與請益前輩來縮短落差';
  const salesHint = profile.hasSalesExperience === 'yes'
    ? '在推廣業務時，我會先確認客戶需求與風險承受度，再說明適合的商品'
    : '面對業務推廣，我會先把產品與規範學熟，從服務與信任感開始累積';
  const focusHint = profile.targetFocus === 'balanced'
    ? '所以我的回答會兼顧服務態度、合規意識與長期穩定度'
    : `所以我會特別扣回${focusLabel[profile.targetFocus]}，讓回答更聚焦`;

  return [
    '示範回答：',
    `「我會先把這題拆成工作理解、客戶服務與風險控管三個面向。以「${question.question}」來說，我不會只給一個口號式答案，而是會先說明我理解銀行工作需要高度細心、守規範，也需要面對客戶時保持穩定。${profileHint}。${salesHint}。${focusHint}。如果進入銀行，我會先把基本流程、商品知識與內控制度學扎實，遇到不確定的情況先查規定、向主管或資深同仁確認，確保服務效率與正確性並重。」`,
  ].join('\n');
};

export function generateQuestionAnswer(question: InterviewQuestion, profile: CandidateProfile): string {
  return [
    categoryFrames[question.category] || '這題要用具體例子回答，讓面試官聽得到你的判斷方式。',
    '',
    '答題重點：',
    ...strongestAdvice(question).map((line) => `- ${line}`),
    ...profileLines(profile).map((line) => `- ${line}`),
    '',
    modelAnswer(question, profile),
  ].join('\n');
}
