export type OfficialDocScenarioType = 'INTERNAL' | 'EXTERNAL' | 'PARALLEL' | 'UPWARD' | 'DOWNWARD';

export type NumberingStyle = 'ARABIC_DOT' | 'CHINESE_COMMA';
export type OfficialDocType = '簽' | '函';

export type OfficialDocQuestion = {
  id: string;
  title: string;
  source_note?: string;
  ai_reference_model?: string;
  reference_speed?: string;
  reference_security?: string;
  reference_attachments?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  document_type: OfficialDocType;
  scenario_type: OfficialDocScenarioType;
  scenario: string;
  intro_instruction?: string;
  supplemental_instruction?: string;
  sender: string;
  receiver: string;
  expected_purpose: string;
  required_facts: string[];
  required_actions: string[];
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  expected_closing_phrase: string;
  numbering_style: NumberingStyle;
  reference_answer_subject: string;
  reference_answer_description: string;
  reference_answer_method: string;
  reference_answer_full_text?: string;
};

export type OfficialDocAnswer = {
  subject: string;
  description: string;
  method: string;
  speed: string;
  security: string;
  attachments: string;
  department: string;
};

export const officialDocQuestions: OfficialDocQuestion[] = [
  {
    id: 'sign-001',
    title: '市政會議交通車租賃及經費勻支',
    source_note: '114年土地銀行考古題',
    ai_reference_model: 'GPT 5.5',
    difficulty: 'medium',
    document_type: '簽',
    scenario_type: 'UPWARD',
    intro_instruction: '請試擬簽稿，陳核辦理以下公務事宜。',
    scenario:
      '○○市政府秘書處機要組奉命，為加強深化市政建設成果，114年○○月○○日第○○次市政會議，擬租用大型車輛○輛（接送時間、地點如附件一），請各單位首長與同仁共乘租用車前往○○國際會議中心參加會議；並擬由「事務管理—庶務管理—業務」項下，勻支交通租賃等衍生經費（經費支出預算表如附件二）。經簽奉核可後，辦理相關行政作業，並行文各單位配合。',
    sender: '秘書處機要組',
    receiver: '市長',
    expected_purpose: '陳核市政會議交通車租賃、經費勻支及後續行政作業',
    required_facts: ['第○○次市政會議', '大型車輛○輛', '○○國際會議中心', '附件一', '附件二', '經費勻支科目'],
    required_actions: ['租用大型車輛', '勻支交通租賃等經費', '辦理行政作業', '行文各單位配合'],
    contact_person: '○○○',
    contact_phone: '',
    contact_email: '',
    expected_closing_phrase: '陳請核示',
    numbering_style: 'ARABIC_DOT',
    reference_answer_subject:
      '為辦理本府114年○○月○○日第○○次市政會議，擬租用大型車輛○輛接送各單位首長及同仁前往○○國際會議中心參加會議，並由「事務管理—庶務管理—業務」項下勻支交通租賃等相關經費，簽請核示。',
    reference_answer_description:
      '一、依奉示辦理。\n二、為加強深化市政建設成果，本府訂於114年○○月○○日召開第○○次市政會議，會議地點為○○國際會議中心。\n三、為利各單位首長及同仁準時出席，並維護行程安全與行政效率，擬租用大型車輛○輛，接送時間及地點詳如附件一。\n四、本案所需交通租賃等衍生經費，擬由「事務管理—庶務管理—業務」項下勻支，經費支出預算表詳如附件二。',
    reference_answer_method:
      '一、本案如奉核可，擬即辦理車輛租用、路線安排及相關行政作業。\n二、另擬函請本府各單位配合轉知所屬首長及同仁，依附件所列時間、地點集合，並共乘租用車輛前往會議地點。\n三、奉核後續辦。',
  },
  {
    id: 'bot-001',
    title: '中老年人帳戶異動即時通報機制',
    source_note: '臺灣銀行114年一招考古題',
    ai_reference_model: 'GPT 5.5',
    reference_speed: '普通',
    reference_security: '',
    reference_attachments: '無',
    difficulty: 'medium',
    document_type: '函',
    scenario_type: 'INTERNAL',
    scenario:
      '有鑑於臺灣金融詐騙金額屢破新高，詐騙手法層出不窮，其中又以中老年人假投資詐騙案為最，已有許多因此被騙光終生積蓄與退休金之受害者。內政部警政署為提高詐騙防禦層級，自即日起與各大金融機構（銀行）設立「中老年人帳戶異動頻繁即時訊息連線通報機制」，請銀行從業人員加強配合審查流程，注意資金異常流動，為預防詐騙案進行多一層保護機制，以確保人民生活財產安全。臺灣銀行為強化此通報機制與審查流程，已即時更新行內帳戶資金異動訊息通報系統，請各分行儘速強化同仁熟悉通報流程的訓練。',
    supplemental_instruction:
      '請參考以上資料，代業務承辦人李順心（公務電話：02-23493456，公務電子郵件：abccc@mail.bot.com.tw）發函各分行，以利進行防詐騙金融作業。',
    sender: '臺灣銀行',
    receiver: '本行各分行',
    expected_purpose: '請各分行強化同仁熟悉帳戶異動即時通報機制與審查流程',
    required_facts: ['中老年人假投資詐騙', '即時訊息連線通報機制', '資金異常流動', '行內通報系統'],
    required_actions: ['加強審查流程', '辦理通報流程訓練', '配合防詐金融作業'],
    contact_person: '李順心',
    contact_phone: '02-23493456',
    contact_email: 'abccc@mail.bot.com.tw',
    expected_closing_phrase: '請查照',
    numbering_style: 'ARABIC_DOT',
    reference_answer_subject:
      '為配合內政部警政署推動「中老年人帳戶異動頻繁即時訊息連線通報機制」，請各分行加強同仁熟悉通報流程訓練，並落實防詐騙金融作業，請查照辦理。',
    reference_answer_description:
      '一、近年金融詐騙案件金額屢創新高，詐騙手法亦日趨多元，其中以中老年人假投資詐騙案件尤為嚴重，已有多起民眾遭詐騙終生積蓄及退休金之情事，影響人民財產安全甚鉅。\n二、內政部警政署為提高詐騙防禦層級，自即日起與各大金融機構建立「中老年人帳戶異動頻繁即時訊息連線通報機制」，請銀行從業人員加強配合審查流程，留意帳戶資金異常流動情形，以預防詐騙案件發生。\n三、本行為強化前開通報機制及審查流程，業已即時更新行內帳戶資金異動訊息通報系統，請各分行儘速辦理同仁教育訓練，使櫃檯及相關業務人員熟悉系統操作方式、異常交易辨識原則及通報流程。\n四、遇有中老年客戶帳戶資金異動頻繁、短期間大額匯款、疑似受他人指示操作交易，或其他疑似遭詐騙情形者，請依本行內部作業規範辦理關懷提問、審查及即時通報。\n五、請各分行主管督導所屬同仁確實執行相關防詐騙金融作業，以強化本行防詐作為，維護客戶財產安全。',
    reference_answer_method: '',
  },
  {
    id: 'bot-002',
    title: '防詐風險預警系統測試與優化',
    source_note: '臺灣銀行114年二招考古題',
    ai_reference_model: 'GPT 5.5',
    reference_speed: '普通',
    reference_security: '',
    reference_attachments: '無',
    difficulty: 'medium',
    document_type: '函',
    scenario_type: 'INTERNAL',
    scenario:
      '金融詐騙手法日新月異，詐騙方式多隱匿於網路社群媒體管道，實難以有效阻絕。假設臺灣銀行為能夠加強客戶端防禦網絡系統，經114年8月2日會議決議，即刻要求各分行辦理「防詐風險預警系統」測試與優化作業。即日起至114年11月30日止，將於行內不定期執行客戶端預防投資詐騙的交易行為預警系統測試與優化作業，目的在於提供行內人員即時辨識客戶異常投資請求與可疑資金流向，以提高詐騙防禦率。本次預警系統測試內容包括：測試時程分配、分行配合事項、異常通報程序以及系統優化建議。測試期間各分行應積極配合辦理並回報分行測試過程與優化作業成果。',
    supplemental_instruction: '請參考以上內容，代業務承辦人李長樂撰文發函通知轄下各分行配合辦理。',
    sender: '臺灣銀行',
    receiver: '本行各分行',
    expected_purpose: '通知各分行配合防詐風險預警系統測試與優化作業',
    required_facts: ['114年8月2日會議決議', '114年11月30日', '防詐風險預警系統', '測試與優化作業'],
    required_actions: ['配合系統測試', '辦理異常通報', '提出優化建議', '回報作業成果'],
    contact_person: '李長樂',
    contact_phone: '',
    contact_email: '',
    expected_closing_phrase: '請查照',
    numbering_style: 'ARABIC_DOT',
    reference_answer_subject:
      '為辦理「防詐風險預警系統」測試與優化作業，請各分行自即日起至114年11月30日止配合辦理相關測試、通報及成果回報作業，請查照辦理。',
    reference_answer_description:
      '一、依本行114年8月2日會議決議辦理。\n二、近年金融詐騙手法日新月異，詐騙方式多隱匿於網路社群媒體管道，實難以有效阻絕。為加強客戶端防禦網絡系統，並提升行內人員即時辨識客戶異常投資請求與可疑資金流向之能力，本行即日起辦理「防詐風險預警系統」測試與優化作業。\n三、本次測試期間自即日起至114年11月30日止，將於行內不定期執行客戶端預防投資詐騙之交易行為預警系統測試與優化作業，以提高詐騙防禦率，強化客戶財產安全保障。\n四、本次預警系統測試內容包括測試時程分配、分行配合事項、異常通報程序及系統優化建議等項目，請各分行依相關作業安排積極配合辦理。\n五、測試期間請各分行確實執行系統測試、異常案件通報及優化建議蒐集，並於測試作業完成後回報分行測試過程及優化作業成果，俾利本行彙整檢討並持續精進防詐作業。',
    reference_answer_method: '',
  },
];

export const difficultyLabel: Record<OfficialDocQuestion['difficulty'], string> = {
  easy: '基礎',
  medium: '中等',
  hard: '進階',
};

export const scenarioLabel: Record<OfficialDocScenarioType, string> = {
  INTERNAL: '對內',
  EXTERNAL: '對外',
  PARALLEL: '平行機關',
  UPWARD: '上行文',
  DOWNWARD: '下行文',
};

const halfwidthPunctuationMap: Record<string, string> = {
  ',': '，',
  ';': '；',
  ':': '：',
  '?': '？',
  '!': '！',
};

export const getOfficialDocQuestion = (id: string | undefined) =>
  officialDocQuestions.find((question) => question.id === id);

const maskProtectedTokens = (text: string) => {
  const pieces: string[] = [];
  let masked = text;
  const protect = (pattern: RegExp) => {
    masked = masked.replace(pattern, (match) => {
      const key = `__OFFICIAL_DOC_KEEP_${pieces.length}__`;
      pieces.push(match);
      return key;
    });
  };

  protect(/https?:\/\/[^\s，,；;：:？！!?]+/g);
  protect(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  protect(/(^|\n)\s*[1-9][0-9]*\.\s*/g);
  protect(/\b\d+\.\d+\b/g);

  return {
    masked,
    restore: (value: string) =>
      pieces.reduce((next, original, index) => next.replaceAll(`__OFFICIAL_DOC_KEEP_${index}__`, original), value),
  };
};

export const findHalfwidthPunctuation = (text: string) => {
  const { masked } = maskProtectedTokens(text);
  const found = new Set<string>();
  for (const char of masked) {
    if (char in halfwidthPunctuationMap) found.add(char);
  }
  return [...found];
};

export const convertHalfwidthPunctuation = (text: string) => {
  const { masked, restore } = maskProtectedTokens(text);
  const converted = masked.replace(/[,:;?!]/g, (match) => halfwidthPunctuationMap[match] ?? match);
  return restore(converted);
};
