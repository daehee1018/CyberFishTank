import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Icon } from '../UI';
import type { IconName } from '../UI';
import useIsMobile from '../../hooks/useIsMobile';
import MobileLayout from './MobileLayout';

const Layout: React.FC = () => {
  const { tankName, currentUser, logout, alerts, setControlNotice } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const menus: { name: string; mobileName: string; path: string; icon: IconName; end?: boolean }[] = [
    { name: '대시보드', mobileName: '대시보드', path: '/', icon: 'grid', end: true },
    { name: '기록', mobileName: '기록', path: '/records', icon: 'chart' },
    { name: '개인 설정', mobileName: '꾸미기', path: '/personal-settings', icon: 'pen' },
    { name: '설정', mobileName: '설정', path: '/settings', icon: 'settings' },
  ];
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setControlNotice('로그아웃하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    }
  };
  if (isMobile) return <MobileLayout onLogout={handleLogout} />;
  return (
    <div className="cft-shell">
      <aside className="cft-sidebar">
        <NavLink to="/" className="cft-brand" aria-label="CyberFishTank 홈"><span className="cft-brand-mark"><Icon name="fish" /></span><span>CyberFishTank</span></NavLink>
        <div className="cft-tank-summary"><div className="cft-tank-label">내 어항</div><div className="cft-tank-name">{tankName}</div></div>
        <nav className="cft-nav" aria-label="주 메뉴">
          {menus.map(menu => <NavLink key={menu.path} to={menu.path} end={menu.end} className={({ isActive }) => `cft-nav-link ${isActive ? 'is-active' : ''}`}><span className="cft-nav-icon"><Icon name={menu.icon} /></span><span className="cft-nav-desktop-label">{menu.name}</span><span className="cft-nav-mobile-label">{menu.mobileName}</span></NavLink>)}
        </nav>
        <div className="cft-sidebar-bottom">
          {currentUser?.role === 'admin' && <NavLink to="/admin" className={({ isActive }) => `cft-nav-link cft-admin-link ${isActive ? 'is-active' : ''}`}><span className="cft-nav-icon"><Icon name="flask" /></span><span>관리자</span></NavLink>}
          <div className="cft-user-row"><span className="cft-avatar">{currentUser?.username?.slice(0, 1).toUpperCase() || 'A'}</span><span><strong>{currentUser?.username}</strong><small>{currentUser?.role === 'admin' ? '관리자' : '사용자'}</small></span><button type="button" onClick={handleLogout} title="로그아웃" aria-label="로그아웃"><Icon name="logout" /></button></div>
        </div>
      </aside>
      <div className="cft-workspace">
        <header className="cft-topbar"><button type="button" className="cft-notification" aria-label={`알림 기록 보기, ${alerts.length}개`} onClick={() => navigate('/records', { state: { tab: '알림' } })}><Icon name="bell" />{alerts.length > 0 && <i />}</button><span>{currentUser?.role === 'admin' ? '관리자' : currentUser?.username}</span></header>
        <main className="cft-content" key={location.pathname}><Outlet /></main>
      </div>
    </div>
  );
};
export default Layout;
