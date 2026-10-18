import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';

// The splash lives in index.html so it is visible before JavaScript arrives.
// Dismiss once per document; background reconnects and page navigation stay usable.
export default function AppStartup() {
  const { authLoading, authError, currentUser, fishLoading } = useAppContext();
  const dismissed = useRef(false);
  const loading = authLoading || Boolean(currentUser && fishLoading);

  useEffect(() => {
    window.dispatchEvent(new Event('cft:boot-ready'));
  }, []);

  useEffect(() => {
    if (dismissed.current) return;
    const splash = document.getElementById('cft-startup');
    const root = document.getElementById('root');
    const message = document.getElementById('cft-startup-message');
    const retry = document.getElementById('cft-startup-retry');
    if (!splash || !root || !message || !(retry instanceof HTMLButtonElement)) return;

    if (!loading || authError) {
      splash.dataset.state = 'leaving';
      const finish = () => {
        dismissed.current = true;
        splash.remove();
        root.removeAttribute('inert');
        root.removeAttribute('aria-hidden');
        root.removeAttribute('aria-busy');
      };
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const timer = window.setTimeout(finish, reducedMotion ? 0 : 220);
      return () => window.clearTimeout(timer);
    }

    delete splash.dataset.state;
    retry.hidden = true;
    message.textContent = authLoading ? '로그인 상태를 확인하고 있어요' : '내 어항을 준비하고 있어요';
    const slow = window.setTimeout(() => {
      message.textContent = '연결이 조금 늦어지고 있어요. 인터넷 연결을 확인해주세요.';
      retry.hidden = false;
    }, 7000);
    return () => window.clearTimeout(slow);
  }, [loading, authLoading, authError]);

  return null;
}
