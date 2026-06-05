import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { NavBar } from './NavBar';

export function Layout() {
  const { pathname } = useLocation();

  // scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <>
      <NavBar />
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>Credit: 公股銀行招考討論區Jack</span>
        <span className="site-footer-note">本站推薦僅供準備方向參考，實際面試以報考銀行與職缺為準。</span>
      </footer>
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
