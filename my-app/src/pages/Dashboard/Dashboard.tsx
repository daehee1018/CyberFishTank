import React from 'react';
import { useAppContext } from '../../context/AppContext';
import Aquarium from '../../components/Aquarium';

const Dashboard: React.FC = () => {
  const { isLiveMode, setIsLiveMode, alerts, tankName } = useAppContext();

  const quickControls = [
    { label: '급여', sub: '마지막 급여 2시간 전' },
    { label: '조명 조절', sub: '현재 밝기 70%' },
  ];

  const bottomStats = [
    { label: '수온', value: '25.4°C', status: '정상' },
    { label: 'pH', value: '6.8', status: '주의' },
    { label: '수위', value: '82%', status: '정상' },
    { label: '조도', value: '420 lx', status: '정상' },
  ];

  const statusClasses: Record<string, string> = {
    정상: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    주의: 'bg-amber-50 text-amber-700 border-amber-200',
    위험: 'bg-rose-50 text-rose-700 border-rose-200',
    정보: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-4">
            {quickControls.map((item) => (
              <button key={item.label} className="w-full rounded-[14px] border border-slate-200 bg-white px-4 py-5 text-center transition hover:border-slate-300 hover:bg-slate-50">
                <div className="text-lg font-semibold text-slate-900">{item.label}</div>
                <div className="mt-1 text-xs text-slate-500">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-center text-base font-semibold text-slate-900">알림</div>
          <div className="mt-3 space-y-3 rounded-[14px] bg-white p-3">
            {alerts.slice(0, 3).map((alert) => (
              <div key={alert.title + alert.time} className="rounded-[14px] border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{alert.title}</div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses[alert.level] || ''}`}>{alert.level}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{alert.time}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">실시간 디지털 트윈</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">어항 상태 미러링 화면</div>
            </div>
            <button
              onClick={() => setIsLiveMode(!isLiveMode)}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {isLiveMode ? 'Digital Twin' : 'Live Render'}
            </button>
          </div>

          <div className="relative h-[510px] overflow-hidden rounded-[18px] border border-slate-200 bg-slate-950">
            {isLiveMode ? (
              <>
                <div className="absolute right-5 top-5 z-10 flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1 text-xs font-medium text-white">
                  <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>
                <img
                  src="http://192.168.31.151:5000/video_feed"
                  alt="Fish Tank Camera"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </>
            ) : (
              <>
                {/* 배경 컴포넌트 렌더링 영역 */}
                <div className="absolute inset-0 z-0">
                  <Aquarium />
                </div>
                
                {/* 안내 배지 (어항 위에 둥둥 떠있도록 z-index 설정) */}
                <div className="pointer-events-none absolute left-7 top-5 z-10 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600 shadow-sm">
                  디지털 트윈 영역
                </div>
                <div className="pointer-events-none absolute right-7 top-5 z-10 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 shadow-sm">
                  물고기 추적 중
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {bottomStats.map((item) => (
            <div key={item.label} className="rounded-[18px] border border-slate-200 bg-white px-5 py-4 text-center text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="text-sm font-medium text-slate-500">{item.label}</div>
              <div className="mt-2 text-2xl font-bold tracking-tight">{item.value}</div>
              <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClasses[item.status] || ''}`}>{item.status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;