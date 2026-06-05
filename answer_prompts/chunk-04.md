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
題號：31
分類：銀行報考動機與工作內容
難度：進階
標籤：compliance, fintech, sales
題目：金管會對於交友軟體推銷金融產品有什麼規範?
題號：32
分類：銀行報考動機與工作內容
難度：情境題
標籤：bankExperience, scenario
題目：入行後如何快速熟悉你的業務?
題號：33
分類：銀行業務推廣
難度：情境題
標籤：bankExperience, sales, scenario
題目：銀行現在都要銷售金融商品,你覺得如何?/你可以接受嗎?
題號：34
分類：銀行業務推廣
難度：情境題
標籤：bankExperience, sales, scenario
題目：如果我拿一百萬現金,去你的櫃檯存錢,你會對我說哪二件事情?
題號：35
分類：銀行業務推廣
難度：情境題
標籤：customerService, sales, scenario
題目：如果來銀行的是年長者,你會推銷什麼商品給他?
題號：36
分類：銀行業務推廣
難度：情境題
標籤：bankExperience, sales
題目：我們銀行的產品有哪些?
題號：37
分類：銀行業務推廣
難度：情境題
標籤：sales, scenario
題目：試著推銷一個產品看看
題號：38
分類：銀行業務推廣
難度：情境題
標籤：bankExperience, sales
題目：你認為怎樣能增加銀行業績?
題號：39
分類：銀行業務推廣
難度：情境題
標籤：fintech, sales
題目：數位帳戶怎麼結合推銷東西,為銀行帶來獲利?
題號：40
分類：銀行業務推廣
難度：進階
標籤：marketNews, sales
題目：美元升息要推薦什麼產品?

請輸出這一批題目的 JSON object。