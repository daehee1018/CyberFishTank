import React from 'react';
import { useAppContext } from '../../context/AppContext';

const Settings: React.FC = () => {
  const {
    tankName, setTankName,
    fishName, setFishName,
    notificationsEnabled, setNotificationsEnabled,
    darkModeEnabled, setDarkModeEnabled,
    language, setLanguage,
    accountEmail, setAccountEmail,
    controlPin, setControlPin,
    controlNotice, setControlNotice,
  } = useAppContext();

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
            <label className="rounded-[16px] border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-600">물고기 이름<input value={fishName} onChange={(event) => setFishName(event.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none" /></label>
          </div>
          <button type="button" onClick={() => setControlNotice('어항 정보가 저장되었습니다.')} className="mt-4 rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white">어항 설정 저장</button>
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
      </div>
    </div>
  );
};

export default Settings;
