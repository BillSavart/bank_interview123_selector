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
題號：111
分類：最新時事與財經新聞
難度：基礎
標籤：marketNews
題目：現在全球市場經濟狀況如何?
題號：112
分類：最新時事與財經新聞
難度：基礎
標籤：marketNews
題目：對於目前房市的看法?
題號：113
分類：最新時事與財經新聞
難度：進階
標籤：marketNews
題目：為什麼抑制通膨要升息?
題號：114
分類：最新時事與財經新聞
難度：基礎
標籤：marketNews
題目：說說你最近看到的財經新聞?
題號：115
分類：最新時事與財經新聞
難度：基礎
標籤：fintech
題目：開放銀行是指什麼?
題號：116
分類：最新時事與財經新聞
難度：進階
標籤：marketNews
題目：對目前國際外匯有何看法?
題號：117
分類：最新時事與財經新聞
難度：基礎
標籤：marketNews
題目：川普想要增加關稅對於台灣的影響?
題號：118
分類：最新時事與財經新聞
難度：基礎
標籤：bankExperience, marketNews
題目：碳中和/碳權銀行有什麼方法去實行?
題號：119
分類：最新時事與財經新聞
難度：基礎
標籤：marketNews
題目：美國利率的看法?
題號：120
分類：最新時事與財經新聞
難度：基礎
標籤：marketNews
題目：政府打房政策有哪些?覺得政策有用嗎?

請輸出這一批題目的 JSON object。