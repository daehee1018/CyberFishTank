import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAppContext } from '../context/AppContext';
import useOnline from '../hooks/useOnline';
import useIsMobile from '../hooks/useIsMobile';
import { getPendingRequests, subscribeRequests } from '../services/requestActivity';
import { pwaRegistration, UPDATE_EVENT } from '../services/pwa';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const dismissed = () => {
  try { return Date.now() - Number(localStorage.getItem('cft-install-dismissed') || 0) < 7 * 86400000; }
  catch { return false; }
};

export default function PwaExperience() {
  const online = useOnline();
  const isMobile = useIsMobile();
  const { currentUser, authError, isWebSocketConnected, displaySensorData, decorationSaveStatus, refreshConnection } = useAppContext();
  const pending = useSyncExternalStore(subscribeRequests, getPendingRequests, () => 0);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);
  const [hidden, setHidden] = useState(dismissed);
  const [instructions, setInstructions] = useState(false);
  const [update, setUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState('');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const showAppNotices = isMobile || ios || standalone;
  const canInstall = showAppNotices && !standalone && !hidden && (Boolean(install) || ios);
  const busy = pending > 0 || decorationSaveStatus === 'saving';

  useEffect(() => {
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); };
    const installed = () => { setStandalone(true); setInstall(null); };
    const available = () => setUpdate(true);
    const media = window.matchMedia('(display-mode: standalone)');
    const mode = () => setStandalone(isStandalone());
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', installed);
    window.addEventListener(UPDATE_EVENT, available);
    media.addEventListener('change', mode);
    if (pwaRegistration?.waiting) setUpdate(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener(UPDATE_EVENT, available);
      media.removeEventListener('change', mode);
    };
  }, []);

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem('cft-install-dismissed', String(Date.now())); } catch { /* Storage may be disabled. */ }
  };
  const showInstall = async () => {
    if (!install) { setInstructions(value => !value); return; }
    try {
      await install.prompt();
      const choice = await install.userChoice;
      setInstall(null);
      if (choice.outcome === 'dismissed') dismiss();
    } catch { setMessage('브라우저 메뉴에서 홈 화면에 추가를 선택해주세요.'); }
  };
  const applyUpdate = async () => {
    if (busy || !online || updating) return;
    if (!window.confirm('최신 버전을 적용하기 위해 새로고침합니다. 작성 중인 내용은 저장했나요?')) return;
    // A write may have started while the confirmation was open.
    if (getPendingRequests() > 0) return;
    setUpdating(true);
    setMessage('');
    const waiting = pwaRegistration?.waiting;
    if (!waiting) { window.location.reload(); return; }
    const changed = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', changed, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      setUpdating(false);
      setMessage('업데이트를 적용하지 못했습니다. 다시 시도해주세요.');
    }, 12000);
  };

  const disconnected = !online || Boolean(authError) || Boolean(currentUser && !isWebSocketConnected);
  return <div className="cft-pwa-notices">
    {disconnected && <div className="cft-pwa-notice is-connection" role="status">
      <div><strong>{!online ? '인터넷 연결이 끊겼습니다' : authError ? '서버에 연결할 수 없습니다' : '실시간 연결을 복구하고 있습니다'}</strong>
        <p>표시된 값과 영상은 최신 상태가 아닐 수 있어요.{displaySensorData?.timestamp && <> 마지막 센서 수신: {new Date(displaySensorData.timestamp).toLocaleString('ko-KR')}</>}</p></div>
      {online && <button type="button" onClick={refreshConnection}>다시 확인</button>}
    </div>}
    {canInstall && <aside className="cft-pwa-notice is-install" aria-label="웹앱 설치 안내">
      <img src="/icons/icon-192.png" alt="" /><div><strong>내 어항을 홈 화면에서 바로 열어요</strong><p>CyberFishTank를 설치하면 아이콘으로 실행할 수 있어요.</p>
        {instructions && <p className="cft-pwa-instructions">Safari에서 공유 버튼 → ‘홈 화면에 추가’ → ‘추가’를 선택해주세요. 다른 브라우저라면 Safari로 열어 진행해주세요.</p>}</div>
      <button type="button" onClick={() => { void showInstall(); }}>{install ? '설치' : instructions ? '안내 접기' : '설치 방법'}</button>
      <button type="button" className="cft-pwa-dismiss" aria-label="설치 안내 일주일 동안 닫기" onClick={dismiss}>×</button>
    </aside>}
    {showAppNotices && update && <aside className="cft-pwa-notice is-update" role="status"><div><strong>새 버전이 준비되었습니다</strong><p>{busy ? '요청이 완료된 후 업데이트할 수 있어요.' : '저장한 뒤 새로고침해서 적용해주세요.'}</p></div><button type="button" disabled={busy || !online || updating} onClick={() => { void applyUpdate(); }}>{updating ? '적용 중…' : '업데이트'}</button></aside>}
    {message && <p className="cft-pwa-notice" role="alert">{message}<button type="button" onClick={() => setMessage('')}>닫기</button></p>}
  </div>;
}
