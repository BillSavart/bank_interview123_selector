import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Download, Mail, Menu, X } from 'lucide-react';

// 考試相關的三個功能收進「考試專區」下拉，navbar 才不會太長。
const examItems = [
  { to: '/selector', label: '面試題目篩選' },
  { to: '/calendar', label: '招考行事曆' },
  { to: '/scores-map', label: '筆試門檻' },
  { to: '/venues', label: '試場資訊' },
];

// 經驗分享維持單一連結。
const navItems = [{ to: '/experience', label: '經驗分享' }];

const gameItems = [
  { to: '/number-trainer', label: '大寫數字訓練器' },
  { to: '/check-game', label: '支票審查員' },
];

export function NavBar() {
  const [open, setOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const location = useLocation();
  const isExamActive = examItems.some((item) => location.pathname.startsWith(item.to));
  const isGameActive = gameItems.some((item) => location.pathname.startsWith(item.to));

  const closeNav = () => {
    setOpen(false);
    setExamOpen(false);
    setGameOpen(false);
  };

  return (
    <header className="site-nav">
      <div className="container site-nav-inner">
        <NavLink to="/" className="nav-brand" onClick={closeNav}>
          <img className="nav-brand-logo" src="/favicon.svg" alt="" width={28} height={28} />
          <span>公股銀行新手村</span>
        </NavLink>

        <button
          className="nav-toggle"
          type="button"
          aria-label="選單"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav className={`nav-links ${open ? 'is-open' : ''}`}>
          <div className={`nav-game ${examOpen ? 'is-open' : ''}`}>
            <button
              className={`nav-game-toggle ${isExamActive ? 'is-active' : ''}`}
              type="button"
              aria-expanded={examOpen}
              onClick={() => setExamOpen((v) => !v)}
            >
              考試專區
              <ChevronDown size={15} />
            </button>
            <div className="nav-game-menu">
              {examItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? 'is-active' : '')}
                  onClick={closeNav}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
              onClick={closeNav}
            >
              {item.label}
            </NavLink>
          ))}
          <div className={`nav-game ${gameOpen ? 'is-open' : ''}`}>
            <button
              className={`nav-game-toggle ${isGameActive ? 'is-active' : ''}`}
              type="button"
              aria-expanded={gameOpen}
              onClick={() => setGameOpen((v) => !v)}
            >
              遊戲專區
              <ChevronDown size={15} />
            </button>
            <div className="nav-game-menu">
              {gameItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? 'is-active' : '')}
                  onClick={closeNav}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
          <NavLink
            to="/about"
            className={({ isActive }) => (isActive ? 'is-active' : '')}
            onClick={closeNav}
          >
            使用說明
          </NavLink>
          <a
            className="nav-pdf"
            href="https://forms.gle/2Yw4mvY91sj1uKcU8"
            target="_blank"
            rel="noreferrer"
            onClick={closeNav}
          >
            <Mail size={16} />
            聯絡我們
          </a>
          <a className="nav-pdf" href="/20260515bank123.pdf" target="_blank" rel="noreferrer" onClick={closeNav}>
            <Download size={16} />
            題庫 PDF
          </a>
        </nav>
      </div>
    </header>
  );
}
