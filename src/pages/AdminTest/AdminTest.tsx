// src/pages/AdminTest/AdminTest.tsx
//
// admin 전용 기능 테스트 페이지. 대시보드 안에 흩어져 있던
// 디버그용 컨트롤(오염도 미리보기, 알림 테스트 발송 등)을
// 한 곳에 모아둔다. 앞으로 새 기능을 테스트용 버튼이 필요하면
// 여기에 추가한다.
import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

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

const AdminTest: React.FC = () => {
  const { currentUser, pollutionPreview, setPollutionPreview, setControlNotice } =
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

      setControlNotice(`테스트용 "${label}" 알림을 보냈습니다. 기록 페이지에서 확인해보세요.`);
    } catch (err) {
      console.error('❌ 테스트 알림 전송 실패:', err);
      setControlNotice('테스트 알림 전송에 실패했습니다.');
    } finally {
      setSendingType(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-slate-500">관리자 전용</div>
        <div className="text-2xl font-semibold tracking-tight text-slate-900">기능 테스트</div>
        <p className="mt-2 text-sm text-slate-600">
          실제 조건(오염도 지속, 30분 등)을 기다리지 않고 화면/알림 파이프라인이
          제대로 동작하는지 바로 확인하기 위한 도구 모음입니다.
        </p>
      </div>

      <section className="rounded-[20px] border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-base font-semibold text-slate-900">오염도 미리보기</h3>
        <p className="mb-4 text-xs text-slate-500">
          실제 판정과 무관하게 대시보드 어항 물 색만 강제로 바꿔서 확인합니다.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { severity: 0, label: '정상' },
            { severity: 1, label: '주의' },
            { severity: 2, label: '위험' },
          ].map((option) => (
            <button
              key={option.severity}
              onClick={() => setPollutionPreview(option.severity)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                pollutionPreview === option.severity
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {option.label}
            </button>
          ))}

          <button
            onClick={() => setPollutionPreview(null)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              pollutionPreview === null
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            실측값으로
          </button>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-base font-semibold text-slate-900">알림 테스트 발송</h3>
        <p className="mb-4 text-xs text-slate-500">
          쿨다운 없이 즉시 알림을 생성해서 알림 파이프라인(생성 → WebSocket → 기록 페이지 표시)이
          정상 동작하는지 확인합니다. 괄호는 실제 서비스에서 이 알림이 재발동되기까지 걸리는 간격입니다.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ALERT_TEST_OPTIONS.map((option) => (
            <button
              key={option.type}
              onClick={() => sendTestAlert(option.type, option.label)}
              disabled={sendingType !== null}
              className="flex items-center justify-between rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
            >
              <span>🔔 {option.label}</span>
              <span className="text-xs font-normal text-amber-500">
                {sendingType === option.type ? '보내는 중...' : `(${option.cooldown})`}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminTest;
