import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { NavBar } from './NavBar';

const SITE_NAME = '公股銀行新手村';
// Per-route browser-tab title. Falls back to the bare site name for anything
// not listed (e.g. the catch-all route).
const PAGE_TITLES: Record<string, string> = {
  '/selector': '面試題目篩選器',
  '/calendar': '招考行事曆',
  '/scores-map': '筆試門檻',
  '/venues': '試場資訊',
  '/number-trainer': '大寫數字訓練器',
  '/check-game': '支票審查員',
  '/salary': '年薪計算機',
  '/about': '關於我們',
  '/privacy': '隱私權政策',
  '/terms': '服務條款',
  '/disclaimer': '免責聲明',
  '/admin': '後台管理',
};

export function Layout() {
  const { pathname } = useLocation();
  const showFooter = pathname !== '/about';

  // scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  // Keep the browser-tab title in sync with the current route.
  useEffect(() => {
    const page = PAGE_TITLES[pathname];
    document.title = page ? `${page} | ${SITE_NAME}` : SITE_NAME;
  }, [pathname]);

  return (
    <>
      <NavBar />
      <main className="site-main">
        <Outlet />
      </main>
      {showFooter && (
        <footer className="site-footer">
          <span>Credit: 公股銀行招考討論區Jack</span>
          <span className="site-footer-note">本站推薦僅供準備方向參考，實際面試以報考銀行與職缺為準。</span>
          <nav className="site-footer-links" aria-label="網站資訊">
            <Link to="/about">關於我們</Link>
            <Link to="/terms">服務條款</Link>
            <Link to="/disclaimer">免責聲明</Link>
            <Link to="/privacy">隱私權政策</Link>
          </nav>
        </footer>
      )}
      <button
        className="back-to-top"
        type="button"
        aria-label="回到頂端"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp size={19} />
        <span>回到頂端</span>
      </button>
    </>
  );
}
