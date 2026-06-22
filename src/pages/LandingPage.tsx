import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  BookOpen,
  CalendarDays,
  Calculator,
  ClipboardList,
  MapPin,
  MapPinned,
  Sparkles,
} from 'lucide-react';

// 經營理念：一個入口看懂整站在做什麼，再把人導到各功能。卡片順序＝重要性。
const features = [
  {
    to: '/selector',
    icon: ClipboardList,
    title: '面試題目篩選',
    desc: '依年齡、年資、銀行與銷售經驗幫助篩選 123 題常見口試題，每題可展開答題方向與示範回答。',
    accent: true,
  },
  {
    to: '/calendar',
    icon: CalendarDays,
    title: '招考行事曆',
    desc: '八大公股銀行報名、筆試、面試到放榜的關鍵日期，一頁掌握不漏報。',
  },
  {
    to: '/scores-map',
    icon: MapPinned,
    title: '筆試門檻地圖',
    desc: '用台灣地圖看各考區歷年筆試門檻，挑出最有機會上榜的考區。',
  },
  {
    to: '/venues',
    icon: MapPin,
    title: '試場資訊',
    desc: '各家招考的筆試缺考統計與面試考題，依試場彙整，掌握各場狀況。',
  },
  {
    to: '/experience',
    icon: BookOpen,
    title: '經驗分享',
    desc: '參考其他前輩的考試與工作經驗，還能在文章底下留言一起討論。',
  },
  {
    to: '/salary',
    icon: Calculator,
    title: '年薪計算機',
    desc: '設定 1～30 年年資，試算總薪資、當年年薪與平均月領，含調薪與升等機制。',
  },
];

const steps = [
  { n: '1', title: '填考生條件', desc: '輸入年齡、年資、是否應屆、銀行與銷售經驗。' },
  { n: '2', title: '看推薦題目', desc: '系統依條件排序最該優先練的題目並附示範回答。' },
  { n: '3', title: '排好準備節奏', desc: '搭配行事曆、筆試門檻與經驗分享，規劃整個備考期。' },
];

export function LandingPage() {
  return (
    <>
      <section className="hero-band">
        <div className="container py-5 py-lg-6">
          <div className="landing-hero-inner">
            <div className="d-inline-flex align-items-center gap-2 hero-kicker mb-3">
              <Banknote size={18} />
              公股銀行招考準備
            </div>
            <h1 className="display-title mb-3">
              公股銀行新手村
            </h1>
            <p className="hero-copy mb-4">
              從面試口試題、招考時程、筆試門檻到上榜心得，把準備公股銀行招考會用到的工具集中在一個地方。
              先填你的考生條件，馬上知道該優先練哪些題。
              <span className="hero-credit">Credit: 公股銀行招考討論區 Jack/聯合哥</span>
            </p>
            <div className="landing-cta">
              <Link to="/selector" className="landing-cta-primary">
                開始篩選題目
                <ArrowRight size={18} />
              </Link>
              <Link to="/calendar" className="landing-cta-ghost">
                查看招考行事曆
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="container py-5">
          <div className="landing-section-head">
            <div className="d-inline-flex align-items-center gap-2 landing-eyebrow mb-2">
              <Sparkles size={16} />
              這個網站能幫你什麼
            </div>
            <h2 className="landing-section-title">準備公股銀行招考，需要的都在這</h2>
          </div>

          <div className="landing-grid">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Link key={f.to} to={f.to} className={`landing-card${f.accent ? ' is-accent' : ''}`}>
                  <span className="landing-card-icon">
                    <Icon size={22} />
                  </span>
                  <span className="landing-card-title">{f.title}</span>
                  <span className="landing-card-desc">{f.desc}</span>
                  <span className="landing-card-go">
                    前往
                    <ArrowRight size={15} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-steps-band">
        <div className="container py-5">
          <div className="landing-section-head">
            <h2 className="landing-section-title">三步開始準備</h2>
          </div>
          <div className="landing-steps">
            {steps.map((s) => (
              <div key={s.n} className="landing-step">
                <span className="landing-step-num">{s.n}</span>
                <div>
                  <span className="landing-step-title">{s.title}</span>
                  <span className="landing-step-desc">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="landing-steps-cta">
            <Link to="/selector" className="landing-cta-primary">
              立即開始篩選題目
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
