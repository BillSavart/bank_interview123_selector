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
題號：51
分類：與客戶互動
難度：情境題
標籤：customerService, pressure, scenario
題目：遇到態度不好的客人你會放下自尊嗎?
題號：52
分類：與客戶互動
難度：情境題
標籤：compliance, customerService, scenario
題目：客戶要求與銀行規定有衝突怎麼辦?
題號：53
分類：與客戶互動
難度：情境題
標籤：customerService, scenario
題目：如何跟客戶維繫關係?
題號：54
分類：與客戶互動
難度：情境題
標籤：customerService, scenario
題目：遇到客訴的解決方式有哪些?
題號：55
分類：金融科技
難度：基礎
標籤：bankExperience, fintech
題目：對於銀行業的未來甚麼看法(銀行需如何轉型?)
題號：56
分類：金融科技
難度：情境題
標籤：bankExperience, fintech, scenario
題目：面對金融科技你怎麼因應(你認為未來行員需具備什麼樣的能力?)(以後存匯部門被砍掉一大半你要怎麼因應?)
題號：57
分類：金融科技
難度：基礎
標籤：bankExperience, fintech
題目：現在數位金融化,你覺得我們銀行在數位金融上有什麼優勢?(對於我們銀行數位帳戶的了解)
題號：58
分類：金融科技
難度：基礎
標籤：fintech
題目：聽過有哪些行動支付,有在使用行動支付嗎?根據你舉的行動支付例子,哪個行動支付比較有優勢?
題號：59
分類：金融科技
難度：基礎
標籤：fintech
題目：台灣pay跟其他行動支付的優劣勢比較
題號：60
分類：實習與證照
難度：基礎
標籤：freshGraduate, motivation
題目：是哪些動力讓你考取那麼多證照?證照是如何準備的?

請輸出這一批題目的 JSON object。