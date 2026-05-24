import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

const Layout: React.FC = () => {
  const { tankName, accountEmail } = useAppContext();
  const topMenus = [
    { name: '대시보드', path: '/' },
    { name: '기록', path: '/records' },
    { name: '원격 제어', path: '/control' },
    { name: '설정', path: '/settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-[1280px] rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="rounded-[26px] bg-slate-50 p-4">
          <header className="rounded-[20px] border border-slate-200 bg-white px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">어항 이름</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">{tankName}</div>
              </div>
              <div className="flex items-center gap-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-500">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="8" r="4" />
                  </svg>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500">사용자</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">관리자</div>
                  <div className="text-xs text-slate-500">{accountEmail}</div>
                </div>
              </div>
            </div>
          </header>

          <nav className="mt-4 grid grid-cols-4 gap-4 rounded-[20px] border border-slate-200 bg-white p-3">
            {topMenus.map((menu) => (
              <NavLink
                key={menu.name}
                to={menu.path}
                className={({ isActive }) =>
                  `rounded-[14px] px-6 py-4 text-center text-base font-medium transition ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {menu.name}
              </NavLink>
            ))}
          </nav>

          <main className="mt-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
