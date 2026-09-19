import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

interface ManagedUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://ggnu.site';

const Settings: React.FC = () => {
  const {
    tankName, setTankName,
    fishName, setFishName,
    fishSpecies, updateFish,
    notificationsEnabled, setNotificationsEnabled,
    darkModeEnabled, setDarkModeEnabled,
    language, setLanguage,
    accountEmail, setAccountEmail,
    controlPin, setControlPin,
    controlNotice, setControlNotice,
    currentUser,
  } = useAppContext();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userError, setUserError] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [creating, setCreating] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const loadUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/users`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setUserError(data.error || '사용자 목록을 불러오지 못했습니다.');
        return;
      }

      setUsers(data.users);
    } catch (error) {
      console.error('❌ 사용자 목록 조회 실패:', error);
      setUserError('사용자 목록을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!newUsername || !newPassword) {
      setUserError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setCreating(true);
    setUserError('');

    try {
      const response = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setUserError(data.error || '사용자 추가에 실패했습니다.');
        return;
      }

      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      await loadUsers();
    } catch (error) {
      console.error('❌ 사용자 추가 실패:', error);
      setUserError('사용자 추가에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    setUserError('');

    try {
      const response = await fetch(`${API_BASE}/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setUserError(data.error || '사용자 삭제에 실패했습니다.');
        return;
      }

      await loadUsers();
    } catch (error) {
      console.error('❌ 사용자 삭제 실패:', error);
      setUserError('사용자 삭제에 실패했습니다.');
    }
  };

  const renderToggle = (enabled: boolean, onChange: (value: boolean) => void) => (
    <button type="button" onClick={() => onChange(!enabled)} className={`relative h-8 w-14 rounded-full transition ${enabled ? 'bg-slate-900' : 'bg-slate-300'}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${enabled ? 'left-7' : 'left-1'}`} />
    </button>
  );

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-500">설정 메뉴</div>
          <div className="space-y-3">
            <div className="rounded-[14px] border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-900">어항 및 물고기 정보</div>
            <div className="rounded-[14px] border border-slate-200 bg-white p-4 text-sm text-slate-600">사용자 설정</div>
            <div className="rounded-[14px] border border-slate-200 bg-white p-4 text-sm text-slate-600">보안 설정</div>
          </div>
        </div>
      </aside>

      <div className="space-y-4">
        {controlNotice && <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{controlNotice}</div>}
        <section className="rounded-[20px] border border-slate-200 bg-white p-5">
          <div className="mb-4"><div className="text-sm text-slate-500">어항 설정</div><div className="text-2xl font-semibold tracking-tight text-slate-900">어항 및 물고기 정보</div></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-[16px] border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-600">어항 이름<input value={tankName} onChange={(event) => setTankName(event.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none" /></label>
            <label className="rounded-[16px] border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-600">
              물고기 이름
              <input value={fishName} onChange={(event) => setFishName(event.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none" />
              <Link to="/select-fish" className="mt-2 inline-block text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900">
                물고기 종류 변경 {fishSpecies && `(현재: ${fishName})`}
              </Link>
            </label>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (fishSpecies) {
                await updateFish(fishSpecies, fishName);
              }
              setControlNotice('어항 정보가 저장되었습니다.');
            }}
            className="mt-4 rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white"
          >
            어항 설정 저장
          </button>
        </section>

        <section className="rounded-[20px] border border-slate-200 bg-white p-5">
          <div className="mb-4"><div className="text-sm text-slate-500">사용자 설정</div><div className="text-2xl font-semibold tracking-tight text-slate-900">계정 및 환경 설정</div></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-[16px] border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-600">계정 이메일<input value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none" /></label>
            <label className="rounded-[16px] border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-600">계정 보안 PIN<input value={controlPin} onChange={(event) => setControlPin(event.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none" /></label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-[16px] border border-slate-200 bg-slate-50 p-5"><span className="text-sm font-medium text-slate-700">알림 수신</span>{renderToggle(notificationsEnabled, setNotificationsEnabled)}</div>
            <div className="flex items-center justify-between rounded-[16px] border border-slate-200 bg-slate-50 p-5"><span className="text-sm font-medium text-slate-700">다크 모드</span>{renderToggle(darkModeEnabled, setDarkModeEnabled)}</div>
            <label className="rounded-[16px] border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-700">언어 설정<select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none"><option>한국어</option><option>English</option><option>日本語</option></select></label>
          </div>
          <button type="button" onClick={() => setControlNotice('설정이 저장되었습니다.')} className="mt-4 rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white">설정 저장</button>
        </section>

        {isAdmin && (
          <section className="rounded-[20px] border border-slate-200 bg-white p-5">
            <div className="mb-4">
              <div className="text-sm text-slate-500">보안 설정</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">계정 관리</div>
            </div>

            {userError && (
              <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {userError}
              </div>
            )}

            <div className="overflow-hidden rounded-[16px] border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">아이디</th>
                    <th className="px-4 py-3 font-medium">역할</th>
                    <th className="px-4 py-3 font-medium">생성일</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                      <td className="px-4 py-3 text-slate-600">{user.role === 'admin' ? '관리자' : '일반 유저'}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(user.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={user.id === currentUser?.id}
                          className="rounded-[10px] border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 grid gap-4 md:grid-cols-4">
              <label className="text-sm font-medium text-slate-600">
                아이디
                <input
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  className="mt-2 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                비밀번호
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-2 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                역할
                <select
                  value={newRole}
                  onChange={(event) => setNewRole(event.target.value as 'admin' | 'user')}
                  className="mt-2 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                >
                  <option value="user">일반 유저</option>
                  <option value="admin">관리자</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {creating ? '추가 중...' : '유저 추가'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
};

export default Settings;
