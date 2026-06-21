import { Link } from 'react-router-dom';
import {
  ScrollText,
  Info,
  ListChecks,
  Users,
  Copyright,
  Megaphone,
  RefreshCw,
  Scale,
  Mail,
} from 'lucide-react';

// 服務條款最後修訂日期（手動維護——只有在條款內容變動時才更新，
// 不要綁 build 時間，否則每次部署都會誤顯示成「條款已更新」）。
const LAST_UPDATED = '2026 年 6 月 22 日';
const CONTACT_FORM = 'https://forms.gle/2Yw4mvY91sj1uKcU8';

export function TermsPage() {
  return (
    <div className="container py-4 about-page">
      <div className="interview-kicker">
        <ScrollText size={18} />
        服務條款
      </div>
      <h1 className="display-title mb-3">服務條款</h1>
      <p className="page-intro">
        歡迎使用公股銀行新手村（以下稱「本站」）。當你瀏覽或使用本站的任何功能時，即表示你已閱讀、
        了解並同意遵守本服務條款。若你不同意本條款的任何內容，請停止使用本站。本站為非官方學習工具，
        多數功能不需註冊或登入即可免費使用。
      </p>

      <h2 className="about-h2">
        <Info size={18} /> 一、服務說明
      </h2>
      <p className="about-text">
        本站提供面試題目篩選、招考行事曆、筆試門檻地圖、試場資訊、經驗分享與練習小遊戲等工具，
        所有內容整理自公開資源，僅供準備方向參考。本站與任何銀行、招考單位或補習班皆無關，
        不販售課程、不代辦報名，亦不保證任何考試結果。各項內容的免責聲明詳見{' '}
        <Link to="/disclaimer">免責聲明</Link>。
      </p>

      <h2 className="about-h2">
        <ListChecks size={18} /> 二、使用規範
      </h2>
      <p className="about-text">使用本站時，你同意不從事下列行為：</p>
      <ul className="about-list">
        <li>張貼違法、誹謗、騷擾、歧視、猥褻或侵害他人權利的內容。</li>
        <li>張貼廣告、垃圾訊息、惡意連結，或與本站宗旨無關的洗版內容。</li>
        <li>冒用他人身分，或在留言、暱稱、投稿中填寫他人的真實姓名、電話等個人資料。</li>
        <li>以爬蟲、機器人、自動化程式大量擷取資料，或對本站服務進行攻擊、干擾、逆向工程。</li>
        <li>從事任何違反中華民國法令或可能損害本站及其他使用者權益的行為。</li>
      </ul>

      <h2 className="about-h2">
        <Users size={18} /> 三、使用者投稿與留言
      </h2>
      <ul className="about-list">
        <li>
          你在經驗分享投稿、題目或文章留言中提供的內容，由你自行負責，並保證擁有合法權利且未侵害他人權益。
        </li>
        <li>
          你張貼內容即授權本站於本服務範圍內無償重製、公開傳輸與展示該內容，以提供與推廣本站服務之用。
        </li>
        <li>
          投稿須經管理員審核後才會公開；本站有權對不符規範或不適當的內容不予刊登、編輯或隨時移除，
          且不負通知義務。
        </li>
        <li>留言與暱稱屬公開內容，會顯示給其他使用者；如需修改或刪除，請透過聯絡表單告知。</li>
      </ul>

      <h2 className="about-h2">
        <Copyright size={18} /> 四、智慧財產權
      </h2>
      <p className="about-text">
        本站的題庫與資料整理自公開資源，相關著作權仍屬原作者所有。本站自行製作的版面設計、整理編排、
        程式與圖示等，非經同意請勿用於商業用途。若你認為本站內容侵害你的權益，歡迎透過聯絡表單告知，
        我們會儘速處理。
      </p>

      <h2 className="about-h2">
        <Megaphone size={18} /> 五、第三方連結與廣告
      </h2>
      <p className="about-text">
        本站可能包含第三方網站連結，並透過 Google AdSense 等服務顯示廣告。這些第三方內容由其各自營運者負責，
        本站無法控制亦不為其內容、隱私作法或正確性負責。關於本站如何處理你的資料，請參閱{' '}
        <Link to="/privacy">隱私權政策</Link>。
      </p>

      <h2 className="about-h2">
        <RefreshCw size={18} /> 六、服務變更與條款修訂
      </h2>
      <p className="about-text">
        本站為免費提供的學習工具，得隨時新增、修改、暫停或終止全部或部分功能，恕不另行個別通知。
        本條款亦可能不定期更新，更新後將於本頁公告並更新下方日期；你於條款修訂後繼續使用本站，
        即視為同意修訂後的內容。
      </p>

      <h2 className="about-h2">
        <Scale size={18} /> 七、責任限制與準據法
      </h2>
      <p className="about-text">
        本站所有內容皆「依現況」提供，僅供參考，本站不對其完整性、正確性或即時性負責，
        你因使用或無法使用本站所生的任何損失，本站於法律允許範圍內不負賠償責任。本條款的解釋與適用，
        以及與本站有關的爭議，均以中華民國法律為準據法。
      </p>

      <h2 className="about-h2">
        <Mail size={18} /> 八、聯絡我們
      </h2>
      <p className="about-text">
        對本條款有任何疑問，歡迎透過{' '}
        <a href={CONTACT_FORM} target="_blank" rel="noreferrer">
          聯絡表單
        </a>{' '}
        與我們聯繫。也可以進一步閱讀 <Link to="/disclaimer">免責聲明</Link>、
        <Link to="/privacy">隱私權政策</Link> 或回到 <Link to="/about">關於我們</Link>。
      </p>

      <p className="about-updated">最後更新：{LAST_UPDATED}</p>
    </div>
  );
}
