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
題號：81
分類：與主管應對
難度：情境題
標籤：manager, pressure, scenario
題目：遇到不公平的待遇,你會抱怨主管嗎?那這種不公平你會怎麼處理?
題號：82
分類：與主管應對
難度：情境題
標籤：bankExperience, manager, scenario
題目：若你有特別想做的業務,如何讓主管發掘並認同你該項能力?
題號：83
分類：與主管應對
難度：情境題
標籤：compliance, manager, scenario
題目：如果主管要你做違法的事情你要怎麼因應?
題號：84
分類：與主管應對
難度：情境題
標籤：manager, scenario
題目：如果主管的能力沒有很好,你會如何?
題號：85
分類：與主管應對
難度：情境題
標籤：bankExperience, manager, scenario
題目：主管交代你的事情超出能力範圍怎麼辦?(長官突然給你沒經手過的業務,你會怎麼做)
題號：86
分類：與主管應對
難度：情境題
標籤：manager, scenario
題目：遇到嚴格或很難溝通的主管如何處理
題號：87
分類：與同事應對相處
難度：基礎
標籤：experienced, teamwork
題目：請說明過去團隊合作的經驗?
題號：88
分類：與同事應對相處
難度：情境題
標籤：scenario, teamwork
題目：如果有團體中有不同意見或不合的人如何處理?
題號：89
分類：與同事應對相處
難度：情境題
標籤：bankExperience, scenario, teamwork
題目：你是新進人員同事不想教你業務怎麼辦?
題號：90
分類：與同事應對相處
難度：情境題
標籤：bankExperience, scenario, teamwork
題目：同事都把業務丟給你這個新進人員怎麼辦?

請輸出這一批題目的 JSON object。