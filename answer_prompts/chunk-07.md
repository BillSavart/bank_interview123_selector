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
題號：61
分類：實習與證照
難度：基礎
標籤：freshGraduate
題目：學校沒有規定要實習,為何要報實習?
題號：62
分類：實習與證照
難度：基礎
標籤：bankExperience, freshGraduate
題目：你實習學到什麼?為什麼畢業不選擇那間公司?(實習的銀行跟x銀有什麼差別)
題號：63
分類：實習與證照
難度：基礎
標籤：bankExperience, freshGraduate
題目：實習經驗如何應用在銀行工作上?
題號：64
分類：人格特質與過去經驗
難度：基礎
標籤：無
題目：你的優點/個性如何?
題號：65
分類：人格特質與過去經驗
難度：基礎
標籤：無
題目：請說一下你有什麼缺點?
題號：66
分類：人格特質與過去經驗
難度：基礎
標籤：無
題目：你覺得你是個有耐心跟細心的人嗎?
題號：67
分類：人格特質與過去經驗
難度：情境題
標籤：pressure, scenario
題目：人生中遇過什麼挫折?入行之後遇到挫折怎麼辦?
題號：68
分類：人格特質與過去經驗
難度：基礎
標籤：experienced
題目：在求學及工作經驗中最有印象或最有成就感的事情?
題號：69
分類：人格特質與過去經驗
難度：基礎
標籤：freshGraduate
題目：大學有參加過什麼社團嗎?你認為參加社團讓你學到了什麼?
題號：70
分類：人格特質與過去經驗
難度：基礎
標籤：無
題目：你認為你是什麼動物?

請輸出這一批題目的 JSON object。