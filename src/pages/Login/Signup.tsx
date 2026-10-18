import React, { useState } from 'react';
import AuthLayout from '../../components/AuthLayout';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

const Signup: React.FC = () => {
  const { signup, currentUser } = useAppContext();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!username || !password) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSubmitting(true);
    setError('');

    const result = await signup(username, password);

    setSubmitting(false);

    if (!result.success) {
      setError(result.error || '회원가입에 실패했습니다.');
      return;
    }

    navigate('/select-fish', { replace: true });
  };

  return (
    <AuthLayout signup>
        <div className="cft-auth-heading"><h1>나만의 어항을 시작하세요</h1><p>계정을 만들고 물고기와 함께하세요.</p></div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-600">
            아이디
            <input
              placeholder="아이디를 입력해주세요"
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
              placeholder="비밀번호를 입력해주세요"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-2 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="block text-sm font-medium text-slate-600">
            비밀번호 확인
            <input
              type="password"
              placeholder="비밀번호를 다시 입력해주세요"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              autoComplete="new-password"
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
            {submitting ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-medium text-slate-900 underline underline-offset-2">
            로그인
          </Link>
        </div>
    </AuthLayout>
  );
};

export default Signup;
