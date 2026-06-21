import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  FileText,
  Database,
  Users,
  Megaphone,
  ShieldAlert,
  Mail,
} from 'lucide-react';

// 免責聲明最後修訂日期（手動維護——只有在內容變動時才更新，
// 不要綁 build 時間，否則每次部署都會誤顯示成「聲明已更新」）。
const LAST_UPDATED = '2026 年 6 月 22 日';
const CONTACT_FORM = 'https://forms.gle/2Yw4mvY91sj1uKcU8';

export function DisclaimerPage() {
  return (
    <div className="container py-4 about-page">
      <div className="interview-kicker">
        <AlertTriangle size={18} />
        免責聲明
      </div>
      <h1 className="display-title mb-3">免責聲明</h1>
      <p className="page-intro">
        公股銀行新手村（以下稱「本站」）為非官方的學習工具，本頁說明使用本站內容時應注意的事項。
        使用本站即表示你了解並接受以下聲明；本站亦受 <Link to="/terms">服務條款</Link> 規範。
      </p>

      <h2 className="about-h2">
        <Building2 size={18} /> 非官方、無隸屬關係
      </h2>
      <p className="about-text">
        本站與任何銀行、招考單位、出題單位或補習班均無任何關聯或合作關係，亦未受其委託或授權。
        所有銀行名稱、招考梯次等僅為說明用途。本站不販售課程、不代辦報名，也不會向你收取任何費用。
      </p>

      <h2 className="about-h2">
        <FileText size={18} /> 內容僅供參考
      </h2>
      <p className="about-text">
        本站的面試題目、答題方向、招考行事曆、筆試門檻、試場資訊等，皆僅供準備方向參考，並非標準答案，
        也不代表你實際會被問到相同題目或遇到相同情形。答題內容不會即時呼叫外部 AI，實際面試仍應以自身經歷、
        報考銀行與職缺內容為主。
      </p>

      <h2 className="about-h2">
        <Database size={18} /> 資料來源與正確性
      </h2>
      <ul className="about-list">
        <li>
          本站資料整理自網路論壇、社群及考生回報等公開資源，可能因整理疏漏、來源錯誤或時間經過而有不正確或過時之處。
        </li>
        <li>
          招考日期、報名與考試資訊，請務必以各招考單位的<strong>正式公告</strong>為準；
          筆試門檻分數僅供落點參考，實際門檻以各行庫正式公告為準。
        </li>
        <li>缺考人數等試場數據以考生回報為準，可能與官方公告有出入。</li>
        <li>本站不保證任何內容的完整性、正確性或即時性，亦不保證使用本站可通過考試或獲得錄取。</li>
      </ul>

      <h2 className="about-h2">
        <Users size={18} /> 使用者投稿內容
      </h2>
      <p className="about-text">
        經驗分享文章與留言由使用者自行提供，僅代表該作者個人意見與經驗，不代表本站立場，
        本站亦不保證其內容的正確性。對於使用者張貼的內容所引起的任何爭議或損害，本站不負責任。
      </p>

      <h2 className="about-h2">
        <Megaphone size={18} /> 第三方連結與廣告
      </h2>
      <p className="about-text">
        本站可能包含第三方網站連結並顯示第三方廣告（如 Google AdSense）。這些內容由第三方各自負責，
        本站對其內容、商品、服務或隱私作法不負任何責任，連結或廣告的出現亦不代表本站推薦或背書。
      </p>

      <h2 className="about-h2">
        <ShieldAlert size={18} /> 責任限制
      </h2>
      <p className="about-text">
        本站所有內容皆「依現況」提供，你應自行判斷並承擔使用本站的風險。在法律允許的最大範圍內，
        本站對於你因使用或無法使用本站、或因信賴本站內容所生的任何直接或間接損失，均不負賠償責任。
      </p>

      <h2 className="about-h2">
        <Mail size={18} /> 聯絡與更正
      </h2>
      <p className="about-text">
        若你發現本站資料有誤、想回報問題，或認為內容侵害你的權益，歡迎透過{' '}
        <a href={CONTACT_FORM} target="_blank" rel="noreferrer">
          聯絡表單
        </a>{' '}
        告訴我們，我們會儘速確認與處理。也可以回到 <Link to="/about">關於我們</Link> 進一步了解本站。
      </p>

      <p className="about-updated">最後更新：{LAST_UPDATED}</p>
    </div>
  );
}
