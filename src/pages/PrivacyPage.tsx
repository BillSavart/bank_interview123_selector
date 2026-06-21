import { Link } from 'react-router-dom';
import { ShieldCheck, Database, Cookie, Megaphone, Settings, Mail } from 'lucide-react';

// 隱私權政策最後修訂日期（手動維護——只有在政策內容變動時才更新，
// 不要綁 build 時間，否則每次部署都會誤顯示成「政策已更新」）。
const LAST_UPDATED = '2026 年 6 月 21 日';
const CONTACT_FORM = 'https://forms.gle/2Yw4mvY91sj1uKcU8';

export function PrivacyPage() {
  return (
    <div className="container py-4 about-page">
      <div className="interview-kicker">
        <ShieldCheck size={18} />
        隱私權政策
      </div>
      <h1 className="display-title mb-3">隱私權政策</h1>
      <p className="page-intro">
        公股銀行新手村（以下稱「本站」）重視你的隱私。本政策說明本站會收集哪些資料、如何使用，
        以及你能做哪些選擇。本站為非官方學習工具，大部分功能不需註冊或登入即可使用。
      </p>

      <h2 className="about-h2">
        <Database size={18} /> 我們收集的資料
      </h2>
      <ul className="about-list">
        <li>
          <strong>自動收集的使用資料：</strong>當你瀏覽本站時，我們透過 Google Analytics
          收集匿名的使用數據，例如造訪頁面、停留時間、來源網站、裝置與瀏覽器類型、概略地區等，
          用於了解使用情形並改善內容。
        </li>
        <li>
          <strong>你主動提供的資料：</strong>當你在題目或文章下方留言、為留言投票、在小遊戲
          （支票審查員、大寫數字訓練器）輸入暱稱上傳排行榜，或透過聯絡表單與我們聯繫時，我們會收到
          你提供的內容。請勿在留言或暱稱中填寫真實姓名、電話等個人敏感資訊。
        </li>
      </ul>

      <h2 className="about-h2">
        <Cookie size={18} /> Cookie 與類似技術
      </h2>
      <p className="about-text">
        本站與下述第三方服務可能使用 Cookie 或類似技術，用來記住設定、分析流量與（若有）投放廣告。
        你可以隨時透過瀏覽器設定封鎖或刪除 Cookie，但部分功能可能因此受影響。
      </p>

      <h2 className="about-h2">
        <Megaphone size={18} /> 第三方服務
      </h2>
      <p className="about-text">本站使用以下第三方服務，各服務皆有其自身的隱私權政策：</p>
      <ul className="about-list">
        <li>
          <strong>Google Analytics</strong>（網站流量分析）。
        </li>
        <li>
          <strong>Google AdSense（廣告）：</strong>本站載入 Google 的廣告程式。Google 等第三方供應商可能
          使用 Cookie，依你過去造訪本站或其他網站的紀錄投放廣告。你可前往{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer">
            Google 廣告設定
          </a>{' '}
          停用個人化廣告，或透過{' '}
          <a href="https://www.aboutads.info" target="_blank" rel="noreferrer">
            aboutads.info
          </a>{' '}
          管理第三方供應商的 Cookie。
        </li>
        <li>
          <strong>Google 表單</strong>（「聯絡我們」使用）。
        </li>
      </ul>
      <p className="about-text">
        關於 Google 如何處理資料，請參閱{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Google 隱私權政策
        </a>
        。
      </p>

      <h2 className="about-h2">
        <Settings size={18} /> 資料用途與你的選擇
      </h2>
      <ul className="about-list">
        <li>資料用於提供與改善網站功能、顯示留言與排行榜、分析使用情形、回覆你的詢問。本站不會販售你的個人資料。</li>
        <li>留言與暱稱屬於公開內容，會顯示給其他使用者；如需修改或刪除，請透過聯絡表單告知。</li>
        <li>你可透過瀏覽器管理或刪除 Cookie，或透過上述 Google 廣告設定停用個人化廣告。</li>
        <li>除上述第三方服務外，本站不會主動將你的資料提供給其他第三方，除非法律要求。</li>
      </ul>

      <h2 className="about-h2">
        <ShieldCheck size={18} /> 資料安全與兒童隱私
      </h2>
      <p className="about-text">
        我們會以合理方式保護資料，但無法保證網路傳輸絕對安全。本站不針對兒童設計，亦不會刻意收集兒童的個人資料。
        本政策可能不定期更新，更新後將於本頁公告並更新下方日期。
      </p>

      <h2 className="about-h2">
        <Mail size={18} /> 聯絡我們
      </h2>
      <p className="about-text">
        對本政策有任何疑問，歡迎透過{' '}
        <a href={CONTACT_FORM} target="_blank" rel="noreferrer">
          聯絡表單
        </a>{' '}
        與我們聯繫。也可以回到 <Link to="/about">關於我們</Link> 進一步了解本站。
      </p>

      <p className="about-updated">最後更新：{LAST_UPDATED}</p>
    </div>
  );
}
