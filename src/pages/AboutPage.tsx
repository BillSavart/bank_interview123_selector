import { Link } from 'react-router-dom';
import { Banknote, MessageSquare, SlidersHorizontal } from 'lucide-react';

export function AboutPage() {
  return (
    <div className="container py-4 about-page">
      <div className="interview-kicker">
        <Banknote size={18} />
        使用說明
      </div>
      <h1 className="display-title mb-3">關於本站</h1>
      <p className="page-intro">
        本站整理公股銀行（如台銀、土銀、合庫等）常見口試題庫，協助考生依自身背景挑出最該優先練習的題目，
        並透過 AI 面試官進行模擬問答練習。
      </p>

      <h2 className="about-h2">
        <SlidersHorizontal size={18} /> 怎麼使用
      </h2>
      <ol className="about-list">
        <li>在<Link to="/">首頁</Link>填入年齡、年資、是否應屆、有無銀行／銷售經驗等條件，系統會依適配度排序題目。</li>
        <li>點任一題的「開始模擬面試」，進入該題的<strong>專屬練習頁面</strong>。</li>
        <li>AI 面試官會把題目問出來，你輸入回答後會得到具體回饋與追問，可反覆練習。</li>
        <li>也可以直接從上方<Link to="/interview">模擬面試</Link>挑題練習。</li>
      </ol>

      <h2 className="about-h2">
        <MessageSquare size={18} /> 關於 AI 回饋
      </h2>
      <p className="about-text">
        模擬面試由大型語言模型生成，回覆僅供準備方向參考，可能不完全正確。實際面試仍應以自身經歷、
        報考銀行與職缺內容為主。尖峰時段若免費額度用罄，畫面會提示預計恢復時間，請稍後再試。
      </p>

      <h2 className="about-h2">免責聲明</h2>
      <p className="about-text">
        本站為非官方學習工具，與任何銀行或招考單位無關。題庫內容整理自公開資源，著作權仍屬原作者。
      </p>

      <p className="about-credit">Credit: 公股銀行招考討論區Jack</p>
    </div>
  );
}
