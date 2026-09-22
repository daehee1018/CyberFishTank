import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

const Layout: React.FC = () => {
  const { tankName, currentUser, logout } = useAppContext();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const topMenus = [
    { name: '대시보드', path: '/' },
    { name: '기록', path: '/records' },
    { name: '개인 설정', path: '/personal-settings' },
    { name: '설정', path: '/settings' },
    ...(currentUser?.role === 'admin'
      ? [{ name: '테스트', path: '/admin-test' }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-[1280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:rounded-[32px] sm:p-5">
        <div className="rounded-xl bg-slate-50 p-3 sm:rounded-[26px] sm:p-4">
          <header className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:rounded-[20px] sm:px-8 sm:py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">어항 이름</div>
                <div className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{tankName}</div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 sm:gap-4 sm:rounded-[18px] sm:px-4 sm:py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-500 sm:h-14 sm:w-14">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="8" r="4" />
                  </svg>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500">사용자</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">
                    {currentUser?.username}
                    {currentUser?.role === 'admin' && (
                      <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">
                        관리자
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
                  >
                    로그아웃
                  </button>
                </div>
              </div>
            </div>
          </header>

          <nav
            className={`mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:gap-4 sm:rounded-[20px] sm:p-3 ${
              topMenus.length > 4 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
            }`}
          >
            {topMenus.map((menu) => (
              <NavLink
                key={menu.name}
                to={menu.path}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-3 text-center text-sm font-medium transition sm:rounded-[14px] sm:px-6 sm:py-4 sm:text-base ${
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

          <main className="mt-4 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
