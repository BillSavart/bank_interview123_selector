import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Banknote, Download, Menu, X } from 'lucide-react';

const navItems = [
  { to: '/', label: '首頁 / 題目篩選', end: true },
  { to: '/about', label: '使用說明' },
];

export function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-nav">
      <div className="container site-nav-inner">
        <NavLink to="/" className="nav-brand" onClick={() => setOpen(false)}>
          <Banknote size={20} />
          <span>公股銀行面試</span>
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <a className="nav-pdf" href="/20260515bank123.pdf" target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <Download size={16} />
            題庫 PDF
          </a>
        </nav>
      </div>
    </header>
  );
}
