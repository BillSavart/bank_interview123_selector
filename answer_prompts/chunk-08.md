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
題號：71
分類：人格特質與過去經驗
難度：基礎
標籤：freshGraduate
題目：最不喜歡的科目是什麼?為什麼?
題號：72
分類：人格特質與過去經驗
難度：基礎
標籤：freshGraduate
題目：為何不繼續升學研究所?
題號：73
分類：人格特質與過去經驗
難度：基礎
標籤：無
題目：分享一本你最近閱讀的書
題號：74
分類：人格特質與過去經驗
難度：基礎
標籤：marketNews
題目：有投資經驗嗎,投資哪些標的?如何選擇投資標的?投資收益如何?
題號：75
分類：抗壓與情緒管理
難度：基礎
標籤：pressure
題目：在什麼情況下會讓你感到壓力,以及你平常會怎麼紓解你的壓力?
題號：76
分類：抗壓與情緒管理
難度：基礎
標籤：無
題目：平常有什麼休閒活動/興趣?
題號：77
分類：抗壓與情緒管理
難度：情境題
標籤：pressure, scenario
題目：上班後,遇到不合理的要求怎麼辦?
題號：78
分類：抗壓與情緒管理
難度：情境題
標籤：scenario, teamwork
題目：如果老行員領的比你多,做的事比你少,你會如何?(遇到勞務不均怎麼辦?)
題號：79
分類：抗壓與情緒管理
難度：基礎
標籤：pressure
題目：你的抗壓性如何?
題號：80
分類：與主管應對
難度：情境題
標籤：manager, pressure, scenario
題目：如果主管提出不合乎常理的要求,你會怎麼應對?

請輸出這一批題目的 JSON object。