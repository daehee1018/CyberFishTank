import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Icon, type IconName } from '../UI';

const menus: { label: string; path: string; icon: IconName }[] = [
  { label: '대시보드', path: '/', icon: 'grid' },
  { label: '기록', path: '/records', icon: 'chart' },
  { label: '꾸미기', path: '/personal-settings', icon: 'pen' },
  { label: '설정', path: '/settings', icon: 'settings' },
];

export default function MobileLayout({ onLogout }: { onLogout: () => Promise<void> }) {
  const { currentUser } = useAppContext();
  const location = useLocation();
  const accountRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (accountRef.current) accountRef.current.open = false;
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) {
        if (accountRef.current) accountRef.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && accountRef.current) accountRef.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <div className="cft-mobile">
      <header className="cft-mobile-header">
        <Link to="/" className="cft-mobile-brand"><span><Icon name="fish" /></span>CyberFishTank</Link>
        <details className="cft-mobile-account" ref={accountRef}>
          <summary aria-label="계정 메뉴">{currentUser?.username?.slice(0, 1).toUpperCase() || 'A'}</summary>
          <div className="cft-mobile-account-menu">
            <strong>{currentUser?.username}</strong>
            <Link to="/settings">계정 및 설정</Link>
            {currentUser?.role === 'admin' && <Link to="/admin"><Icon name="flask" />관리자</Link>}
            <button type="button" onClick={onLogout}><Icon name="logout" />로그아웃</button>
          </div>
        </details>
      </header>
      <main className="cft-mobile-content" key={location.pathname}><Outlet /></main>
      <nav className="cft-mobile-nav" aria-label="주 메뉴">
        {menus.map(menu => <NavLink key={menu.path} to={menu.path} end={menu.path === '/'} className={({ isActive }) => isActive || (menu.path === '/settings' && location.pathname === '/admin') ? 'is-active' : ''}><span><Icon name={menu.icon} /></span>{menu.label}</NavLink>)}
      </nav>
    </div>
  );
}
