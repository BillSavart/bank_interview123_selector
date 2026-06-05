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
題號：21
分類：銀行報考動機與工作內容
難度：基礎
標籤：motivation
題目：你戶籍不在你報考的區域,為何想報考這裡?
題號：22
分類：銀行報考動機與工作內容
難度：基礎
標籤：bankExperience
題目：你知道我們這個職缺,工作內容是什麼嗎?(進來之後從櫃檯開始你可以接受嗎?)
題號：23
分類：銀行報考動機與工作內容
難度：情境題
標籤：bankExperience, pressure, scenario
題目：銀行櫃檯工作很枯燥你要怎麼調適?
題號：24
分類：銀行報考動機與工作內容
難度：情境題
標籤：bankExperience, pressure, scenario
題目：進入銀行後覺得會面臨到什麼困難?(缺乏的銀行需要的人格特質)?
題號：25
分類：銀行報考動機與工作內容
難度：情境題
標籤：bankExperience, customerService, manager, pressure, scenario
題目：在櫃檯時下一個號碼的客人已經等很久有些不耐煩,此時電話又突然響起,主管又交代處理VIP客戶,請問該如何處理?
題號：26
分類：銀行報考動機與工作內容
難度：基礎
標籤：bankExperience
題目：進銀行後想要專才還是通才培訓?
題號：27
分類：銀行報考動機與工作內容
難度：情境題
標籤：bankExperience, pressure, scenario
題目：如果業務忙要加班,你的想法是?
題號：28
分類：銀行報考動機與工作內容
難度：基礎
標籤：bankExperience
題目：我們銀行哪裡值得改善?
題號：29
分類：銀行報考動機與工作內容
難度：情境題
標籤：bankExperience, customerService, scenario
題目：如果今天在櫃檯發生錯誤但客戶已經離開了後面有很多客人在等會先處理出錯的客人還是先處理後面等待的客人?
題號：30
分類：銀行報考動機與工作內容
難度：情境題
標籤：compliance, customerService, scenario
題目：有沒有防詐經驗(如何防止客戶被詐騙)?

請輸出這一批題目的 JSON object。