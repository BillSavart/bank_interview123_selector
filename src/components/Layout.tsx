import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { NavBar } from './NavBar';
import { AdSlot, AD_ENABLED } from '../AdSlot';

const SITE_NAME = '公股銀行新手村';
// Per-route browser-tab title. Falls back to the bare site name for anything
// not listed (e.g. the catch-all route).
const PAGE_TITLES: Record<string, string> = {
  '/selector': '面試題目篩選器',
  '/calendar': '招考行事曆',
  '/scores-map': '筆試門檻',
  '/number-trainer': '大寫數字訓練器',
  '/check-game': '支票審查員',
  '/about': '使用說明',
  '/admin': '後台管理',
};

export function Layout() {
  const { pathname } = useLocation();
  const showFooter = pathname !== '/about';
  // No ads on the admin tool; and only render the slot wrappers when ads will
  // actually show (so production-with-ads-off leaves no empty gaps).
  const showAd = AD_ENABLED && !pathname.startsWith('/admin');
  // The selector page interleaves its own ads in the question list (incl. one
  // above the first question), so it doesn't need the top banner. The landing
  // page stays clean, so it skips the top banner too.
  const hideTopAd = pathname === '/' || pathname === '/selector';

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
      {showAd && !hideTopAd && (
        <div className="container site-ad site-ad-top">
          <AdSlot slot="site-top" />
        </div>
      )}
      <main className="site-main">
        <Outlet />
      </main>
      {showAd && (
        <div className="container site-ad">
          <AdSlot slot="site-bottom" />
        </div>
      )}
      {showFooter && (
        <footer className="site-footer">
          <span>Credit: 公股銀行招考討論區Jack</span>
          <span className="site-footer-note">本站推薦僅供準備方向參考，實際面試以報考銀行與職缺為準。</span>
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
