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
題號：41
分類：銀行業務推廣
難度：情境題
標籤：fintech, sales, scenario
題目：有使用過數位帳戶嗎?要怎麼推薦年長者使用數位帳戶
題號：42
分類：銀行業務推廣
難度：進階
標籤：compliance, sales
題目：業績與法規如何取得平衡
題號：43
分類：銀行業務推廣
難度：情境題
標籤：marketNews, sales, scenario
題目：現在我手邊有三百萬,請推薦一個金融產品說服我購買,而且希望是抗通膨、低風險、高報酬的產品
題號：44
分類：銀行業務推廣
難度：情境題
標籤：sales
題目：對全員行銷的想法?
題號：45
分類：銀行業務推廣
難度：情境題
標籤：pressure, sales, scenario
題目：業績沒有到怎麼辦?
題號：46
分類：銀行業務推廣
難度：情境題
標籤：sales, scenario
題目：如何推銷年輕人保險?
題號：47
分類：銀行業務推廣
難度：情境題
標籤：sales, scenario
題目：如何推銷債券?
題號：48
分類：與客戶互動
難度：情境題
標籤：customerService, pressure, sales, scenario
題目：有沒有遇過奧客?你怎麼處理?(顧客如果在你銷售金融商品時質疑你的專業能力,或者認為你服務很慢,讓他久候,你該怎麼處理)
題號：49
分類：與客戶互動
難度：情境題
標籤：customerService, scenario
題目：如果講解完客戶不接受怎麼辦?
題號：50
分類：與客戶互動
難度：情境題
標籤：bankExperience, customerService, pressure, scenario
題目：如果有遇到在櫃台大聲咆嘯大聲抱怨的客人,你會怎麼辦?(如果未來遇到不講理的客戶你會如何處理)

請輸出這一批題目的 JSON object。