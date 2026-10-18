import { trackedFetch as fetch } from '../services/requestActivity';
import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import useIsMobile from '../hooks/useIsMobile';

interface ManagedUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://ggnu.site';

export default function AccountManagement() {
  const isMobile = useIsMobile();
  const { currentUser } = useAppContext();

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

  if (!isAdmin) return null;

  const createForm = (<form onSubmit={handleCreateUser}><label className="cft-field">아이디<input placeholder="아이디를 입력하세요" autoComplete="off" value={newUsername} onChange={event => setNewUsername(event.target.value)} /></label>
          <label className="cft-field">비밀번호<input type="password" placeholder="비밀번호를 입력하세요" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
          <label className="cft-field">역할<select value={newRole} onChange={event => setNewRole(event.target.value as 'admin' | 'user')}><option value="user">일반 유저</option><option value="admin">관리자</option></select></label>
          <button type="submit" disabled={creating} className="cft-button is-primary">{creating ? '추가 중...' : '유저 추가'}</button>
        </form>);

  if (isMobile) return (
    <section className="cft-panel cft-mobile-user-management">
      <div className="cft-panel-heading"><h2>계정 관리</h2><span className="cft-badge is-neutral">관리자 전용</span></div>
      {userError && <p className="cft-error" role="alert">{userError}</p>}
      <div className="cft-mobile-user-list" aria-label="등록 계정">
        {users.length ? users.map(user => <div key={user.id}><div><strong>{user.username}</strong><small>{user.role === 'admin' ? '관리자' : '일반 유저'} · {new Date(user.created_at).toLocaleDateString('ko-KR')}</small></div><button type="button" className="cft-delete-button" aria-label={`${user.username} 계정 삭제`} onClick={() => handleDeleteUser(user.id)} disabled={user.id === currentUser?.id}>삭제</button></div>) : <p>등록된 계정을 불러오는 중입니다.</p>}
      </div>
      {createForm}
    </section>
  );

  return (
    <div className="cft-settings-grid cft-admin-accounts">
      <section className="cft-panel cft-user-management"><div className="cft-panel-heading"><h2>계정 관리</h2><span className="cft-badge is-neutral">관리자 전용</span></div>
        {userError && <p className="cft-error" role="alert">{userError}</p>}
        <div className="cft-table-scroll"><table className="cft-user-table"><thead><tr><th>아이디</th><th>역할</th><th>생성일</th><th><span className="sr-only">관리</span></th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.username}</td><td>{user.role === 'admin' ? '관리자' : '일반 유저'}</td><td>{new Date(user.created_at).toLocaleDateString('ko-KR')}</td><td><button type="button" className="cft-delete-button" onClick={() => handleDeleteUser(user.id)} disabled={user.id === currentUser?.id}>삭제</button></td></tr>)}</tbody></table></div>
        {!users.length && !userError && <p className="cft-empty">등록된 계정을 불러오는 중입니다.</p>}
        <p className="cft-caption">새 사용자를 추가하고 역할을 지정할 수 있습니다.</p><a className="cft-button is-primary" href="#add-user">사용자 추가</a>
      </section>
      <section className="cft-panel" id="add-user"><div className="cft-panel-heading"><h2>사용자 추가</h2></div>
        {createForm}
      </section>
    </div>
  );
}
