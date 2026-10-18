import { trackedFetch as fetch } from '../../services/requestActivity';
// Administrator account management and diagnostic tools.
//
// admin 전용 기능 테스트 페이지. 대시보드 안에 흩어져 있던
// 디버그용 컨트롤(오염도 미리보기, 알림 테스트 발송 등)을
// 한 곳에 모아둔다. 앞으로 새 기능을 테스트용 버튼이 필요하면
// 여기에 추가한다.
import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Icon, PageHeading } from '../../components/UI';
import { useAppContext } from '../../context/AppContext';
import AccountManagement from '../../components/AccountManagement';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://ggnu.site';

// server.cjs의 DEBUG_ALERT_DEFINITIONS와 1:1로 맞춘 목록.
// 새 알림 종류를 추가하면 서버/여기 둘 다 같이 추가할 것.
// cooldown은 실제로 그 알림 타입이 재발동까지 기다리는 간격
// (설명용 — 실제 값은 server.cjs의 ALERT_COOLDOWN_OVERRIDES).
const ALERT_TEST_OPTIONS: { type: string; label: string; cooldown: string }[] = [
  { type: 'temperature-increase', label: '수온 상승 경고', cooldown: '1시간' },
  { type: 'temperature-decrease', label: '수온 저하 경고', cooldown: '1시간' },
  { type: 'ph-increase', label: 'pH 상승 경고', cooldown: '1시간' },
  { type: 'ph-decrease', label: 'pH 하락 경고', cooldown: '1시간' },
  { type: 'water-decrease', label: '수위 저하 경고', cooldown: '5분' },
  { type: 'fish-flipped-pose', label: '배뒤집힘 지속 경고', cooldown: '5분' },
  { type: 'water-quality-warning', label: '물갈이 권장', cooldown: '6시간' },
];

const Admin: React.FC = () => {
  const { currentUser, pollutionPreview, setPollutionPreview, setControlNotice, controlNotice } =
    useAppContext();

  const [sendingType, setSendingType] = useState<string | null>(null);

  if (currentUser?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const sendTestAlert = async (type: string, label: string) => {
    setSendingType(type);

    try {
      const response = await fetch(`${API_BASE}/api/debug/trigger-alert`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (!response.ok) {
        throw new Error(`상태 코드 ${response.status}`);
      }

      setControlNotice(`테스트용 "${label}" 알림을 보냈습니다. 기록의 알림 화면에서 확인해보세요.`);
    } catch (err) {
      console.error('❌ 테스트 알림 전송 실패:', err);
      setControlNotice('테스트 알림 전송에 실패했습니다.');
    } finally {
      setSendingType(null);
    }
  };

  return (
    <div className="cft-admin-page space-y-6">
      <PageHeading title="관리자" description="계정을 관리하고 센서 상태와 주요 동작을 확인하세요." />
      {controlNotice && <div className="cft-notice" role="status">{controlNotice}</div>}
      <AccountManagement />
      <div className="cft-notice"><span className="inline-flex items-center gap-2"><Icon name="flask" />테스트 실행 시 실제 화면과 알림을 통해 기능을 확인할 수 있습니다.</span></div>
      <section className="cft-panel"><h3 className="mb-2 font-semibold">오염도 미리보기</h3><p className="cft-caption">실제 판정과 무관하게 대시보드의 물 색을 미리 확인합니다.</p>
        <div className="cft-pollution-options">{[{ severity: 0, label: '정상' }, { severity: 1, label: '주의' }, { severity: 2, label: '위험' }].map(option => <button type="button" key={option.severity} aria-pressed={pollutionPreview === option.severity} onClick={() => setPollutionPreview(option.severity)}><Icon name="waves" />{option.label}</button>)}<button type="button" aria-pressed={pollutionPreview === null} onClick={() => setPollutionPreview(null)}>실측값으로</button></div>
      </section>
      <section className="cft-panel"><h3 className="mb-2 font-semibold">알림 테스트 발송</h3><p className="cft-caption">실제 조건을 기다리지 않고 알림 생성을 확인합니다. 표시된 시간은 실제 알림의 재발동 간격입니다.</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{ALERT_TEST_OPTIONS.map(option => <div key={option.type} className="cft-test-alert"><span><Icon name="bell" />{option.label}</span><small>{option.cooldown}</small><button type="button" className="cft-button" onClick={() => sendTestAlert(option.type, option.label)} disabled={sendingType !== null}>{sendingType === option.type ? '전송 중' : '발송'}</button></div>)}</div>
      </section>
    </div>
  );
};
export default Admin;
