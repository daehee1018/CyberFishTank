import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';

const RemoteControl: React.FC = () => {
  const {
    targetTemperature, setTargetTemperature,
    heaterPower, setHeaterPower,
    lightPower, setLightPower,
    lightBrightness, setLightBrightness,
    autoLightSchedule, setAutoLightSchedule,
    lightSchedule, setLightSchedule,
    feedAmount, setFeedAmount,
    autoFeeding, setAutoFeeding,
    feedingInterval, setFeedingInterval,
    lastFeedTime, setLastFeedTime,
    controlNotice, setControlNotice
  } = useAppContext();

  const [activeControlTab, setActiveControlTab] = useState('수온 제어');
  const controlTabs = ['수온 제어', '조도 제어', '급여 제어'];

  const renderToggle = (enabled: boolean, onChange: (val: boolean) => void) => (
    <button onClick={() => onChange(!enabled)} className={`relative h-8 w-14 rounded-full transition ${enabled ? 'bg-slate-900' : 'bg-slate-300'}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${enabled ? 'left-7' : 'left-1'}`} />
    </button>
  );

  const updateLightSchedule = (id: number, field: string, value: any) => {
    setLightSchedule((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: field === 'brightness' ? Number(value) : value } : item)));
  };

  const renderTemperatureControl = () => (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">원격 제어</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">수온 제어</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">현재 수온 25.4°C</div>
      </div>

      <div className="grid gap-4 rounded-[18px] border border-slate-200 bg-slate-50 p-6 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[16px] border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">목표 수온 설정</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{targetTemperature}°C</div>
            </div>
            <div className="text-sm text-slate-500">권장 범위 24~26°C</div>
          </div>
          <input type="range" min="20" max="30" step="0.5" value={targetTemperature} onChange={(e) => setTargetTemperature(Number(e.target.value))} className="w-full accent-slate-900" />
          <div className="mt-3 flex justify-between text-xs text-slate-500"><span>20°C</span><span>25°C</span><span>30°C</span></div>
          <div className="mt-6 flex flex-wrap gap-3">
            {[24, 25, 26].map((preset) => (
              <button
                key={preset}
                onClick={() => setTargetTemperature(preset)}
                className={`rounded-full border px-4 py-2 text-sm transition ${targetTemperature === preset ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {preset}°C
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[16px] border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">히터 전원</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{heaterPower ? '켜짐' : '꺼짐'}</div>
            </div>
            {renderToggle(heaterPower, setHeaterPower)}
          </div>
          <div className="mt-6 rounded-[14px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">제어 상태</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">설정값을 저장하면 목표 수온 기준으로 히터 동작이 조정됩니다.</div>
          </div>
          <button onClick={() => setControlNotice(`수온 목표가 ${targetTemperature}°C로 저장되었습니다.`)} className="mt-6 w-full rounded-[14px] bg-slate-900 px-4 py-3 text-sm font-medium text-white">수온 설정 적용</button>
        </div>
      </div>
    </div>
  );

  const renderLightControl = () => (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">원격 제어</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">조도 제어</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">현재 밝기 {lightBrightness}%</div>
      </div>

      <div className="space-y-4 rounded-[18px] border border-slate-200 bg-slate-50 p-6">
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[16px] border border-slate-200 bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">밝기 조절</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{lightBrightness}%</div>
              </div>
              <div className="text-sm text-slate-500">권장 범위 40~80%</div>
            </div>
            <input type="range" min="0" max="100" step="5" value={lightBrightness} onChange={(e) => setLightBrightness(Number(e.target.value))} className="w-full accent-slate-900" />
            <div className="mt-3 flex justify-between text-xs text-slate-500"><span>0%</span><span>50%</span><span>100%</span></div>
            <div className="mt-6 flex flex-wrap gap-3">
              {[30, 50, 70, 90].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setLightBrightness(preset)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${lightBrightness === preset ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[16px] border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">조명 전원</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{lightPower ? '켜짐' : '꺼짐'}</div>
              </div>
              {renderToggle(lightPower, setLightPower)}
            </div>
            <div className="mt-6 rounded-[14px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">프리셋</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {['아침', '낮', '저녁', '취침'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      const mapping: Record<string, number> = { 아침: 45, 낮: 75, 저녁: 35, 취침: 10 };
                      setLightBrightness(mapping[preset]);
                    }}
                    className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setControlNotice(`조명 밝기가 ${lightBrightness}%로 적용되었습니다.`)} className="mt-6 w-full rounded-[14px] bg-slate-900 px-4 py-3 text-sm font-medium text-white">조명 설정 적용</button>
          </div>
        </div>

        <div className="rounded-[16px] border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">시간대별 자동 밝기 조절</div>
              <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">자동 조도 스케줄</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">사용자가 시간대별 밝기를 설정해두면 해당 시각에 맞춰 자동으로 조명이 변경됩니다.</div>
            </div>
            {renderToggle(autoLightSchedule, setAutoLightSchedule)}
          </div>

          <div className="mt-6 overflow-hidden rounded-[16px] border border-slate-200">
            <div className="grid grid-cols-[1fr_140px_140px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <div>시간대</div>
              <div>시간</div>
              <div>밝기</div>
            </div>
            <div className="divide-y divide-slate-200 bg-white">
              {lightSchedule.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_140px_140px] items-center gap-3 px-4 py-3">
                  <div className="text-sm font-medium text-slate-900">{item.label}</div>
                  <input type="time" value={item.time} onChange={(e) => updateLightSchedule(item.id, 'time', e.target.value)} className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400" />
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="100" value={item.brightness} onChange={(e) => updateLightSchedule(item.id, 'brightness', e.target.value)} className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400" />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[14px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">현재 상태: <span className="font-semibold text-slate-900">{autoLightSchedule ? '자동 조도 스케줄 활성화' : '자동 조도 스케줄 비활성화'}</span></div>
          <button onClick={() => setControlNotice('시간대별 조도 스케줄이 저장되었습니다.')} className="mt-6 w-full rounded-[14px] bg-slate-900 px-4 py-3 text-sm font-medium text-white">자동 조도 스케줄 저장</button>
        </div>
      </div>
    </div>
  );

  const renderFeedControl = () => (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">원격 제어</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">급여 제어</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">마지막 급여 {lastFeedTime}</div>
      </div>

      <div className="grid gap-4 rounded-[18px] border border-slate-200 bg-slate-50 p-6 md:grid-cols-[1fr_1fr]">
        <div className="rounded-[16px] border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-500">즉시 급여</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">급여량 선택</div>
          <div className="mt-5 flex flex-wrap gap-3">
            {['소량', '표준', '다량'].map((amount) => (
              <button
                key={amount}
                onClick={() => setFeedAmount(amount)}
                className={`rounded-full border px-4 py-2 text-sm transition ${feedAmount === amount ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {amount}
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-[14px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">선택된 급여량: <span className="font-semibold text-slate-900">{feedAmount}</span></div>
          <button
            onClick={() => {
              setLastFeedTime('방금 전');
              setControlNotice(`${feedAmount} 급여가 실행되었습니다.`);
            }}
            className="mt-6 w-full rounded-[14px] bg-slate-900 px-4 py-3 text-sm font-medium text-white"
          >
            지금 급여하기
          </button>
        </div>

        <div className="rounded-[16px] border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">자동 급여</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{autoFeeding ? '활성화' : '비활성화'}</div>
            </div>
            {renderToggle(autoFeeding, setAutoFeeding)}
          </div>
          <div className="mt-6 text-sm text-slate-500">급여 주기 설정</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {['6시간', '12시간', '24시간', '사용자 지정'].map((interval) => (
              <button
                key={interval}
                onClick={() => setFeedingInterval(interval)}
                className={`rounded-[12px] border px-3 py-3 text-sm transition ${feedingInterval === interval ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {interval}
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-[14px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">현재 자동 급여 주기: <span className="font-semibold text-slate-900">{feedingInterval}</span></div>
          <button onClick={() => setControlNotice(`자동 급여가 ${feedingInterval} 주기로 설정되었습니다.`)} className="mt-6 w-full rounded-[14px] bg-slate-900 px-4 py-3 text-sm font-medium text-white">자동 급여 설정 저장</button>
        </div>
      </div>
    </div>
  );

  const renderControlMainContent = () => {
    if (activeControlTab === '수온 제어') return renderTemperatureControl();
    if (activeControlTab === '조도 제어') return renderLightControl();
    return renderFeedControl();
  };

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-500">원격 제어 메뉴</div>
          <div className="space-y-3">
            {controlTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveControlTab(tab)}
                className={`w-full rounded-[14px] border px-4 py-4 text-left text-sm font-medium transition ${activeControlTab === tab ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-4">
        {controlNotice && <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{controlNotice}</div>}
        {renderControlMainContent()}
      </div>
    </div>
  );
};

export default RemoteControl;
