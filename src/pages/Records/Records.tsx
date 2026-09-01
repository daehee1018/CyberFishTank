import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useAppContext,
} from '../../context/AppContext';


// ============================================================
// DB에서 받아오는 센서 데이터 타입
// ============================================================

interface SensorRecord {

  id: number;

  timestamp: string;

  millis?: number;

  temperature: number | null;

  ph: number | null;

  ph_voltage?: number | null;

  tds?: number | null;

  tds_voltage?: number | null;

  turbidity_voltage?: number | null;

  turbidity_delta?: number | null;

  turbidity_warning?: string;

  water_level_detected?: string;

}


// ============================================================
// Records
// ============================================================

const Records: React.FC = () => {

  const {
    alerts,
  } = useAppContext();


  // ==========================================================
  // 기록 탭
  // ==========================================================

  const recordTabs = [
    '성장 그래프',
    '활동량 그래프',
    '수온 그래프',
    'pH 그래프',
    '알림',
  ];


  // ==========================================================
  // 기간
  // ==========================================================

  const rangeOptions = [
    '1일',
    '1주',
    '1개월',
    '1년',
    '전체',
  ];


  // ==========================================================
  // 상태
  // ==========================================================

  // ⭐ 처음 들어오면 수온 그래프를 바로 보여줌
  const [
    activeRecordTab,
    setActiveRecordTab,
  ] = useState('수온 그래프');


  const [
    activeRange,
    setActiveRange,
  ] = useState('1일');


  const [
    alertSort,
    setAlertSort,
  ] = useState('최신');


  const [
    sensorHistory,
    setSensorHistory,
  ] = useState<SensorRecord[]>([]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState<string | null>(null);


  const [
    hoveredPoint,
    setHoveredPoint,
  ] = useState<any>(null);


  // ==========================================================
  // DB에서 센서 데이터 가져오기
  //
  // WebSocket 사용 안 함
  //
  // Node.js
  //     ↓
  // SQLite
  //     ↓
  // GET /api/sensor-data
  //     ↓
  // React
  // ==========================================================

  useEffect(() => {

    const loadSensorData = async () => {

      try {

        setLoading(true);

        setError(null);


        console.log(
          '📡 DB 센서 데이터 요청'
        );


        const response =
          await fetch(
            '/api/sensor-data'
          );


        if (!response.ok) {

          throw new Error(
            `서버 응답 오류: ${response.status}`
          );

        }


        const result =
          await response.json();


        console.log(
          '💾 DB에서 받은 센서 데이터:',
          result
        );


        if (
          !result.success
        ) {

          throw new Error(
            result.error ||
            '센서 데이터를 가져오지 못했습니다.'
          );

        }


        setSensorHistory(
          result.data || []
        );


        console.log(
          `✅ DB 센서 데이터 ${result.data?.length || 0}개 로드`
        );

      } catch (err: any) {

        console.error(
          '❌ DB 센서 데이터 조회 실패:',
          err
        );


        setError(
          err.message ||
          '센서 데이터를 가져오지 못했습니다.'
        );

      } finally {

        setLoading(false);

      }

    };


    loadSensorData();

  }, []);


  // ==========================================================
  // 선택한 기간만 필터링
  // ==========================================================

  const filteredSensorHistory =
    useMemo(() => {

      if (
        sensorHistory.length === 0
      ) {

        return [];

      }


      if (
        activeRange === '전체'
      ) {

        return sensorHistory;

      }


      const hours: Record<
        string,
        number
      > = {

        '1일': 24,

        '1주': 24 * 7,

        '1개월': 24 * 30,

        '1년': 24 * 365,

      };


      const targetHours =
        hours[activeRange];


      if (!targetHours) {

        return sensorHistory;

      }


      const now =
        Date.now();


      const startTime =
        now -
        targetHours *
        60 *
        60 *
        1000;


      return sensorHistory.filter(
        (item) => {

          const time =
            new Date(
              item.timestamp
            ).getTime();


          return (
            !Number.isNaN(time) &&
            time >= startTime
          );

        }
      );

    }, [
      sensorHistory,
      activeRange,
    ]);


  // ==========================================================
  // 그래프 데이터 생성
  // ==========================================================

  const getGraphData = (
    key:
      | 'temperature'
      | 'ph'
  ) => {

    return filteredSensorHistory
      .filter(
        (item) =>
          item[key] !== null &&
          item[key] !== undefined &&
          !Number.isNaN(
            Number(item[key])
          )
      )
      .map(
        (item) => ({

          label:
            new Date(
              item.timestamp
            ).toLocaleTimeString(
              'ko-KR',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            ),

          value:
            Number(item[key]),

          timestamp:
            item.timestamp,

        })
      );

  };


  // ==========================================================
  // 수온 / pH 그래프 데이터
  // ==========================================================

  const temperatureData =
    useMemo(
      () =>
        getGraphData(
          'temperature'
        ),
      [filteredSensorHistory]
    );


  const phData =
    useMemo(
      () =>
        getGraphData(
          'ph'
        ),
      [filteredSensorHistory]
    );


  // ==========================================================
  // 그래프 설정
  // ==========================================================

  const lineChartConfig: Record<
    string,
    any
  > = {

    '수온 그래프': {

      subtitle:
        'DB에 저장된 센서 수온 기록',

      title:
        '수온 그래프',

      unit:
        '수온(°C)',

      data:
        temperatureData,

      defaultMin:
        20,

      defaultMax:
        30,

      suffix:
        '°C',

    },


    'pH 그래프': {

      subtitle:
        'DB에 저장된 센서 pH 기록',

      title:
        'pH 그래프',

      unit:
        'pH',

      data:
        phData,

      defaultMin:
        5,

      defaultMax:
        9,

      suffix:
        '',

    },

  };


  // ==========================================================
  // 그래프 최소값
  // ==========================================================

  const getChartMin = (
    data: any[],
    defaultMin: number
  ) => {

    if (
      data.length === 0
    ) {

      return defaultMin;

    }


    const values =
      data.map(
        (item) =>
          item.value
      );


    const min =
      Math.min(...values);


    return min - 0.5;

  };


  // ==========================================================
  // 그래프 최대값
  // ==========================================================

  const getChartMax = (
    data: any[],
    defaultMax: number
  ) => {

    if (
      data.length === 0
    ) {

      return defaultMax;

    }


    const values =
      data.map(
        (item) =>
          item.value
      );


    const max =
      Math.max(...values);


    return max + 0.5;

  };


  // ==========================================================
  // 기간 버튼
  // ==========================================================

  const renderRangeButtons =
    () => (

      <div className="mb-4 flex flex-wrap gap-2">

        {rangeOptions.map(
          (range) => (

            <button
              key={range}
              onClick={() => {

                setActiveRange(
                  range
                );

                setHoveredPoint(
                  null
                );

              }}
              className={`
                rounded-full
                border
                px-3
                py-1.5
                text-sm
                transition

                ${
                  activeRange === range

                    ? 'border-slate-900 bg-slate-900 text-white'

                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }
              `}
            >

              {range}

            </button>

          )
        )}

      </div>

    );


  // ==========================================================
  // 라인 그래프
  // ==========================================================

  const renderLineGraph =
    (config: any) => {

      const {
        subtitle,
        title,
        data,
        defaultMin,
        defaultMax,
        suffix,
      } = config;


      // ======================================================
      // 로딩
      // ======================================================

      if (loading) {

        return (

          <div className="rounded-[20px] border border-slate-200 bg-white p-5">

            <div className="text-sm text-slate-500">
              센서 데이터 불러오는 중
            </div>

            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {title}
            </div>

            <div className="flex h-[430px] items-center justify-center">

              <div className="text-sm text-slate-400">
                SQLite DB에서 데이터를 가져오고 있습니다...
              </div>

            </div>

          </div>

        );

      }


      // ======================================================
      // 오류
      // ======================================================

      if (error) {

        return (

          <div className="rounded-[20px] border border-rose-200 bg-white p-5">

            <div className="text-sm text-rose-500">
              센서 데이터 오류
            </div>

            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {title}
            </div>

            <div className="mt-6 rounded-[16px] bg-rose-50 p-6 text-sm text-rose-700">

              {error}

            </div>

          </div>

        );

      }


      // ======================================================
      // 데이터 없음
      // ======================================================

      if (
        data.length === 0
      ) {

        return (

          <div className="rounded-[20px] border border-slate-200 bg-white p-5">

            <div className="mb-4">

              <div className="text-sm text-slate-500">
                {subtitle}
              </div>

              <div className="text-2xl font-semibold text-slate-900">
                {title}
              </div>

            </div>


            {renderRangeButtons()}


            <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-10 text-center">

              <div className="text-sm text-slate-500">
                선택한 기간에 센서 기록이 없습니다.
              </div>

              <div className="mt-2 text-xs text-slate-400">

                전체 DB 기록:
                {' '}
                {sensorHistory.length.toLocaleString()}
                개

              </div>

            </div>

          </div>

        );

      }


      // ======================================================
      // 현재 값
      // ======================================================

      const currentValue =
        data[data.length - 1].value;


      // ======================================================
      // 그래프 범위
      // ======================================================

      const min =
        getChartMin(
          data,
          defaultMin
        );


      const max =
        getChartMax(
          data,
          defaultMax
        );


      // ======================================================
      // 그래프 좌표
      // ======================================================

      const points =
        data
          .map(
            (
              item: any,
              index: number
            ) => {

              const x =
                30 +
                (
                  index *
                  640
                ) /
                Math.max(
                  data.length - 1,
                  1
                );


              const ratio =
                (
                  item.value -
                  min
                ) /
                (
                  max -
                  min ||
                  1
                );


              const y =
                250 -
                ratio *
                180;


              return `${x},${y}`;

            }
          )
          .join(' ');


      // ======================================================
      // X축 표시 간격
      // ======================================================

      const labelStep =
        data.length <= 24
          ? 1
          : data.length <= 168
            ? 12
            : data.length <= 720
              ? 48
              : 144;


      return (

        <div className="relative overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5">


          {/* 제목 */}

          <div className="mb-4 flex items-center justify-between">

            <div>

              <div className="text-sm text-slate-500">
                {subtitle}
              </div>

              <div className="text-2xl font-semibold tracking-tight text-slate-900">
                {title}
              </div>

            </div>


            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">

              {activeRange}

            </div>

          </div>


          {/* 기간 */}

          {renderRangeButtons()}


          {/* 데이터 정보 */}

          <div className="mb-3 flex items-center justify-between">

            <div className="text-xs text-slate-500">

              DB 기록
              {' '}
              {data.length.toLocaleString()}
              개

              <span className="ml-2">
                · 10분 간격
              </span>

            </div>


            <div className="text-sm font-medium text-slate-700">

              현재 값&nbsp;

              {currentValue}
              {suffix}

            </div>

          </div>


          {/* 그래프 */}

          <div className="relative rounded-[18px] border border-slate-200 bg-gradient-to-b from-sky-50 to-white p-5">

            <div className="relative h-[430px] rounded-[16px] border border-slate-200 bg-white">


              {/* 가로선 */}

              <div className="absolute inset-x-5 top-1/4 border-t border-dashed border-slate-200" />

              <div className="absolute inset-x-5 top-2/4 border-t border-dashed border-slate-200" />

              <div className="absolute inset-x-5 top-3/4 border-t border-dashed border-slate-200" />


              <svg
                viewBox="0 0 700 300"
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
              >


                {/* 선 */}

                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />


                {/* 데이터 포인트 */}

                {data.map(
                  (
                    item: any,
                    index: number
                  ) => {

                    const x =
                      30 +
                      (
                        index *
                        640
                      ) /
                      Math.max(
                        data.length - 1,
                        1
                      );


                    const ratio =
                      (
                        item.value -
                        min
                      ) /
                      (
                        max -
                        min ||
                        1
                      );


                    const y =
                      250 -
                      ratio *
                      180;


                    const isActive =
                      hoveredPoint?.index ===
                      index;


                    return (

                      <g
                        key={
                          `${item.timestamp}-${index}`
                        }
                      >

                        <circle
                          cx={x}
                          cy={y}
                          r={
                            isActive
                              ? 7
                              : data.length > 200
                                ? 2
                                : 4
                          }
                          fill="#2563eb"
                          onMouseEnter={() =>
                            setHoveredPoint({

                              index,

                              label:
                                new Date(
                                  item.timestamp
                                ).toLocaleString(
                                  'ko-KR'
                                ),

                              value:
                                `${item.value}${suffix}`,

                            })
                          }
                          onMouseLeave={() =>
                            setHoveredPoint(
                              null
                            )
                          }
                          style={{
                            cursor:
                              'pointer',
                          }}
                        />


                        {/* X축 */}

                        {(
                          index %
                          labelStep ===
                          0
                        ) && (

                          <text
                            x={x}
                            y={278}
                            textAnchor="middle"
                            fontSize="11"
                            fill="#64748b"
                          >

                            {item.label}

                          </text>

                        )}

                      </g>

                    );

                  }
                )}

              </svg>


              {/* 툴팁 */}

              {hoveredPoint && (

                <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">

                  <div className="font-semibold text-slate-900">
                    {hoveredPoint.label}
                  </div>

                  <div className="mt-1 text-slate-500">
                    {hoveredPoint.value}
                  </div>

                </div>

              )}

            </div>

          </div>

        </div>

      );

    };


  // ==========================================================
  // 알림 정렬
  // ==========================================================

  const alertPriority: Record<
    string,
    number
  > = {

    위험: 3,

    주의: 2,

    정보: 1,

  };


  const sortedAlerts =
    [...alerts].sort(
      (a, b) => {

        const dateA =
          new Date(
            a.time
          ).getTime();


        const dateB =
          new Date(
            b.time
          ).getTime();


        if (
          alertSort === '최신'
        ) {

          return dateB - dateA;

        }


        if (
          alertSort ===
          '위험도 높은 순'
        ) {

          return (
            (
              alertPriority[b.level] ||
              0
            ) -
            (
              alertPriority[a.level] ||
              0
            )
          ) ||
          (
            dateB - dateA
          );

        }


        return dateA - dateB;

      }
    );


  // ==========================================================
  // 알림
  // ==========================================================

  const renderAlertPanel =
    () => (

      <div className="rounded-[20px] border border-slate-200 bg-white p-5">

        <div className="mb-4 flex items-center justify-between">

          <div>

            <div className="text-sm text-slate-500">
              이벤트 및 알림 기록
            </div>

            <div className="text-2xl font-semibold text-slate-900">
              알림 목록
            </div>

          </div>

          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
            {alertSort}
          </div>

        </div>


        <div className="mb-4 flex flex-wrap gap-2">

          {[
            '최신',
            '위험도 높은 순',
            '오래된 순',
          ].map(
            (sort) => (

              <button
                key={sort}
                onClick={() =>
                  setAlertSort(
                    sort
                  )
                }
                className={`
                  rounded-full
                  border
                  px-3
                  py-1.5
                  text-sm

                  ${
                    alertSort === sort
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600'
                  }
                `}
              >

                {sort}

              </button>

            )
          )}

        </div>


        <div className="space-y-3">

          {sortedAlerts.map(
            (alert) => (

              <div
                key={`${alert.title}-${alert.time}`}
                className="rounded-[16px] border border-slate-200 bg-slate-50 p-4"
              >

                <div className="flex items-center justify-between">

                  <div className="font-semibold text-slate-900">
                    {alert.title}
                  </div>

                  <span className="rounded-full border px-2.5 py-1 text-[11px]">
                    {alert.level}
                  </span>

                </div>

                <div className="mt-2 text-xs text-slate-500">
                  {alert.time}
                </div>

                <div className="mt-3 text-sm leading-6 text-slate-700">
                  {alert.detail}
                </div>

              </div>

            )
          )}

        </div>

      </div>

    );


  // ==========================================================
  // 메인 컨텐츠
  // ==========================================================

  const renderRecordMainContent =
    () => {

      if (
        activeRecordTab ===
        '알림'
      ) {

        return renderAlertPanel();

      }


      if (
        activeRecordTab ===
        '성장 그래프'
      ) {

        return (

          <div className="rounded-[20px] border border-slate-200 bg-white p-8">

            <div className="text-sm text-slate-500">
              물고기 성장 기록
            </div>

            <div className="mt-1 text-2xl font-semibold">
              성장 그래프
            </div>

            <div className="mt-6 text-sm text-slate-500">
              성장 데이터는 현재 센서 데이터와 별도로 관리됩니다.
            </div>

          </div>

        );

      }


      if (
        activeRecordTab ===
        '활동량 그래프'
      ) {

        return (

          <div className="rounded-[20px] border border-slate-200 bg-white p-8">

            <div className="text-sm text-slate-500">
              활동량 기록
            </div>

            <div className="mt-1 text-2xl font-semibold">
              활동량 그래프
            </div>

            <div className="mt-6 text-sm text-slate-500">
              YOLO 활동량 데이터가 연결되면 표시됩니다.
            </div>

          </div>

        );

      }


      return renderLineGraph(
        lineChartConfig[
          activeRecordTab
        ]
      );

    };


  // ==========================================================
  // 화면
  // ==========================================================

  return (

    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">


      {/* 왼쪽 */}

      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">

        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">

          <div className="mb-3 text-sm font-semibold text-slate-500">
            기록 메뉴
          </div>


          <div className="space-y-3">

            {recordTabs.map(
              (tab) => (

                <button
                  key={tab}
                  onClick={() => {

                    setActiveRecordTab(
                      tab
                    );

                    setHoveredPoint(
                      null
                    );

                  }}
                  className={`
                    w-full
                    rounded-[14px]
                    border
                    px-4
                    py-4
                    text-left
                    text-sm
                    font-medium
                    transition

                    ${
                      activeRecordTab === tab
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }
                  `}
                >

                  {tab}

                </button>

              )
            )}

          </div>

        </div>

      </aside>


      {/* 오른쪽 */}

      <div className="space-y-4">


        {/* DB 상태 */}

        <div className="flex items-center justify-between rounded-[14px] border border-slate-200 bg-white px-4 py-3">

          <div className="text-sm text-slate-600">

            센서 데이터 기록

          </div>


          <div className="text-xs text-slate-500">

            SQLite DB
            {' · '}
            {sensorHistory.length.toLocaleString()}
            개 기록

          </div>

        </div>


        {renderRecordMainContent()}

      </div>

    </div>

  );

};


export default Records;