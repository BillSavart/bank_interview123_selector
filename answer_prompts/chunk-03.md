你是台灣公股銀行面試輔導老師。請針對以下題目產生每題專屬的 answer_bank.json 內容。

重要規則：
- 只能輸出 JSON object，不要 markdown，不要說明文字。
- key 必須是題號字串。
- 每題都要有 meta、keyPoints、answer、variants。
- meta 請原樣保留題目的 category、difficulty、tags、question。
- answer 必須針對該題本身回答，不能用同一套模板套全部題目。
- answer 用第一人稱，繁體中文，約 180-260 字。
- keyPoints 每題 3 點，每點要具體。
- variants 是依考生條件微調的補充句，不要重複主答案。
- 如果某個條件不適合這題，也要給一句自然可用的調整方向，不要留空。
- variants 必須完整包含這些 key：
ageUnder24, age25to29, age30plus, workNone, workUnder2, work2to5, work5plus, freshGraduateYes, freshGraduateNo, bankExperienceYes, bankExperienceNo, bankYearsUnder1, bankYears1to3, bankYears3plus, salesExperienceYes, salesExperienceNo, focusMotivation, focusSales, focusService, focusCompliance, focusNews

欄位語意：
- ageUnder24 / age25to29 / age30plus：年齡版本補充。
- workNone / workUnder2 / work2to5 / work5plus：工作年資版本補充。
- freshGraduateYes / freshGraduateNo：是否應屆畢業生補充。
- bankExperienceYes / bankExperienceNo：是否有銀行經驗補充。
- bankYearsUnder1 / bankYears1to3 / bankYears3plus：有銀行經驗時的銀行年資補充。
- salesExperienceYes / salesExperienceNo：是否有銷售經驗補充。
- focusMotivation / focusSales / focusService / focusCompliance / focusNews：準備重點補充。

JSON 格式範例：
{
  "1": {
    "meta": {
      "category": "重要十大問題",
      "difficulty": "核心必練",
      "tags": [
        "experienced",
        "top10"
      ],
      "question": "上一份工作離職的原因/為什麼會想轉換跑道?"
    },
    "keyPoints": [
      "先正面說明離職原因",
      "連到銀行職涯",
      "補上已做的準備"
    ],
    "answer": "這題專屬完整示範回答...",
    "variants": {
      "ageUnder24": "ageUnder24 條件下的補充句。",
      "age25to29": "age25to29 條件下的補充句。",
      "age30plus": "age30plus 條件下的補充句。",
      "workNone": "workNone 條件下的補充句。",
      "workUnder2": "workUnder2 條件下的補充句。",
      "work2to5": "work2to5 條件下的補充句。",
      "work5plus": "work5plus 條件下的補充句。",
      "freshGraduateYes": "freshGraduateYes 條件下的補充句。",
      "freshGraduateNo": "freshGraduateNo 條件下的補充句。",
      "bankExperienceYes": "bankExperienceYes 條件下的補充句。",
      "bankExperienceNo": "bankExperienceNo 條件下的補充句。",
      "bankYearsUnder1": "bankYearsUnder1 條件下的補充句。",
      "bankYears1to3": "bankYears1to3 條件下的補充句。",
      "bankYears3plus": "bankYears3plus 條件下的補充句。",
      "salesExperienceYes": "salesExperienceYes 條件下的補充句。",
      "salesExperienceNo": "salesExperienceNo 條件下的補充句。",
      "focusMotivation": "focusMotivation 條件下的補充句。",
      "focusSales": "focusSales 條件下的補充句。",
      "focusService": "focusService 條件下的補充句。",
      "focusCompliance": "focusCompliance 條件下的補充句。",
      "focusNews": "focusNews 條件下的補充句。"
    }
  }
}

題目清單：
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