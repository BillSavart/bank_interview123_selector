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