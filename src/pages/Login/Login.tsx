import React, { useState } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

const Login: React.FC = () => {
  const { login, currentUser } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (currentUser) {
    const from = (location.state as { from?: string })?.from || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!username || !password) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setSubmitting(true);
    setError('');

    const result = await login(username, password);

    setSubmitting(false);

    if (!result.success) {
      setError(result.error || '로그인에 실패했습니다.');
      return;
    }

    const from = (location.state as { from?: string })?.from || '/';
    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mb-6 text-center">
          <div className="text-sm text-slate-500">CyberFishTank</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">로그인</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-600">
            아이디
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-2 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="block text-sm font-medium text-slate-600">
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-2 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          {error && (
            <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-500">
          계정이 없으신가요?{' '}
          <Link to="/signup" className="font-medium text-slate-900 underline underline-offset-2">
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
