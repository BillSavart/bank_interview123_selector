import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { NavBar } from './NavBar';
import { AdSlot, AD_ENABLED } from '../AdSlot';

export function Layout() {
  const { pathname } = useLocation();
  const showFooter = pathname !== '/about';
  // No ads on the admin tool; and only render the slot wrappers when ads will
  // actually show (so production-with-ads-off leaves no empty gaps).
  const showAd = AD_ENABLED && !pathname.startsWith('/admin');
  // The home page interleaves its own ads in the question list (incl. one above
  // the first question), so it doesn't need the top banner — only the bottom one.
  const isHome = pathname === '/';

  // scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <>
      <NavBar />
      {showAd && !isHome && (
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
