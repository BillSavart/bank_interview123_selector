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
題號：91
分類：與同事應對相處
難度：情境題
標籤：compliance, scenario, teamwork
題目：如果你同事在工作上不誠實,你會如何?
題號：92
分類：未來規劃
難度：情境題
標籤：bankExperience, scenario
題目：以後有升遷的機會時想要做什麼業務?
題號：93
分類：未來規劃
難度：情境題
標籤：sales, scenario
題目：會嘗試做理專嗎?
題號：94
分類：未來規劃
難度：情境題
標籤：bankExperience, scenario
題目：銀行櫃員調動很慢,你會如何?
題號：95
分類：未來規劃
難度：情境題
標籤：bankExperience, scenario
題目：如果在銀行無法讓你發揮所長該如何應對?(如果進來之後發現工作跟自己想得不一樣要如何調適?)
題號：96
分類：未來規劃
難度：情境題
標籤：scenario
題目：如果被外派,你能接受嗎?
題號：97
分類：未來規劃
難度：情境題
標籤：motivation, scenario
題目：如果沒有錄取你,你之後有哪些規劃?
題號：98
分類：未來規劃
難度：基礎
標籤：無
題目：未來會不會想調回家鄉?
題號：99
分類：未來規劃
難度：情境題
標籤：experienced, scenario
題目：哪些情況會讓你想離開x銀?
題號：100
分類：未來規劃
難度：基礎
標籤：freshGraduate
題目：未來是否進修研究所?

請輸出這一批題目的 JSON object。