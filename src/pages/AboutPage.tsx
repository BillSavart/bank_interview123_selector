import { Link } from 'react-router-dom';
import {
  Banknote,
  SlidersHorizontal,
  ClipboardCheck,
  Hash,
  CalendarDays,
  MapPinned,
  MessageSquare,
  Mail,
} from 'lucide-react';

// Build timestamp (set at deploy time), formatted in Taiwan time.
function lastUpdated(): string {
  try {
    return new Date(__BUILD_TIME__).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

export function AboutPage() {
  return (
    <div className="container py-4 about-page">
      <div className="interview-kicker">
        <Banknote size={18} />
        使用說明
      </div>
      <h1 className="display-title mb-3">公股銀行新手村</h1>
      <p className="page-intro">
        本站是給準備公股銀行招考的新手練功的地方，集合了面試題目篩選、兩款練習小遊戲，
        以及一份招考行事曆。以下說明各功能怎麼用。
      </p>

      <h2 className="about-h2">
        <SlidersHorizontal size={18} /> 面試題目篩選
      </h2>
      <p className="about-text">
        整理自公股銀行招考討論區的 123 題常見面試題庫，依你的背景挑出最該優先練習的題目。
      </p>
      <ol className="about-list">
        <li>
          在<Link to="/">首頁</Link>填入年齡、年資、是否應屆、有無銀行／銷售經驗等條件，系統會依適配度排序題目。
        </li>
        <li>點任一題的「展開答案」，即可在題目卡內查看答題重點與示範回答。</li>
        <li>切換左側條件後，展開答案會改用新的考生背景重新組合。</li>
        <li>每題下方可留言討論、為留言按讚或倒讚，互相交流答題經驗。</li>
      </ol>

      <h2 className="about-h2">
        <ClipboardCheck size={18} /> 支票審查員
      </h2>
      <p className="about-text">
        <Link to="/check-game">支票審查員</Link>是一款限時小遊戲：看一張支票圖片，判斷它「可以」或「不可以」受理。
      </p>
      <ol className="about-list">
        <li>輸入暱稱後開始，每題限時 15 秒。</li>
        <li>答對得分，作答越快分數越高；答錯或逾時不得分。每題會附上正解說明。</li>
        <li>結束後成績會上傳排行榜，看看你排第幾名。</li>
      </ol>

      <h2 className="about-h2">
        <Hash size={18} /> 大寫數字訓練器
      </h2>
      <p className="about-text">
        <Link to="/number-trainer">大寫數字訓練器</Link>練習把國字大寫金額快速轉成阿拉伯數字。
      </p>
      <ol className="about-list">
        <li>共 12 題，每題限時 10 秒，把大寫金額填回阿拉伯數字。</li>
        <li>前 6 題是方格題：對齊「億仟佰拾萬仟佰拾元」表頭，✗ 代表該位是 0。</li>
        <li>後 6 題是支票寫法：整串大寫金額（如「貳拾捌萬零參佰元整」）。</li>
        <li>計分與排行榜方式同支票審查員，答得越快越高分。</li>
      </ol>

      <h2 className="about-h2">
        <CalendarDays size={18} /> 招考行事曆
      </h2>
      <p className="about-text">
        <Link to="/calendar">招考行事曆</Link>以月曆方式呈現各家招考的重要日期，把握每一檔報名與考試。
      </p>
      <ol className="about-list">
        <li>橫條為報名期間，其餘色塊為筆試、試題與解答公告、筆試結果、面試、二面、放榜等日期。</li>
        <li>點任一筆事件即可看到完整資訊與簡章連結。</li>
        <li>可瀏覽上個月到三個月後的範圍；過期太久的場次會自動移除。</li>
      </ol>

      <h2 className="about-h2">
        <MapPinned size={18} /> 筆試門檻
      </h2>
      <p className="about-text">
        <Link to="/scores-map">筆試門檻</Link>以台灣地圖呈現八大公股行庫歷年各考區的筆試錄取分數，快速看出哪些地區競爭較激烈。
      </p>
      <ol className="about-list">
        <li>先選上方的銀行與招考梯次，地圖會用顏色深淺標出各考區的門檻分數，顏色越深代表分數越高、越難。</li>
        <li>點任一考區，右側會顯示該區分數、與上一梯的升降，以及最近幾梯的分數折線。</li>
        <li>右側「難度排行」依分數高低列出當梯各考區；同色同分的相鄰考區會合併顯示。</li>
        <li>資料整理自公開招考結果，僅供落點參考，實際門檻仍以各行庫正式公告為準。</li>
      </ol>

      <h2 className="about-h2">
        <MessageSquare size={18} /> 關於內容與免責聲明
      </h2>
      <p className="about-text">
        本站答題內容僅供準備方向參考，不會即時呼叫外部 AI；實際面試仍應以自身經歷、報考銀行與職缺內容為主。
        行事曆日期請以各招考單位的正式公告為準。本站為非官方學習工具，與任何銀行或招考單位無關，
        題庫內容整理自公開資源，著作權仍屬原作者。
      </p>

      <h2 className="about-h2">
        <Mail size={18} /> 聯絡我們
      </h2>
      <p className="about-text">
        有任何問題、建議或想回報資料錯誤，歡迎透過{' '}
        <a href="https://forms.gle/2Yw4mvY91sj1uKcU8" target="_blank" rel="noreferrer">
          這份表單
        </a>
        　告訴我們。
      </p>

      <p className="about-credit">Credit: 公股銀行招考討論區 Jack/聯合哥</p>
      <p className="about-updated">最後更新：{lastUpdated()}（台灣時間）</p>
    </div>
  );
}
