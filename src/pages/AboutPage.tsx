import { Link } from 'react-router-dom';
import { Banknote, MessageSquare, SlidersHorizontal } from 'lucide-react';
import { AdSlot } from '../AdSlot';

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
        並提供依條件調整的答題方向與示範回答。
      </p>

      <h2 className="about-h2">
        <SlidersHorizontal size={18} /> 怎麼使用
      </h2>
      <ol className="about-list">
        <li>在<Link to="/">首頁</Link>填入年齡、年資、是否應屆、有無銀行／銷售經驗等條件，系統會依適配度排序題目。</li>
        <li>點任一題的「展開答案」，即可在題目卡內查看答題重點與示範回答。</li>
        <li>切換左側條件後，展開答案會改用新的考生背景重新組合。</li>
      </ol>

      <h2 className="about-h2">
        <MessageSquare size={18} /> 關於答題內容
      </h2>
      <p className="about-text">
        答案內容不會即時呼叫外部 API，僅供準備方向參考。實際面試仍應以自身經歷、
        報考銀行與職缺內容為主。
      </p>

      <h2 className="about-h2">免責聲明</h2>
      <p className="about-text">
        本站為非官方學習工具，與任何銀行或招考單位無關。題庫內容整理自公開資源，著作權仍屬原作者。
      </p>

      <p className="about-credit">Credit: 公股銀行招考討論區 Jack/聯合哥</p>

      <AdSlot slot="4444444444" label="贊助" />
    </div>
  );
}
