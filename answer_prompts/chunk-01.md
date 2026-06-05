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
題號：1
分類：重要十大問題
難度：核心必練
標籤：experienced, top10
題目：上一份工作離職的原因/為什麼會想轉換跑道?
題號：2
分類：重要十大問題
難度：核心必練
標籤：freshGraduate, motivation, noBankExperience, top10
題目：可以說服我們為何要錄取沒有經驗/非本科系的畢業生嗎?(為何我們要錄取你?)(非本科系的你,可以說是一張白紙,你覺得你有辦法勝任嗎)(非本科系為何要來應徵銀行)?
題號：3
分類：重要十大問題
難度：核心必練
標籤：noBankExperience, scenario, top10
題目：你覺得做為一位好的銀行人員該有哪些特質,你符合哪些?(無銀行經營的你如何適應這份工作?)
題號：4
分類：重要十大問題
難度：核心必練
標籤：customerService, sales, scenario, top10
題目：我們這個是要面對客戶的,而且要銷售商品,你會怎麼銷售?(櫃台都要推介金融商品,你可以嗎?)(你知道銀行都要做業績嗎,你會怎麼努力)
題號：5
分類：重要十大問題
難度：核心必練
標籤：customerService, experienced, sales, top10
題目：曾有行銷經驗嗎?你有什麼樣的特質可以很成功的推銷?要怎麼樣推銷?(之前的工作沒有與客戶當面互動的經驗你怎麼認為你可以勝任)
題號：6
分類：重要十大問題
難度：核心必練
標籤：scenario, top10
題目：你有去考其他間銀行嗎?以及你會如何做選擇(我們銀行跟x銀有什麼不同)
題號：7
分類：重要十大問題
難度：核心必練
標籤：freshGraduate, top10
題目：你覺得你學的科目中,哪個你最得意?(大學讓你學到最多的是哪門課)(大學的時候最喜歡科目是什麼?為什麼?)
題號：8
分類：重要十大問題
難度：核心必練
標籤：motivation, top10
題目：你為什麼要來應徵xx銀行?
題號：9
分類：重要十大問題
難度：核心必練
標籤：bankExperience, top10
題目：說說xx銀行的優缺點,xx銀行有什麼業務?
題號：10
分類：重要十大問題
難度：核心必練
標籤：experienced, top10
題目：進xx銀行後有甚麼職涯規劃?

請輸出這一批題目的 JSON object。