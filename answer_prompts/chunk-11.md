你是台灣公股銀行面試輔導老師。請針對以下題目產生「每題專屬」預製答案 JSON。

重要規則：
- 只能輸出 JSON object，不要 markdown，不要說明文字。
- key 必須是題號字串。
- 每題都要有 keyPoints、answer、variants。
- answer 必須針對該題本身回答，不能用同一套模板套全部題目。
- answer 用第一人稱，繁體中文，約 180-260 字。
- keyPoints 每題 3 點，每點要具體。
- variants 是依考生條件微調的補充句，不要重複 answer。
- variants 可使用這些 key：
freshGraduate, experienced, hasBankExperience, noBankExperience, hasSalesExperience, noSalesExperience, focusMotivation, focusSales, focusService, focusCompliance, focusNews

JSON 格式範例：
{
  "1": {
    "keyPoints": [
      "先正面說明離職原因",
      "連到銀行職涯",
      "補上已做的準備"
    ],
    "answer": "完整示範回答...",
    "variants": {
      "freshGraduate": "如果是應屆畢業生，要改成第一份工作的職涯選擇。",
      "noBankExperience": "如果沒有銀行經驗，要補上如何補足實務落差。"
    }
  }
}

題目：
題號：101
分類：洗錢防制
難度：進階
標籤：compliance
題目：洗錢是什麼意思?
題號：102
分類：洗錢防制
難度：進階
標籤：compliance
題目：對洗錢防制及打擊資恐的認知有哪些?
題號：103
分類：洗錢防制
難度：進階
標籤：bankExperience, compliance
題目：哪些櫃檯業務會接觸洗錢防制?櫃台如何防制洗錢?
題號：104
分類：洗錢防制
難度：進階
標籤：compliance, customerService, manager, scenario
題目：面對客戶疑似洗錢,主管卻要求你不要通報你怎麼處理?
題號：105
分類：洗錢防制
難度：進階
標籤：compliance, scenario
題目：如何增加防治洗錢的知識?
題號：106
分類：洗錢防制
難度：進階
標籤：compliance, customerService, pressure, scenario
題目：洗錢防制政策,引發客戶不耐煩怎麼辦?(執行洗錢防制會發生的困難)
題號：107
分類：最新時事與財經新聞
難度：進階
標籤：marketNews
題目：說明美國升/降息對台灣造成的影響?
題號：108
分類：最新時事與財經新聞
難度：進階
標籤：bankExperience, marketNews
題目：你覺得未來央行升/降息會對銀行造成什麼影響?
題號：109
分類：最新時事與財經新聞
難度：進階
標籤：marketNews
題目：你覺得央行最近會不會升/降息?
題號：110
分類：最新時事與財經新聞
難度：進階
標籤：marketNews
題目：你覺得目前新臺幣匯率走勢如何?

請輸出這一批題目的 JSON object。