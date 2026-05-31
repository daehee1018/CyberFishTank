import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';

const Records: React.FC = () => {
  const { alerts } = useAppContext();
  const recordTabs = ['성장 그래프', '활동량 그래프', '수온 그래프', 'pH 그래프', '수위 그래프', '조도 그래프', '알림'];
  const rangeOptions = ['1일', '1주', '1개월', '1년', '전체', '사용자 지정'];
  
  const [activeRecordTab, setActiveRecordTab] = useState('성장 그래프');
  const [activeRange, setActiveRange] = useState('1주');
  const [alertSort, setAlertSort] = useState('최신');
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  const [hoveredBar, setHoveredBar] = useState<any>(null);

  const statusClasses: Record<string, string> = {
    정상: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    주의: 'bg-amber-50 text-amber-700 border-amber-200',
    위험: 'bg-rose-50 text-rose-700 border-rose-200',
    정보: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  // Mock data and useMemo logic from original App.tsx
  const growthData = useMemo(() => {
    const byRange: Record<string, any[]> = {
      '1일': [{ label: '00시', value: 6.1 }, { label: '04시', value: 6.1 }, { label: '08시', value: 6.2 }, { label: '12시', value: 6.2 }, { label: '16시', value: 6.3 }, { label: '20시', value: 6.4 }],
      '1주': [{ label: '1주', value: 4.2 }, { label: '2주', value: 4.8 }, { label: '3주', value: 5.1 }, { label: '4주', value: 5.6 }, { label: '5주', value: 6.0 }, { label: '6주', value: 6.4 }],
      '1개월': [{ label: '1주차', value: 4.3 }, { label: '2주차', value: 4.9 }, { label: '3주차', value: 5.4 }, { label: '4주차', value: 6.1 }, { label: '5주차', value: 6.4 }, { label: '6주차', value: 6.6 }],
      '1년': [{ label: '1월', value: 3.2 }, { label: '3월', value: 4.1 }, { label: '5월', value: 4.9 }, { label: '7월', value: 5.6 }, { label: '9월', value: 6.1 }, { label: '12월', value: 6.4 }],
      '전체': [{ label: '초기', value: 2.8 }, { label: '성장1', value: 3.7 }, { label: '성장2', value: 4.6 }, { label: '성장3', value: 5.4 }, { label: '성장4', value: 6.0 }, { label: '현재', value: 6.4 }],
      '사용자 지정': [{ label: 'A', value: 4.5 }, { label: 'B', value: 4.9 }, { label: 'C', value: 5.3 }, { label: 'D', value: 5.7 }, { label: 'E', value: 6.1 }, { label: 'F', value: 6.4 }],
    };
    return byRange[activeRange] || byRange['1주'];
  }, [activeRange]);

  const activityData = useMemo(() => {
    const byRange: Record<string, any[]> = {
      '1일': [{ label: '00시', value: 40 }, { label: '04시', value: 28 }, { label: '08시', value: 63 }, { label: '12시', value: 71 }, { label: '16시', value: 66 }, { label: '20시', value: 58 }],
      '1주': [{ label: '월', value: 62 }, { label: '화', value: 71 }, { label: '수', value: 68 }, { label: '목', value: 76 }, { label: '금', value: 64 }, { label: '토', value: 81 }, { label: '일', value: 73 }],
      '1개월': [{ label: '1주', value: 64 }, { label: '2주', value: 72 }, { label: '3주', value: 69 }, { label: '4주', value: 78 }, { label: '5주', value: 74 }, { label: '6주', value: 70 }],
      '1년': [{ label: '1월', value: 58 }, { label: '3월', value: 62 }, { label: '5월', value: 70 }, { label: '7월', value: 76 }, { label: '9월', value: 73 }, { label: '12월', value: 71 }],
      '전체': [{ label: '초기', value: 48 }, { label: '구간1', value: 57 }, { label: '구간2', value: 63 }, { label: '구간3', value: 72 }, { label: '구간4', value: 75 }, { label: '현재', value: 71 }],
      '사용자 지정': [{ label: 'A', value: 61 }, { label: 'B', value: 67 }, { label: 'C', value: 70 }, { label: 'D', value: 75 }, { label: 'E', value: 72 }, { label: 'F', value: 71 }],
    };
    return byRange[activeRange] || byRange['1주'];
  }, [activeRange]);

  const temperatureData = useMemo(() => {
    const byRange: Record<string, any[]> = {
      '1일': [{ label: '00시', value: 24.9 }, { label: '04시', value: 25.1 }, { label: '08시', value: 25.3 }, { label: '12시', value: 25.4 }, { label: '16시', value: 25.6 }, { label: '20시', value: 25.2 }],
      '1주': [{ label: '월', value: 25.0 }, { label: '화', value: 25.2 }, { label: '수', value: 25.1 }, { label: '목', value: 25.4 }, { label: '금', value: 25.5 }, { label: '토', value: 25.3 }, { label: '일', value: 25.4 }],
      '1개월': [{ label: '1주', value: 24.8 }, { label: '2주', value: 25.1 }, { label: '3주', value: 25.3 }, { label: '4주', value: 25.4 }, { label: '5주', value: 25.2 }, { label: '6주', value: 25.4 }],
      '1년': [{ label: '1월', value: 24.1 }, { label: '3월', value: 24.8 }, { label: '5월', value: 25.2 }, { label: '7월', value: 25.9 }, { label: '9월', value: 25.5 }, { label: '12월', value: 24.9 }],
      '전체': [{ label: '초기', value: 24.0 }, { label: '구간1', value: 24.6 }, { label: '구간2', value: 25.0 }, { label: '구간3', value: 25.3 }, { label: '구간4', value: 25.5 }, { label: '현재', value: 25.4 }],
      '사용자 지정': [{ label: 'A', value: 25.0 }, { label: 'B', value: 25.1 }, { label: 'C', value: 25.3 }, { label: 'D', value: 25.4 }, { label: 'E', value: 25.5 }, { label: 'F', value: 25.4 }],
    };
    return byRange[activeRange] || byRange['1주'];
  }, [activeRange]);

  const phData = useMemo(() => {
    const byRange: Record<string, any[]> = {
      '1일': [{ label: '00시', value: 6.6 }, { label: '04시', value: 6.7 }, { label: '08시', value: 6.8 }, { label: '12시', value: 6.9 }, { label: '16시', value: 6.8 }, { label: '20시', value: 6.7 }],
      '1주': [{ label: '월', value: 6.7 }, { label: '화', value: 6.8 }, { label: '수', value: 6.8 }, { label: '목', value: 6.9 }, { label: '금', value: 6.7 }, { label: '토', value: 6.8 }, { label: '일', value: 6.8 }],
      '1개월': [{ label: '1주', value: 6.6 }, { label: '2주', value: 6.8 }, { label: '3주', value: 6.9 }, { label: '4주', value: 6.8 }, { label: '5주', value: 6.7 }, { label: '6주', value: 6.8 }],
      '1년': [{ label: '1월', value: 6.4 }, { label: '3월', value: 6.6 }, { label: '5월', value: 6.7 }, { label: '7월', value: 6.9 }, { label: '9월', value: 6.8 }, { label: '12월', value: 6.8 }],
      '전체': [{ label: '초기', value: 6.3 }, { label: '구간1', value: 6.5 }, { label: '구간2', value: 6.7 }, { label: '구간3', value: 6.8 }, { label: '구간4', value: 6.9 }, { label: '현재', value: 6.8 }],
      '사용자 지정': [{ label: 'A', value: 6.7 }, { label: 'B', value: 6.8 }, { label: 'C', value: 6.9 }, { label: 'D', value: 6.8 }, { label: 'E', value: 6.8 }, { label: 'F', value: 6.8 }],
    };
    return byRange[activeRange] || byRange['1주'];
  }, [activeRange]);

  const waterLevelData = useMemo(() => {
    const byRange: Record<string, any[]> = {
      '1일': [{ label: '00시', value: 84 }, { label: '04시', value: 84 }, { label: '08시', value: 83 }, { label: '12시', value: 82 }, { label: '16시', value: 82 }, { label: '20시', value: 82 }],
      '1주': [{ label: '월', value: 84 }, { label: '화', value: 83 }, { label: '수', value: 82 }, { label: '목', value: 82 }, { label: '금', value: 81 }, { label: '토', value: 82 }, { label: '일', value: 82 }],
      '1개월': [{ label: '1주', value: 85 }, { label: '2주', value: 84 }, { label: '3주', value: 83 }, { label: '4주', value: 82 }, { label: '5주', value: 82 }, { label: '6주', value: 82 }],
      '1년': [{ label: '1월', value: 88 }, { label: '3월', value: 86 }, { label: '5월', value: 84 }, { label: '7월', value: 83 }, { label: '9월', value: 82 }, { label: '12월', value: 82 }],
      '전체': [{ label: '초기', value: 90 }, { label: '구간1', value: 88 }, { label: '구간2', value: 86 }, { label: '구간3', value: 84 }, { label: '구간4', value: 83 }, { label: '현재', value: 82 }],
      '사용자 지정': [{ label: 'A', value: 84 }, { label: 'B', value: 83 }, { label: 'C', value: 82 }, { label: 'D', value: 82 }, { label: 'E', value: 82 }, { label: 'F', value: 82 }],
    };
    return byRange[activeRange] || byRange['1주'];
  }, [activeRange]);

  const lightData = useMemo(() => {
    const byRange: Record<string, any[]> = {
      '1일': [{ label: '06시', value: 120 }, { label: '09시', value: 360 }, { label: '12시', value: 420 }, { label: '15시', value: 390 }, { label: '18시', value: 250 }, { label: '21시', value: 90 }],
      '1주': [{ label: '월', value: 390 }, { label: '화', value: 410 }, { label: '수', value: 420 }, { label: '목', value: 400 }, { label: '금', value: 415 }, { label: '토', value: 430 }, { label: '일', value: 420 }],
      '1개월': [{ label: '1주', value: 360 }, { label: '2주', value: 390 }, { label: '3주', value: 420 }, { label: '4주', value: 410 }, { label: '5주', value: 405 }, { label: '6주', value: 420 }],
      '1년': [{ label: '1월', value: 220 }, { label: '3월', value: 280 }, { label: '5월', value: 360 }, { label: '7월', value: 430 }, { label: '9월', value: 390 }, { label: '12월', value: 250 }],
      '전체': [{ label: '초기', value: 180 }, { label: '구간1', value: 260 }, { label: '구간2', value: 330 }, { label: '구간3', value: 390 }, { label: '구간4', value: 420 }, { label: '현재', value: 420 }],
      '사용자 지정': [{ label: 'A', value: 350 }, { label: 'B', value: 380 }, { label: 'C', value: 410 }, { label: 'D', value: 420 }, { label: 'E', value: 415 }, { label: 'F', value: 420 }],
    };
    return byRange[activeRange] || byRange['1주'];
  }, [activeRange]);

  const alertPriority: Record<string, number> = { 위험: 3, 주의: 2, 정보: 1 };
  const sortedAlerts = [...alerts].sort((a, b) => {
    const dateA = new Date(a.time).getTime();
    const dateB = new Date(b.time).getTime();
    if (alertSort === '최신') return dateB - dateA;
    if (alertSort === '위험도 높은 순') return (alertPriority[b.level] || 0) - (alertPriority[a.level] || 0) || dateB - dateA;
    return dateA - dateB;
  });

  const lineChartConfig: Record<string, any> = {
    '성장 그래프': { subtitle: '물고기 성장 기록', title: '성장 그래프', unit: '길이 변화(cm)', badge: activeRange, currentValue: `${growthData[growthData.length - 1]?.value ?? '-'} cm`, data: growthData, min: Math.min(...growthData.map((d) => d.value)) - 0.5, max: Math.max(...growthData.map((d) => d.value)) + 0.5, color: '#0f172a', valueSuffix: 'cm' },
    '수온 그래프': { subtitle: '수온 기록', title: '수온 그래프', unit: '수온(°C)', badge: activeRange, currentValue: `${temperatureData[temperatureData.length - 1]?.value ?? '-'}°C`, data: temperatureData, min: 24, max: 26.5, color: '#2563eb', valueSuffix: '°C' },
    'pH 그래프': { subtitle: 'pH 기록', title: 'pH 그래프', unit: 'pH 변화', badge: activeRange, currentValue: `${phData[phData.length - 1]?.value ?? '-'}`, data: phData, min: 6.2, max: 7.2, color: '#0f766e', valueSuffix: '' },
    '수위 그래프': { subtitle: '수위 기록', title: '수위 그래프', unit: '수위(%)', badge: activeRange, currentValue: `${waterLevelData[waterLevelData.length - 1]?.value ?? '-'}%`, data: waterLevelData, min: 78, max: 90, color: '#7c3aed', valueSuffix: '%' },
    '조도 그래프': { subtitle: '조도 기록', title: '조도 그래프', unit: '조도(lx)', badge: activeRange, currentValue: `${lightData[lightData.length - 1]?.value ?? '-'} lx`, data: lightData, min: 0, max: 500, color: '#d97706', valueSuffix: ' lx' },
  };

  const renderRangeButtons = () => (
    <div className="mb-4 flex flex-wrap gap-2">
      {rangeOptions.map((range) => (
        <button
          key={range}
          onClick={() => setActiveRange(range)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${activeRange === range
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
        >
          {range}
        </button>
      ))}
    </div>
  );

  const renderLineGraph = (config: any) => {
    const { subtitle, title, unit, badge, currentValue, data, min, max, color, valueSuffix } = config;
    const points = data
      .map((item: any, index: number) => {
        const x = 50 + (index * 600) / Math.max(data.length - 1, 1);
        const ratio = (item.value - min) / (max - min || 1);
        const y = 250 - ratio * 170;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <div className="relative overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">{subtitle}</div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">{title}</div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">{badge}</div>
        </div>

        {renderRangeButtons()}

        <div className="rounded-[18px] border border-slate-200 bg-gradient-to-b from-sky-50 to-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-slate-600">{unit}</div>
            <div className="text-sm font-medium text-slate-700">현재 값 {currentValue}</div>
          </div>
          <div className="relative h-[430px] rounded-[16px] border border-slate-200 bg-white p-4">
            <div className="absolute inset-x-4 top-1/4 border-t border-dashed border-slate-200" />
            <div className="absolute inset-x-4 top-2/4 border-t border-dashed border-slate-200" />
            <div className="absolute inset-x-4 top-3/4 border-t border-dashed border-slate-200" />
            <svg viewBox="0 0 700 300" className="h-full w-full overflow-visible">
              <polyline fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={points} />
              {data.map((item: any, index: number) => {
                const x = 50 + (index * 600) / Math.max(data.length - 1, 1);
                const ratio = (item.value - min) / (max - min || 1);
                const y = 250 - ratio * 170;
                const isActive = hoveredPoint?.type === title && hoveredPoint?.index === index;
                return (
                  <g key={item.label}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isActive ? '8' : '6'}
                      fill={color}
                      onMouseEnter={() => setHoveredPoint({ type: title, index, label: item.label, value: `${item.value}${valueSuffix}`, x, y })}
                      onMouseLeave={() => setHoveredPoint(null)}
                      style={{ cursor: 'pointer' }}
                    />
                    <text x={x} y={278} textAnchor="middle" fontSize="13" fill="#64748b">{item.label}</text>
                  </g>
                );
              })}
            </svg>
            {hoveredPoint?.type === title && (
              <div
                className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
                style={{ left: `${Math.min(Math.max((hoveredPoint.x / 700) * 100, 8), 86)}%`, top: `${Math.min(Math.max((hoveredPoint.y / 300) * 100 - 8, 4), 78)}%`, transform: 'translate(-50%, -100%)' }}
              >
                <div className="font-semibold text-slate-900">{hoveredPoint.label}</div>
                <div className="text-slate-500">{hoveredPoint.value}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBarGraph = () => (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">활동량 기록</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">활동량 그래프</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">{activeRange}</div>
      </div>

      {renderRangeButtons()}

      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-6">
        <div className="mb-5 flex items-center justify-between text-sm text-slate-600">
          <span>평균 활동량 71</span>
          <span>최고 활동 시점 토요일</span>
        </div>
        <div className="relative flex h-[430px] items-end justify-between gap-3 rounded-[16px] border border-slate-200 bg-white p-6">
          {activityData.map((item, index) => {
            const height = Math.max(60, item.value * 3.2);
            const isActive = hoveredBar?.index === index;
            return (
              <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-3">
                <div
                  className={`relative w-full max-w-[64px] rounded-t-[14px] transition ${isActive ? 'bg-slate-700' : 'bg-slate-900/85'}`}
                  style={{ height: `${height}px` }}
                  onMouseEnter={() => setHoveredBar({ index, label: item.label, value: item.value })}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {isActive && (
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                      <div className="font-semibold text-slate-900">{item.label}</div>
                      <div className="text-slate-500">{item.value}</div>
                    </div>
                  )}
                </div>
                <div className="text-sm text-slate-500">{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderAlertPanel = () => (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">이벤트 및 알림 기록</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">알림 목록</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">{alertSort}</div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {['최신', '위험도 높은 순', '오래된 순'].map((sort) => (
          <button
            key={sort}
            onClick={() => setAlertSort(sort)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${alertSort === sort
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
          >
            {sort}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
        {sortedAlerts.map((alert) => (
          <div key={`${alert.title}-${alert.time}`} className="rounded-[16px] border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-900">{alert.title}</div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses[alert.level] || ''}`}>{alert.level}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">{alert.time}</div>
            <div className="mt-3 text-sm leading-6 text-slate-700">{alert.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRecordMainContent = () => {
    if (activeRecordTab === '활동량 그래프') return renderBarGraph();
    if (activeRecordTab === '알림') return renderAlertPanel();
    return renderLineGraph(lineChartConfig[activeRecordTab]);
  };

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-500">기록 메뉴</div>
          <div className="space-y-3">
            {recordTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveRecordTab(tab);
                  setHoveredPoint(null);
                  setHoveredBar(null);
                }}
                className={`w-full rounded-[14px] border px-4 py-4 text-left text-sm font-medium transition ${activeRecordTab === tab ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-4">
        {renderRecordMainContent()}
      </div>
    </div>
  );
};

export default Records;
