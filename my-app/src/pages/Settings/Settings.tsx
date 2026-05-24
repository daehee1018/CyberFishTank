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
    controlNotice, setControlNotice
  } = useAppContext();

  const renderToggle = (enabled: boolean, onChange: (val: boolean) => void) => (
    <button onClick={() => onChange(!enabled)} className={`relative h-8 w-14 rounded-full transition ${enabled ? 'bg-slate-900' : 'bg-slate-300'}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${enabled ? 'left-7' : 'left-1'}`} />
    </button>
  );

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-500">설정 메뉴</div>
          <div className="space-y-3">
            <div className="rounded-[14px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">어항 설정</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">어항 이름, 물고기 이름을 관리합니다.</div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">기본</span>
              </div>
            </div>
            <div className="rounded-[14px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">사용자 설정</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">알림, 언어, 계정 환경을 조정합니다.</div>
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">사용자</span>
              </div>
            </div>
            <div className="rounded-[14px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">보안 설정</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">원격 제어 PIN과 세션 보안을 관리합니다.</div>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">보안</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="space-y-4">
        {controlNotice && <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{controlNotice}</div>}
        
        <div className="space-y-4">
          <div className="rounded-[20px] border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-500">
                    <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="8" r="4" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-slate-900">관리자</div>
                    <div className="mt-1 text-sm text-slate-500">{accountEmail}</div>
                    <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">활성 세션</div>
                  </div>
                </div>
                <div className="mt-5 rounded-[14px] border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                  어항 관리, 원격 제어, 알림 설정을 변경할 수 있는 관리자 계정입니다.
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm text-slate-500">빠른 설정 요약</div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[14px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">어항 이름</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{tankName}</div>
                  </div>
                  <div className="rounded-[14px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">물고기 이름</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{fishName}</div>
                  </div>
                  <div className="rounded-[14px] border border-slate-200 bg-white p-4">
                    <div className="text-xs text-slate-500">언어</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{language}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-5">
            <div className="mb-4">
              <div className="text-sm text-slate-500">어항 설정</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">어항 및 물고기 정보</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-5">
                <label className="text-sm font-medium text-slate-600">어항 이름 변경</label>
                <input value={tankName} onChange={(e) => setTankName(e.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400" />
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-5">
                <label className="text-sm font-medium text-slate-600">물고기 이름 변경</label>
                <input value={fishName} onChange={(e) => setFishName(e.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400" />
              </div>
            </div>
            <button onClick={() => setControlNotice('어항 정보가 저장되었습니다.')} className="mt-4 rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white">어항 설정 저장</button>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-5">
            <div className="mb-4">
              <div className="text-sm text-slate-500">사용자 설정</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">계정 및 환경 설정</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-5">
                <label className="text-sm font-medium text-slate-600">계정 이메일</label>
                <input value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400" />
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-5">
                <label className="text-sm font-medium text-slate-600">원격 제어 PIN</label>
                <input value={controlPin} onChange={(e) => setControlPin(e.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400" />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-700">알림 수신</div>
                    <div className="mt-1 text-xs text-slate-500">이상 징후 및 제어 완료 알림</div>
                  </div>
                  {renderToggle(notificationsEnabled, setNotificationsEnabled)}
                </div>
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-700">다크 모드</div>
                    <div className="mt-1 text-xs text-slate-500">야간 관제용 화면 테마</div>
                  </div>
                  {renderToggle(darkModeEnabled, setDarkModeEnabled)}
                </div>
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-5">
                <label className="text-sm font-medium text-slate-700">언어 설정</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-3 w-full rounded-[12px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400">
                  <option>한국어</option>
                  <option>English</option>
                  <option>日本語</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-[16px] border border-slate-200 bg-slate-50 p-5">
              <div>
                <div className="text-sm font-medium text-slate-700">세션 관리</div>
                <div className="mt-1 text-xs text-slate-500">공용 PC 사용 후 로그아웃을 권장합니다.</div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setControlNotice('사용자 설정이 저장되었습니다.')} className="rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white">사용자 설정 저장</button>
                <button onClick={() => setControlNotice('로그아웃 되었습니다.')} className="rounded-[14px] border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-700">로그아웃</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
