import { Link } from 'react-router-dom';
import {
  Banknote,
  BookOpen,
  SlidersHorizontal,
  ClipboardCheck,
  Calculator,
  Hash,
  CalendarDays,
  MapPinned,
  MapPin,
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
        關於我們
      </div>
      <h1 className="display-title mb-3">公股銀行新手村</h1>
      <p className="page-intro">
        公股銀行新手村是一個<strong>非官方</strong>的公股銀行招考準備工具。準備八大公股行庫招考時，
        題目、時程、筆試門檻與上榜心得往往散落在各個論壇與社群；我們把這些整理、結構化成一個地方，
        讓新手用最短的時間抓到準備方向。
      </p>
      <p className="about-text">
        這裡集合了面試題目篩選、招考行事曆、筆試門檻地圖、試場資訊、經驗分享、年薪計算機與練習小遊戲，全部免費使用。
        本站與任何銀行、招考單位或補習班皆無關，不販售課程、不代辦報名；所有內容整理自公開資源，僅供準備方向參考。
      </p>

      <h2 className="about-h2">
        <MessageSquare size={18} /> 條款與免責
      </h2>
      <p className="about-text">
        本站為非官方學習工具，所有內容僅供準備方向參考，招考資訊請以各單位正式公告為準。
        使用本站前，請一併閱讀 <Link to="/terms">服務條款</Link>、
        <Link to="/disclaimer">免責聲明</Link> 與 <Link to="/privacy">隱私權政策</Link>。
      </p>

      <h2 className="about-h2">
        <BookOpen size={18} /> 各功能使用說明
      </h2>
      <p className="about-text">本站各項工具的操作方式如下。</p>

      <h2 className="about-h2">
        <SlidersHorizontal size={18} /> 面試題目篩選
      </h2>
      <p className="about-text">
        整理自公股銀行招考討論區的 123 題常見面試題庫，依你的背景挑出最該優先練習的題目。
      </p>
      <ol className="about-list">
        <li>
          在<Link to="/selector">面試題目篩選器</Link>填入年齡、年資、是否應屆、有無銀行／銷售經驗等條件，系統會依適配度排序題目。
        </li>
        <li>點任一題的「展開答案」，即可在題目卡內查看答題重點與示範回答。</li>
        <li>切換左側條件後，展開答案會改用新的考生背景重新組合。</li>
        <li>每題下方可留言討論、為留言按讚或倒讚，互相交流答題經驗。</li>
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
        <MapPin size={18} /> 試場資訊
      </h2>
      <p className="about-text">
        <Link to="/venues">試場資訊</Link>彙整各家銀行招考的試場情報，分成筆試與面試兩種：筆試統計各試場的缺考人數，面試則整理各試場的考題與考驗重點。
      </p>
      <ol className="about-list">
        <li>左側選單依銀行分組，點銀行名稱可展開／收合該行的各場次，新資料會陸續補上。</li>
        <li>每筆場次會標明「筆試」或「面試」，並列出試場數與缺考總人數。</li>
        <li>筆試以各試場缺考人數呈現；面試則在各試場卡片列出當場被問到的題目。</li>
        <li>面試題目會因面試官、考生背景與當下情況而異，僅供準備方向參考，不代表你會被問到相同題目；缺考等數據亦以考生回報為準，可能與官方公告有出入。</li>
      </ol>

      <h2 className="about-h2">
        <Calculator size={18} /> 年薪計算機
      </h2>
      <p className="about-text">
        <Link to="/salary">年薪計算機</Link>依公股銀行的職等、調薪與升等機制，試算年資 1～30 年的年薪。
      </p>
      <ol className="about-list">
        <li>拉動「年資」拉桿（1～30 年），即可看到這段期間的總薪資、當年年薪與平均月領。</li>
        <li>
          月薪以五等 40,900 元起、每年調薪 2%，並依升等時程（五→六、六→七各 2 年，七→八 3 年，八→九 6 年）逐步晉等，九等自第 14 年起。
        </li>
        <li>
          年薪含 12 個月本薪、獎金 4 個月、加班費（時薪＝月薪÷30÷8，每月加班 12 小時，無條件捨去）與行儲利息；第一年因新人考績多為乙等，獎金以 4 個月打八折計。
        </li>
        <li>所有數字皆為固定公式試算的估計值，僅供參考，實際以任職銀行規定為準。</li>
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
      <p className="about-updated">
        最後更新：{lastUpdated()}（台灣時間）　·　<Link to="/terms">服務條款</Link>　·
        <Link to="/disclaimer">免責聲明</Link>　·　<Link to="/privacy">隱私權政策</Link>
      </p>
    </div>
  );
}
