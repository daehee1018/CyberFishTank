import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { useAppContext } from '../../context/AppContext';

interface DbSensorData {
  id?: number;
  temperature?: number | null;
  ph?: number | null;
  water_level?: number | null;
  timestamp: string;
}

interface DbGrowthData {
  id?: number;
  date: string;
  daily_length_px?: number | null;
  daily_length_mm?: number | null;
  quality_flag?: string | null;
  calculated_at?: string;
}

interface DbActivityData {
  id?: number;
  date: string;
  total_distance?: number | null;
  average_speed?: number | null;
  max_speed?: number | null;
  quality_flag?: string | null;
  calculated_at?: string;
}

interface ChartData {
  label: string;
  value: number | null;
  timestamp: string;
}

type SensorKey =
  | 'temperature'
  | 'ph';

const Records: React.FC = () => {

  // ======================================================
  // 전역 알람 상태
  // AppContext에서 DB 과거 알람 및 실시간 WebSocket 알람을 관리
  // ======================================================

  const { alerts } = useAppContext();

  // ======================================================
  // 메뉴
  // ======================================================

  const recordTabs = [
    '성장 그래프',
    '활동량 그래프',
    '수온 그래프',
    'pH 그래프',
    '알림',
  ];

  const rangeOptions = [
    '1일',
    '1주',
    '3개월',
    '1년',
    '전체',
  ];

  const growthRangeOptions = [
  '1주',
  '3개월',
  '1년',
  '전체',
];

  const [activeRecordTab, setActiveRecordTab] =
    useState('성장 그래프');

  const [activeRange, setActiveRange] =
    useState('1주');

  const [alertSort, setAlertSort] =
    useState('최신');

  const [alertPage, setAlertPage] =
    useState(1);

  const ALERTS_PER_PAGE = 5;

  const [hoveredPoint, setHoveredPoint] =
    useState<any>(null);

  const [hoveredBar, setHoveredBar] =
    useState<any>(null);

  // ======================================================
  // DB 센서 데이터
  // ======================================================

  const [dbSensorData, setDbSensorData] =
    useState<DbSensorData[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [dbError, setDbError] =
    useState('');

  // ======================================================
  // DB 성장 데이터
  // ======================================================

  const [dbGrowthData, setDbGrowthData] =
    useState<DbGrowthData[]>([]);

  // ======================================================
  // DB 활동량 데이터
  // ======================================================

  const [dbActivityData, setDbActivityData] =
    useState<DbActivityData[]>([]);

  // ======================================================
  // Records 페이지 접속 시간
  //
  // 1일 그래프의 기준 시간
  // ======================================================

  const connectedAtRef =
    useRef(new Date());

  // ======================================================
  // 숫자 변환
  // ======================================================

  function toNumberOrNull(
    value: any
  ): number | null {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return null;
    }

    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  }

  // ======================================================
  // timestamp -> milliseconds
  // ======================================================

  const getTimestamp = (
    item: DbSensorData
  ): number => {
    const time =
      new Date(
        item.timestamp
      ).getTime();

    return Number.isFinite(time)
      ? time
      : NaN;
  };

  // ======================================================
  // 평균 계산
  //
  // null / undefined / NaN 제외
  // ======================================================

  const calculateAverage = (
    values: Array<
      number | null | undefined
    >
  ): number | null => {

    const validValues =
      values.filter(
        (
          value
        ): value is number =>
          typeof value === 'number' &&
          Number.isFinite(value)
      );

    if (
      validValues.length === 0
    ) {
      return null;
    }

    const sum =
      validValues.reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      );

    return Number(
      (
        sum /
        validValues.length
      ).toFixed(2)
    );
  };

  // ======================================================
  // 날짜 KEY
  //
  // YYYY-MM-DD
  // ======================================================

  const getDayKey = (
    date: Date
  ): string => {

    return (
      `${date.getFullYear()}-` +
      `${String(
        date.getMonth() + 1
      ).padStart(2, '0')}-` +
      `${String(
        date.getDate()
      ).padStart(2, '0')}`
    );
  };

  // ======================================================
  // 월 KEY
  //
  // YYYY-MM
  // ======================================================

  const getMonthKey = (
    date: Date
  ): string => {

    return (
      `${date.getFullYear()}-` +
      `${String(
        date.getMonth() + 1
      ).padStart(2, '0')}`
    );
  };

  // ======================================================
  // DB 데이터 가져오기
  //
  // 3초마다 최신 센서 데이터 확인
  // ======================================================

  useEffect(() => {

    let cancelled = false;

    const loadSensorData =
      async () => {

        try {

          const response =
            await fetch(
              '/api/sensor-data',
              {
                cache: 'no-store',
              }
            );

          if (!response.ok) {
            throw new Error(
              `센서 데이터 조회 실패 (${response.status})`
            );
          }

          const result =
            await response.json();

          const rows =
            Array.isArray(result)
              ? result
              : Array.isArray(result.data)
                ? result.data
                : Array.isArray(result.sensorData)
                  ? result.sensorData
                  : [];

          const normalized:
            DbSensorData[] =
            rows
              .map(
                (item: any) => ({
                  id:
                    typeof item.id === 'number'
                      ? item.id
                      : undefined,

                  temperature:
                    toNumberOrNull(
                      item.temperature
                    ),

                  ph:
                    toNumberOrNull(
                      item.ph
                    ),

                  water_level:
                    toNumberOrNull(
                      item.water_level
                    ),

                  timestamp:
                    item.timestamp ||
                    item.created_at ||
                    item.time ||
                    '',
                })
              )
              .filter(
                (
                  item: DbSensorData
                ) =>
                  Boolean(
                    item.timestamp
                  )
              );

          if (cancelled) {
            return;
          }

          setDbSensorData(
            normalized
          );

          setIsLoading(false);

        } catch (error) {

          console.error(
            'DB 센서 데이터 조회 오류:',
            error
          );

          if (!cancelled) {

            setDbError(
              'DB 센서 데이터를 불러오지 못했습니다.'
            );

            setDbSensorData([]);

            setIsLoading(false);
          }
        }
      };

    // 최초 실행
    loadSensorData();

    // 3초마다 확인
    const intervalId =
      window.setInterval(
        loadSensorData,
        3000
      );

    return () => {

      cancelled = true;

      window.clearInterval(
        intervalId
      );
    };

  }, []);


  // ======================================================
  // DB 성장 데이터 가져오기
  //
  // daily_growth 테이블의 데이터를 조회
  // ======================================================

  useEffect(() => {

    let cancelled = false;

    const loadGrowthData =
      async () => {

        try {

          const response =
            await fetch(
              '/api/growth/daily',
              {
                cache: 'no-store',
              }
            );

          if (!response.ok) {
            throw new Error(
              `성장 데이터 조회 실패 (${response.status})`
            );
          }

          const result =
            await response.json();

          const rows =
            Array.isArray(result)
              ? result
              : Array.isArray(result.data)
                ? result.data
                : [];

          const normalized:
            DbGrowthData[] =
            rows
              .map(
                (item: any) => ({
                  id:
                    typeof item.id === 'number'
                      ? item.id
                      : undefined,

                  date:
                    item.date ||
                    '',

                  daily_length_px:
                    toNumberOrNull(
                      item.daily_length_px
                    ),

                  daily_length_mm:
                    toNumberOrNull(
                      item.daily_length_mm
                    ),

                  quality_flag:
                    item.quality_flag ||
                    null,

                  calculated_at:
                    item.calculated_at ||
                    '',
                })
              )
              .filter(
                (
                  item: DbGrowthData
                ) =>
                  Boolean(
                    item.date
                  ) &&
                  item.daily_length_mm !== null
              )
              .sort(
                (
                  a: DbGrowthData,
                  b: DbGrowthData
                ) =>
                  a.date.localeCompare(
                    b.date
                  )
              );

          if (cancelled) {
            return;
          }

          setDbGrowthData(
            normalized
          );

        } catch (error) {

          console.error(
            'DB 성장 데이터 조회 오류:',
            error
          );

          if (!cancelled) {
            setDbGrowthData([]);
          }
        }
      };

    // 최초 실행
    loadGrowthData();

    // 10초마다 최신 성장 데이터 확인
    const intervalId =
      window.setInterval(
        loadGrowthData,
        10000
      );

    return () => {

      cancelled = true;

      window.clearInterval(
        intervalId
      );
    };

  }, []);


  // ======================================================
  // DB 활동량 데이터 가져오기
  //
  // daily_activity 테이블의 데이터를 조회
  // ======================================================

  useEffect(() => {

    let cancelled = false;

    const loadActivityData =
      async () => {

        try {

          const response =
            await fetch(
              '/api/activity/daily',
              {
                cache: 'no-store',
              }
            );

          if (!response.ok) {
            throw new Error(
              `활동량 데이터 조회 실패 (${response.status})`
            );
          }

          const result =
            await response.json();

          const rows =
            Array.isArray(result)
              ? result
              : Array.isArray(result.data)
                ? result.data
                : [];

          const normalized:
            DbActivityData[] =
            rows
              .map(
                (item: any) => ({
                  id:
                    typeof item.id === 'number'
                      ? item.id
                      : undefined,

                  date:
                    item.date ||
                    '',

                  total_distance:
                    toNumberOrNull(
                      item.total_distance
                    ),

                  average_speed:
                    toNumberOrNull(
                      item.average_speed
                    ),

                  max_speed:
                    toNumberOrNull(
                      item.max_speed
                    ),

                  quality_flag:
                    item.quality_flag ||
                    null,

                  calculated_at:
                    item.calculated_at ||
                    '',
                })
              )
              .filter(
                (
                  item: DbActivityData
                ) =>
                  Boolean(
                    item.date
                  ) &&
                  item.total_distance !== null
              )
              .sort(
                (
                  a: DbActivityData,
                  b: DbActivityData
                ) =>
                  a.date.localeCompare(
                    b.date
                  )
              );

          if (
            cancelled
          ) {
            return;
          }

          setDbActivityData(
            normalized
          );

        } catch (
          error
        ) {

          console.error(
            'DB 활동량 데이터 조회 오류:',
            error
          );

          if (
            !cancelled
          ) {
            setDbActivityData([]);
          }
        }
      };

    loadActivityData();

    return () => {

      cancelled = true;
    };

  }, []);


  // ======================================================
  // ★ 1일 데이터
  //
  // 최근 24시간을 1시간 단위로 평균 계산
  //
  // 예:
  //
  // 16:00 ~ 16:59 → 16시 평균
  // 17:00 ~ 17:59 → 17시 평균
  // 18:00 ~ 18:59 → 18시 평균
  //
  // 페이지 접속 시간을 기준으로
  // 이전 24시간의 데이터 사용
  // ======================================================

  const getHourlyAverageData = (
    key: SensorKey
  ): ChartData[] => {

    const end =
      connectedAtRef.current.getTime();

    const start =
      end -
      24 *
        60 *
        60 *
        1000;

    const buckets:
      Record<
        string,
        DbSensorData[]
      > = {};

    for (
      const item of dbSensorData
    ) {

      const timestamp =
        getTimestamp(item);

      if (
        !Number.isFinite(timestamp)
      ) {
        continue;
      }

      if (
        timestamp < start ||
        timestamp > end
      ) {
        continue;
      }

      const date =
        new Date(
          timestamp
        );

      const hourStart =
        new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          date.getHours(),
          0,
          0,
          0
        );

      const hourKey =
        hourStart.getTime().toString();

      if (
        !buckets[hourKey]
      ) {
        buckets[hourKey] = [];
      }

      buckets[hourKey].push(
        item
      );
    }

    return Object.entries(
      buckets
    )
      .sort(
        ([a], [b]) =>
          Number(a) -
          Number(b)
      )
      .map(
        (
          [
            hourKey,
            items,
          ]
        ) => {

          const average =
            calculateAverage(
              items.map(
                item =>
                  item[key]
              )
            );

          if (
            average === null
          ) {
            return null;
          }

          const date =
            new Date(
              Number(hourKey)
            );

          return {
            label:
              `${String(
                date.getHours()
              ).padStart(
                2,
                '0'
              )}시`,

            value:
              average,

            timestamp:
              date.toISOString(),
          };
        }
      )
      .filter(
        (
          item
        ): item is ChartData =>
          item !== null
      );
  };

  // ======================================================
  // 최근 N일 일별 평균
  //
  // 1주 → 최근 7일
  //
  // 접속한 날짜를 기준으로 계산
  // ======================================================

  const getDailyAverageData = (
    key: SensorKey,
    days: number
  ): ChartData[] => {

    const connectedDate =
      new Date(
        connectedAtRef.current
      );

    const endDate =
      new Date(
        connectedDate
      );

    endDate.setHours(
      23,
      59,
      59,
      999
    );

    const startDate =
      new Date(
        connectedDate
      );

    startDate.setHours(
      0,
      0,
      0,
      0
    );

    startDate.setDate(
      startDate.getDate() -
        (days - 1)
    );

    const start =
      startDate.getTime();

    const end =
      endDate.getTime();

    const buckets:
      Record<
        string,
        DbSensorData[]
      > = {};

    for (
      const item of dbSensorData
    ) {

      const timestamp =
        getTimestamp(item);

      if (
        !Number.isFinite(timestamp)
      ) {
        continue;
      }

      if (
        timestamp < start ||
        timestamp > end
      ) {
        continue;
      }

      const date =
        new Date(
          timestamp
        );

      const dayKey =
        getDayKey(date);

      if (
        !buckets[dayKey]
      ) {
        buckets[dayKey] = [];
      }

      buckets[dayKey].push(
        item
      );
    }

    return Object.entries(
      buckets
    )
      .sort(
        ([a], [b]) =>
          a.localeCompare(b)
      )
      .map(
        (
          [
            dayKey,
            items,
          ]
        ) => {

          const average =
            calculateAverage(
              items.map(
                item =>
                  item[key]
              )
            );

          if (
            average === null
          ) {
            return null;
          }

          const [
            year,
            month,
            day,
          ] =
            dayKey
              .split('-')
              .map(Number);

          return {
            label:
              `${month}/${day}`,

            value:
              average,

            timestamp:
              new Date(
                year,
                month - 1,
                day
              ).toISOString(),
          };
        }
      )
      .filter(
        (
          item
        ): item is ChartData =>
          item !== null
      );
  };

  // ======================================================
  // ★ 최근 3개월 주별 평균
  //
  // 최근 3개월 동안
  // 7일 단위로 데이터를 묶어서 평균 계산
  // ======================================================

  const getWeeklyAverageData = (
    key: SensorKey
  ): ChartData[] => {

    const connectedDate =
      new Date(
        connectedAtRef.current
      );

    const endDate =
      new Date(
        connectedDate
      );

    endDate.setHours(
      23,
      59,
      59,
      999
    );

    const startDate =
      new Date(
        connectedDate
      );

    startDate.setHours(
      0,
      0,
      0,
      0
    );

    startDate.setMonth(
      startDate.getMonth() - 3
    );

    const start =
      startDate.getTime();

    const end =
      endDate.getTime();

    const buckets:
      Record<
        string,
        DbSensorData[]
      > = {};

    for (
      const item of dbSensorData
    ) {

      const timestamp =
        getTimestamp(item);

      if (
        !Number.isFinite(timestamp)
      ) {
        continue;
      }

      if (
        timestamp < start ||
        timestamp > end
      ) {
        continue;
      }

      const date =
        new Date(
          timestamp
        );

      const diffMs =
        date.getTime() -
        startDate.getTime();

      const diffDays =
        Math.floor(
          diffMs /
            (
              24 *
              60 *
              60 *
              1000
            )
        );

      const weekIndex =
        Math.floor(
          diffDays / 7
        );

      const weekStart =
        new Date(
          startDate
        );

      weekStart.setDate(
        weekStart.getDate() +
          weekIndex * 7
      );

      const weekKey =
        weekStart
          .getTime()
          .toString();

      if (
        !buckets[weekKey]
      ) {
        buckets[weekKey] = [];
      }

      buckets[weekKey].push(
        item
      );
    }

    return Object.entries(
      buckets
    )
      .sort(
        ([a], [b]) =>
          Number(a) -
          Number(b)
      )
      .map(
        (
          [
            weekKey,
            items,
          ]
        ) => {

          const average =
            calculateAverage(
              items.map(
                item =>
                  item[key]
              )
            );

          if (
            average === null
          ) {
            return null;
          }

          const weekStart =
            new Date(
              Number(weekKey)
            );

          const weekEnd =
            new Date(
              weekStart
            );

          weekEnd.setDate(
            weekEnd.getDate() + 6
          );

          if (
            weekEnd.getTime() >
            end
          ) {
            weekEnd.setTime(
              end
            );
          }

          const startLabel =
            `${weekStart.getMonth() + 1}/` +
            `${weekStart.getDate()}`;

          const endLabel =
            `${weekEnd.getMonth() + 1}/` +
            `${weekEnd.getDate()}`;

          return {
            label:
              `${startLabel}~${endLabel}`,

            value:
              average,

            timestamp:
              weekStart.toISOString(),
          };
        }
      )
      .filter(
        (
          item
        ): item is ChartData =>
          item !== null
      );
  };

  // ======================================================
  // 최근 12개월 월별 평균
  // ======================================================

  const getMonthlyAverageData = (
    key: SensorKey
  ): ChartData[] => {

    const connectedDate =
      new Date(
        connectedAtRef.current
      );

    const currentMonth =
      new Date(
        connectedDate.getFullYear(),
        connectedDate.getMonth(),
        1
      );

    const startMonth =
      new Date(
        currentMonth
      );

    startMonth.setMonth(
      startMonth.getMonth() - 11
    );

    const start =
      startMonth.getTime();

    const endMonth =
      new Date(
        currentMonth
      );

    endMonth.setMonth(
      endMonth.getMonth() + 1
    );

    endMonth.setMilliseconds(
      -1
    );

    const end =
      endMonth.getTime();

    const buckets:
      Record<
        string,
        DbSensorData[]
      > = {};

    for (
      const item of dbSensorData
    ) {

      const timestamp =
        getTimestamp(item);

      if (
        !Number.isFinite(timestamp)
      ) {
        continue;
      }

      if (
        timestamp < start ||
        timestamp > end
      ) {
        continue;
      }

      const date =
        new Date(
          timestamp
        );

      const monthKey =
        getMonthKey(date);

      if (
        !buckets[monthKey]
      ) {
        buckets[monthKey] = [];
      }

      buckets[monthKey].push(
        item
      );
    }

    return Object.entries(
      buckets
    )
      .sort(
        ([a], [b]) =>
          a.localeCompare(b)
      )
      .map(
        (
          [
            monthKey,
            items,
          ]
        ) => {

          const average =
            calculateAverage(
              items.map(
                item =>
                  item[key]
              )
            );

          if (
            average === null
          ) {
            return null;
          }

          const [
            year,
            month,
          ] =
            monthKey
              .split('-')
              .map(Number);

          return {
            label:
              `${year}.${String(
                month
              ).padStart(
                2,
                '0'
              )}`,

            value:
              average,

            timestamp:
              new Date(
                year,
                month - 1,
                1
              ).toISOString(),
          };
        }
      )
      .filter(
        (
          item
        ): item is ChartData =>
          item !== null
      );
  };

  // ======================================================
// 전체 데이터
//
// 전체 기간의 데이터를 월별로 묶어서 평균 계산
//
// 예:
// 2025년 01월의 모든 데이터 → 2025.01 평균
// 2025년 02월의 모든 데이터 → 2025.02 평균
// 2025년 03월의 모든 데이터 → 2025.03 평균
//
// 데이터가 존재하는 모든 월을 표시
// ======================================================

const getAllData = (
  key: SensorKey
): ChartData[] => {

  const buckets:
    Record<
      string,
      number[]
    > = {};

  // --------------------------------------------------
  // DB 데이터를 월별로 분류
  // --------------------------------------------------

  for (
    const item of dbSensorData
  ) {

    const timestamp =
      getTimestamp(item);

    const value =
      item[key];

    if (
      !Number.isFinite(timestamp) ||
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    const date =
      new Date(
        timestamp
      );

    const monthKey =
      getMonthKey(date);

    if (
      !buckets[monthKey]
    ) {
      buckets[monthKey] = [];
    }

    buckets[monthKey].push(
      value
    );
  }

  // --------------------------------------------------
  // 월별 평균 계산
  // --------------------------------------------------

  return Object.entries(
    buckets
  )
    .sort(
      ([a], [b]) =>
        a.localeCompare(b)
    )
    .map(
      (
        [
          monthKey,
          values,
        ]
      ) => {

        const average =
          calculateAverage(
            values
          );

        if (
          average === null
        ) {
          return null;
        }

        const [
          year,
          month,
        ] =
          monthKey
            .split('-')
            .map(Number);

        return {
          label:
            `${year}.${String(
              month
            ).padStart(
              2,
              '0'
            )}`,

          value:
            average,

          timestamp:
            new Date(
              year,
              month - 1,
              1
            ).toISOString(),
        };
      }
    )
    .filter(
      (
        item
      ): item is ChartData =>
        item !== null
    );
};

  // ======================================================
  // 선택된 기간에 맞는 그래프 데이터
  // ======================================================

  const getGraphData = (
    key: SensorKey
  ): ChartData[] => {

    switch (activeRange) {

      case '1일':
        return getHourlyAverageData(
          key
        );

      case '1주':
        return getDailyAverageData(
          key,
          7
        );

      case '3개월':
        return getWeeklyAverageData(
          key
        );

      case '1년':
        return getMonthlyAverageData(
          key
        );

      case '전체':
        return getAllData(
          key
        );

      default:
        return [];
    }
  };

  // ======================================================
  // 수온 그래프 데이터
  // ======================================================

  const temperatureData =
    useMemo(
      () =>
        getGraphData(
          'temperature'
        ),
      [
        dbSensorData,
        activeRange,
      ]
    );

  // ======================================================
  // pH 그래프 데이터
  // ======================================================

  const phData =
    useMemo(
      () =>
        getGraphData(
          'ph'
        ),
      [
        dbSensorData,
        activeRange,
      ]
    );

  // ======================================================
// 성장 데이터
//
// daily_growth API 데이터를 사용
//
// DB의 daily_length_mm를 cm로 변환
// ======================================================

const growthData =
  useMemo(
    (): ChartData[] =>
      dbGrowthData
        .map(
          item => {

            const [
              year,
              month,
              day,
            ] =
              item.date
                .split('-')
                .map(Number);

            const lengthMm =
              item.daily_length_mm;

            if (
              !Number.isFinite(
                lengthMm
              )
            ) {
              return null;
            }

            return {
              label:
                `${String(
                  month
                ).padStart(
                  2,
                  '0'
                )}/${
                  String(
                    day
                  ).padStart(
                    2,
                    '0'
                  )
                }`,

              // mm → cm 변환
              value:
                Number(
                  (
                    lengthMm! / 10
                  ).toFixed(2)
                ),

              timestamp:
                new Date(
                  year,
                  month - 1,
                  day
                ).toISOString(),
            };
          }
        )
        .filter(
          (
            item
          ): item is ChartData =>
            item !== null
        )
        .sort(
          (
            a,
            b
          ) =>
            new Date(
              a.timestamp
            ).getTime() -
            new Date(
              b.timestamp
            ).getTime()
        ),
    [
      dbGrowthData,
    ]
  );


// ======================================================
// 성장 그래프 기간별 데이터
//
// 1주
// → 최근 7일 일별 데이터
//
// 3개월
// → 최근 3개월 주별 평균
//
// 1년
// → 최근 12개월 월별 평균
//
// 전체
// → 전체 기간 월별 평균
// ======================================================

const growthChartData =
  useMemo(
    (): ChartData[] => {

      // ----------------------------------------------
      // 성장 그래프에서는 1일을 사용하지 않음
      // ----------------------------------------------

      const growthRange =
        activeRange === '1일'
          ? '1주'
          : activeRange;


      // ----------------------------------------------
      // 기준 날짜
      //
      // 현재 날짜가 아니라
      // DB에 존재하는 가장 최근 성장 데이터를 기준으로 함
      // ----------------------------------------------

      if (
        growthData.length === 0 &&
        growthRange !== '1주'
      ) {
        return [];
      }

      // ==============================================
      // 1주
      // 최근 7일

      if (
        growthRange === '1주'
      ) {
        const endDate =
          new Date(
            connectedAtRef.current
          );

        endDate.setHours(
          0,
          0,
          0,
          0
        );

        const startDate =
          new Date(
            endDate
          );

        startDate.setDate(
          startDate.getDate() - 6
        );

        return Array.from(
          { length: 7 },
          (_, index) => {
            const date =
              new Date(
                startDate
              );

            date.setDate(
              startDate.getDate() + index
            );

            const dayItems =
              growthData.filter(
                item => {
                  const itemDate =
                    new Date(
                      item.timestamp
                    );

                  return (
                    itemDate.getFullYear() ===
                      date.getFullYear() &&
                    itemDate.getMonth() ===
                      date.getMonth() &&
                    itemDate.getDate() ===
                      date.getDate()
                  );
                }
              );

            const average =
              dayItems.length > 0
                ? dayItems.reduce(
                    (sum, item) =>
                      sum + (item.value ?? 0),
                    0
                  ) / dayItems.length
                : null;

            return {
              label:
                `${String(
                  date.getMonth() + 1
                ).padStart(2, '0')}/${String(
                  date.getDate()
                ).padStart(2, '0')}`,
              value:
                average === null
                  ? null
                  : Number(
                      average.toFixed(2)
                    ),
              timestamp:
                date.toISOString(),
            };
          }
        );
      }


      const latestDate =
        new Date(
          growthData[
            growthData.length - 1
          ].timestamp
        );


      // ==============================================
      // 3개월
      //
      // 최근 3개월
      // 7일 단위 평균
      // ==============================================

      if (
        growthRange === '3개월'
      ) {

        const endDate =
          new Date(
            latestDate
          );

        endDate.setHours(
          23,
          59,
          59,
          999
        );

        const startDate =
          new Date(
            latestDate
          );

        startDate.setHours(
          0,
          0,
          0,
          0
        );

        startDate.setMonth(
          startDate.getMonth() - 3
        );

        const buckets:
          Record<
            string,
            ChartData[]
          > = {};

        growthData.forEach(
          item => {

            const date =
              new Date(
                item.timestamp
              );

            if (
              date < startDate ||
              date > endDate
            ) {
              return;
            }

            const diffDays =
              Math.floor(
                (
                  date.getTime() -
                  startDate.getTime()
                ) /
                (
                  1000 *
                  60 *
                  60 *
                  24
                )
              );

            const weekIndex =
              Math.floor(
                diffDays / 7
              );

            const bucketKey =
              String(
                weekIndex
              );

            if (
              !buckets[
                bucketKey
              ]
            ) {
              buckets[
                bucketKey
              ] = [];
            }

            buckets[
              bucketKey
            ].push(
              item
            );
          }
        );

        return Object.entries(
          buckets
        )
          .map(
            (
              [
                weekIndex,
                items,
              ]
            ) => {

              if (
                items.length === 0
              ) {
                return null;
              }

              const average =
                items.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.value,
                  0
                ) /
                items.length;

              const weekStart =
                new Date(
                  startDate
                );

              weekStart.setDate(
                weekStart.getDate() +
                  Number(
                    weekIndex
                  ) *
                  7
              );

              const weekEnd =
                new Date(
                  weekStart
                );

              weekEnd.setDate(
                weekEnd.getDate() +
                  6
              );

              const startLabel =
                `${
                  String(
                    weekStart.getMonth() + 1
                  ).padStart(
                    2,
                    '0'
                  )
                }/${
                  String(
                    weekStart.getDate()
                  ).padStart(
                    2,
                    '0'
                  )
                }`;

              const endLabel =
                `${
                  String(
                    weekEnd.getMonth() + 1
                  ).padStart(
                    2,
                    '0'
                  )
                }/${
                  String(
                    weekEnd.getDate()
                  ).padStart(
                    2,
                    '0'
                  )
                }`;

              return {
                label:
                  `${startLabel}~${endLabel}`,

                value:
                  Number(
                    average.toFixed(
                      2
                    )
                  ),

                timestamp:
                  weekStart.toISOString(),
              };
            }
          )
          .filter(
            (
              item
            ): item is ChartData =>
              item !== null
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.timestamp
              ).getTime() -
              new Date(
                b.timestamp
              ).getTime()
          );
      }


      // ==============================================
      // 1년
      //
      // 최근 12개월
      // 월별 평균
      // ==============================================

      if (
        growthRange === '1년'
      ) {

        const currentMonth =
          new Date(
            latestDate.getFullYear(),
            latestDate.getMonth(),
            1
          );

        const startMonth =
          new Date(
            currentMonth
          );

        startMonth.setMonth(
          startMonth.getMonth() - 11
        );

        const buckets:
          Record<
            string,
            ChartData[]
          > = {};

        growthData.forEach(
          item => {

            const date =
              new Date(
                item.timestamp
              );

            if (
              date <
              startMonth
            ) {
              return;
            }

            const key =
              `${
                date.getFullYear()
              }-${
                String(
                  date.getMonth() + 1
                ).padStart(
                  2,
                  '0'
                )
              }`;

            if (
              !buckets[key]
            ) {
              buckets[key] = [];
            }

            buckets[key].push(
              item
            );
          }
        );

        return Object.entries(
          buckets
        )
          .map(
            (
              [
                key,
                items,
              ]
            ) => {

              const average =
                items.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.value,
                  0
                ) /
                items.length;

              const [
                year,
                month,
              ] =
                key
                  .split('-')
                  .map(
                    Number
                  );

              return {
                label:
                  `${String(
                    year
                  ).slice(
                    2
                  )}.${
                    String(
                      month
                    ).padStart(
                      2,
                      '0'
                    )
                  }`,

                value:
                  Number(
                    average.toFixed(
                      2
                    )
                  ),

                timestamp:
                  new Date(
                    year,
                    month - 1,
                    1
                  ).toISOString(),
              };
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.timestamp
              ).getTime() -
              new Date(
                b.timestamp
              ).getTime()
          );
      }


      // ==============================================
      // 전체
      //
      // 모든 기간
      // 월별 평균
      // ==============================================

      if (
        growthRange === '전체'
      ) {

        const buckets:
          Record<
            string,
            ChartData[]
          > = {};

        growthData.forEach(
          item => {

            const date =
              new Date(
                item.timestamp
              );

            const key =
              `${
                date.getFullYear()
              }-${
                String(
                  date.getMonth() + 1
                ).padStart(
                  2,
                  '0'
                )
              }`;

            if (
              !buckets[key]
            ) {
              buckets[key] = [];
            }

            buckets[key].push(
              item
            );
          }
        );

        return Object.entries(
          buckets
        )
          .map(
            (
              [
                key,
                items,
              ]
            ) => {

              const average =
                items.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.value,
                  0
                ) /
                items.length;

              const [
                year,
                month,
              ] =
                key
                  .split('-')
                  .map(
                    Number
                  );

              return {
                label:
                  `${String(
                    year
                  ).slice(
                    2
                  )}.${
                    String(
                      month
                    ).padStart(
                      2,
                      '0'
                    )
                  }`,

                value:
                  Number(
                    average.toFixed(
                      2
                    )
                  ),

                timestamp:
                  new Date(
                    year,
                    month - 1,
                    1
                  ).toISOString(),
              };
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.timestamp
              ).getTime() -
              new Date(
                b.timestamp
              ).getTime()
          );
      }

      return growthData;
    },
    [
      growthData,
      activeRange,
    ]
  );

  // ======================================================
  // 활동량 데이터
  //
  // daily_activity API 데이터를 사용
  //
  // DB의 total_distance를 그래프 값으로 사용
  // ======================================================

const activityData =
  useMemo(
    (): ChartData[] =>
      dbActivityData
        .map(
          item => {

            const [
              year,
              month,
              day,
            ] =
              item.date
                .split('-')
                .map(Number);

            const totalDistance =
              item.total_distance;

            if (
              !Number.isFinite(
                totalDistance
              )
            ) {
              return null;
            }

            return {
              label:
                `${String(
                  month
                ).padStart(
                  2,
                  '0'
                )}/${
                  String(
                    day
                  ).padStart(
                    2,
                    '0'
                  )
                }`,

              value:
                Number(
                  totalDistance!.toFixed(
                    2
                  )
                ),

              timestamp:
                new Date(
                  year,
                  month - 1,
                  day
                ).toISOString(),
            };
          }
        )
        .filter(
          (
            item
          ): item is ChartData =>
            item !== null
        )
        .sort(
          (
            a,
            b
          ) =>
            new Date(
              a.timestamp
            ).getTime() -
            new Date(
              b.timestamp
            ).getTime()
        ),
    [
      dbActivityData,
    ]
  );


// ======================================================
// 활동량 그래프 기간별 데이터
//
// 1주
// → 최근 7일 일별 데이터
//
// 3개월
// → 최근 3개월 주별 평균
//
// 1년
// → 최근 12개월 월별 평균
//
// 전체
// → 전체 기간 월별 평균
// ======================================================

const activityChartData =
  useMemo(
    (): ChartData[] => {

      // ----------------------------------------------
      // 활동량 그래프에서는 1일을 사용하지 않음
      // ----------------------------------------------

      const activityRange =
        activeRange === '1일'
          ? '1주'
          : activeRange;


      // ----------------------------------------------
      // 기준 날짜
      //
      // 현재 날짜가 아니라
      // DB에 존재하는 가장 최근 활동량 데이터를 기준으로 함
      // ----------------------------------------------

      if (
        activityData.length === 0
      ) {
        return [];
      }

      const latestDate =
        new Date(
          activityData[
            activityData.length - 1
          ].timestamp
        );


      // ==============================================
      // 1주
      //
      // 최근 7일
      // 일별 데이터 그대로 표시
      // ==============================================

      if (
        activityRange === '1주'
      ) {

        const endDate =
          new Date(
            latestDate
          );

        endDate.setHours(
          23,
          59,
          59,
          999
        );

        const startDate =
          new Date(
            latestDate
          );

        startDate.setHours(
          0,
          0,
          0,
          0
        );

        startDate.setDate(
          startDate.getDate() - 6
        );

        return activityData.filter(
          item => {

            const timestamp =
              new Date(
                item.timestamp
              ).getTime();

            return (
              timestamp >=
                startDate.getTime() &&
              timestamp <=
                endDate.getTime()
            );
          }
        );
      }


      // ==============================================
      // 3개월
      //
      // 최근 3개월
      // 7일 단위 평균
      // ==============================================

      if (
        activityRange === '3개월'
      ) {

        const endDate =
          new Date(
            latestDate
          );

        endDate.setHours(
          23,
          59,
          59,
          999
        );

        const startDate =
          new Date(
            latestDate
          );

        startDate.setHours(
          0,
          0,
          0,
          0
        );

        startDate.setMonth(
          startDate.getMonth() - 3
        );

        const buckets:
          Record<
            string,
            ChartData[]
          > = {};

        activityData.forEach(
          item => {

            const date =
              new Date(
                item.timestamp
              );

            if (
              date < startDate ||
              date > endDate
            ) {
              return;
            }

            const diffDays =
              Math.floor(
                (
                  date.getTime() -
                  startDate.getTime()
                ) /
                (
                  1000 *
                  60 *
                  60 *
                  24
                )
              );

            const weekIndex =
              Math.floor(
                diffDays / 7
              );

            const bucketKey =
              String(
                weekIndex
              );

            if (
              !buckets[
                bucketKey
              ]
            ) {
              buckets[
                bucketKey
              ] = [];
            }

            buckets[
              bucketKey
            ].push(
              item
            );
          }
        );

        return Object.entries(
          buckets
        )
          .map(
            (
              [
                weekIndex,
                items,
              ]
            ) => {

              if (
                items.length === 0
              ) {
                return null;
              }

              const average =
                items.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.value,
                  0
                ) /
                items.length;

              const weekStart =
                new Date(
                  startDate
                );

              weekStart.setDate(
                weekStart.getDate() +
                  Number(
                    weekIndex
                  ) *
                  7
              );

              const weekEnd =
                new Date(
                  weekStart
                );

              weekEnd.setDate(
                weekEnd.getDate() +
                  6
              );

              const startLabel =
                `${
                  String(
                    weekStart.getMonth() + 1
                  ).padStart(
                    2,
                    '0'
                  )
                }/${
                  String(
                    weekStart.getDate()
                  ).padStart(
                    2,
                    '0'
                  )
                }`;

              const endLabel =
                `${
                  String(
                    weekEnd.getMonth() + 1
                  ).padStart(
                    2,
                    '0'
                  )
                }/${
                  String(
                    weekEnd.getDate()
                  ).padStart(
                    2,
                    '0'
                  )
                }`;

              return {
                label:
                  `${startLabel}~${endLabel}`,

                value:
                  Number(
                    average.toFixed(
                      2
                    )
                  ),

                timestamp:
                  weekStart.toISOString(),
              };
            }
          )
          .filter(
            (
              item
            ): item is ChartData =>
              item !== null
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.timestamp
              ).getTime() -
              new Date(
                b.timestamp
              ).getTime()
          );
      }


      // ==============================================
      // 1년
      //
      // 최근 12개월
      // 월별 평균
      // ==============================================

      if (
        activityRange === '1년'
      ) {

        const currentMonth =
          new Date(
            latestDate.getFullYear(),
            latestDate.getMonth(),
            1
          );

        const startMonth =
          new Date(
            currentMonth
          );

        startMonth.setMonth(
          startMonth.getMonth() - 11
        );

        const buckets:
          Record<
            string,
            ChartData[]
          > = {};

        activityData.forEach(
          item => {

            const date =
              new Date(
                item.timestamp
              );

            if (
              date <
              startMonth
            ) {
              return;
            }

            const key =
              `${
                date.getFullYear()
              }-${
                String(
                  date.getMonth() + 1
                ).padStart(
                  2,
                  '0'
                )
              }`;

            if (
              !buckets[key]
            ) {
              buckets[key] = [];
            }

            buckets[key].push(
              item
            );
          }
        );

        return Object.entries(
          buckets
        )
          .map(
            (
              [
                key,
                items,
              ]
            ) => {

              const average =
                items.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.value,
                  0
                ) /
                items.length;

              const [
                year,
                month,
              ] =
                key
                  .split('-')
                  .map(
                    Number
                  );

              return {
                label:
                  `${String(
                    year
                  ).slice(
                    2
                  )}.${
                    String(
                      month
                    ).padStart(
                      2,
                      '0'
                    )
                  }`,

                value:
                  Number(
                    average.toFixed(
                      2
                    )
                  ),

                timestamp:
                  new Date(
                    year,
                    month - 1,
                    1
                  ).toISOString(),
              };
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.timestamp
              ).getTime() -
              new Date(
                b.timestamp
              ).getTime()
          );
      }


      // ==============================================
      // 전체
      //
      // 모든 기간
      // 월별 평균
      // ==============================================

      if (
        activityRange === '전체'
      ) {

        const buckets:
          Record<
            string,
            ChartData[]
          > = {};

        activityData.forEach(
          item => {

            const date =
              new Date(
                item.timestamp
              );

            const key =
              `${
                date.getFullYear()
              }-${
                String(
                  date.getMonth() + 1
                ).padStart(
                  2,
                  '0'
                )
              }`;

            if (
              !buckets[key]
            ) {
              buckets[key] = [];
            }

            buckets[key].push(
              item
            );
          }
        );

        return Object.entries(
          buckets
        )
          .map(
            (
              [
                key,
                items,
              ]
            ) => {

              const average =
                items.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.value,
                  0
                ) /
                items.length;

              const [
                year,
                month,
              ] =
                key
                  .split('-')
                  .map(
                    Number
                  );

              return {
                label:
                  `${String(
                    year
                  ).slice(
                    2
                  )}.${
                    String(
                      month
                    ).padStart(
                      2,
                      '0'
                    )
                  }`,

                value:
                  Number(
                    average.toFixed(
                      2
                    )
                  ),

                timestamp:
                  new Date(
                    year,
                    month - 1,
                    1
                  ).toISOString(),
              };
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                a.timestamp
              ).getTime() -
              new Date(
                b.timestamp
              ).getTime()
          );
      }

      return activityData;
    },
    [
      activityData,
      activeRange,
    ]
  );


  // ======================================================
  // 알림 정렬
  //
  // 위험도 정렬 제거
  // ======================================================

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

        return dateA - dateB;
      }
    );

  const alertPageCount =
    Math.max(
      1,
      Math.ceil(
        sortedAlerts.length /
          ALERTS_PER_PAGE
      )
    );

  const currentAlertPage =
    Math.min(
      alertPage,
      alertPageCount
    );

  const pagedAlerts =
    sortedAlerts.slice(
      (
        currentAlertPage - 1
      ) * ALERTS_PER_PAGE,
      currentAlertPage * ALERTS_PER_PAGE
    );

  // ======================================================
  // Y축 범위
  // ======================================================

  const getChartMin = (
    data: ChartData[],
    defaultMin: number
  ) => {

    if (
      data.length === 0
    ) {
      return defaultMin;
    }

    return (
      Math.min(
        ...data.map(
          item =>
            item.value
        )
      ) - 0.5
    );
  };

  const getChartMax = (
    data: ChartData[],
    defaultMax: number
  ) => {

    if (
      data.length === 0
    ) {
      return defaultMax;
    }

    return (
      Math.max(
        ...data.map(
          item =>
            item.value
        )
      ) + 0.5
    );
  };

  // ======================================================
  // 그래프 설정
  //
  // 수위 / 조도 설정 삭제
  // ======================================================

  const lineChartConfig:
    Record<string, any> = {

    // --------------------------------------------------
    // 성장 그래프
    // --------------------------------------------------

    '성장 그래프': {

      subtitle:
        '물고기 성장 기록',

      title:
        '성장 그래프',

      unit:
        '길이 변화(cm)',

      badge:
        activeRange === '1일'
          ? '1주'
          : activeRange,

      currentValue:
        `${
          growthData[
            growthData.length - 1
          ]?.value ?? '-'
        } cm`,

      data:
        growthChartData,

      min:
        growthChartData.some(
          d => d.value !== null
        )
          ? Math.min(
              ...(
                growthChartData
                  .map(d => d.value)
                  .filter(
                    (value): value is number =>
                      value !== null
                  )
              )
            ) - 0.5
          : 0,

      max:
        growthChartData.some(
          d => d.value !== null
        )
          ? Math.max(
              ...(
                growthChartData
                  .map(d => d.value)
                  .filter(
                    (value): value is number =>
                      value !== null
                  )
              )
            ) + 0.5
          : 1,

      color:
        '#0f172a',

      valueSuffix:
        'cm',
    },

    // --------------------------------------------------
    // 수온 그래프
    // --------------------------------------------------

    '수온 그래프': {

      subtitle:
        'DB 센서 기록',

      title:
        '수온 그래프',

      unit:
        '수온(°C)',

      badge:
        activeRange,

      currentValue:
        temperatureData.length > 0
          ? `${
              temperatureData[
                temperatureData.length - 1
              ].value
            }°C`
          : '-',

      data:
        temperatureData,

      min:
        getChartMin(
          temperatureData,
          24
        ),

      max:
        getChartMax(
          temperatureData,
          26.5
        ),

      color:
        '#2563eb',

      valueSuffix:
        '°C',
    },

    // --------------------------------------------------
    // pH 그래프
    // --------------------------------------------------

    'pH 그래프': {

      subtitle:
        'DB 센서 기록',

      title:
        'pH 그래프',

      unit:
        'pH 변화',

      badge:
        activeRange,

      currentValue:
        phData.length > 0
          ? `${
              phData[
                phData.length - 1
              ].value
            }`
          : '-',

      data:
        phData,

      min:
        getChartMin(
          phData,
          6.2
        ),

      max:
        getChartMax(
          phData,
          7.2
        ),

      color:
        '#0f766e',

      valueSuffix:
        '',
    },
  };

  // ======================================================
  // 기간 버튼
  // ======================================================

  const renderRangeButtons =
  () => (
    <div
      className="
        mb-4
        flex
        flex-wrap
        gap-2
      "
    >

      {
        (
          activeRecordTab === '성장 그래프' ||
          activeRecordTab === '활동량 그래프'
            ? growthRangeOptions
            : rangeOptions
        ).map(
          range => (

          <button
            key={range}
            onClick={() => {

              // 선택한 기간으로 변경
              setActiveRange(
                range
              );

              setHoveredPoint(
                null
              );

              setHoveredBar(
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

  // ======================================================
  // 선 그래프
  // ======================================================

  const renderLineGraph =
    (config: any) => {

      const {
        subtitle,
        title,
        unit,
        badge,
        currentValue,
        data,
        min,
        max,
        color,
        valueSuffix,
      } = config;

      const points =
        data
          .map(
            (
              item: ChartData,
              index: number
            ) => {

              if (
                item.value === null
              ) {
                return null;
              }

              const x =
                data.length === 1
                  ? 350
                  : 50 +
                    (
                      index *
                      600
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
                  170;

              return `${x},${y}`;
            }
          )
          .join(' ');

      return (

        <div
          className="
            relative
            overflow-hidden
            rounded-[20px]
            border
            border-slate-200
            bg-white
            p-5
          "
        >

          <div
            className="
              mb-4
              flex
              items-center
              justify-between
            "
          >

            <div>

              <div
                className="
                  text-sm
                  text-slate-500
                "
              >
                {subtitle}
              </div>

              <div
                className="
                  text-2xl
                  font-semibold
                  tracking-tight
                  text-slate-900
                "
              >
                {title}
              </div>

            </div>

            <div
              className="
                rounded-full
                border
                border-slate-200
                bg-slate-50
                px-4
                py-2
                text-sm
                font-medium
                text-slate-600
              "
            >
              {badge}
            </div>

          </div>

          {renderRangeButtons()}

          <div
            className="
              rounded-[18px]
              border
              border-slate-200
              bg-gradient-to-b
              from-sky-50
              to-white
              p-6
            "
          >

            <div
              className="
                mb-4
                flex
                items-center
                justify-between
              "
            >

              <div
                className="
                  text-sm
                  text-slate-600
                "
              >
                {unit}
              </div>

              <div
                className="
                  text-sm
                  font-medium
                  text-slate-700
                "
              >
                현재 값 {currentValue}
              </div>

            </div>

            {isLoading ? (

              <div
                className="
                  flex
                  h-[430px]
                  items-center
                  justify-center
                  rounded-[16px]
                  border
                  border-slate-200
                  bg-white
                  text-sm
                  text-slate-500
                "
              >
                DB 데이터를 불러오는 중...
              </div>

            ) : dbError ? (

              <div
                className="
                  flex
                  h-[430px]
                  items-center
                  justify-center
                  rounded-[16px]
                  border
                  border-red-200
                  bg-red-50
                  text-sm
                  text-red-600
                "
              >
                {dbError}
              </div>

            ) : data.length === 0 ? (

              <div
                className="
                  flex
                  h-[430px]
                  items-center
                  justify-center
                  rounded-[16px]
                  border
                  border-slate-200
                  bg-white
                  text-sm
                  text-slate-500
                "
              >
                선택한 기간에 표시할 데이터가 없습니다.
              </div>

            ) : (

              <div
                className="
                  relative
                  h-[430px]
                  rounded-[16px]
                  border
                  border-slate-200
                  bg-white
                  p-4
                "
              >

                <div
                  className="
                    absolute
                    inset-x-4
                    top-1/4
                    border-t
                    border-dashed
                    border-slate-200
                  "
                />

                <div
                  className="
                    absolute
                    inset-x-4
                    top-2/4
                    border-t
                    border-dashed
                    border-slate-200
                  "
                />

                <div
                  className="
                    absolute
                    inset-x-4
                    top-3/4
                    border-t
                    border-dashed
                    border-slate-200
                  "
                />

                <svg
                  viewBox="0 0 700 300"
                  className="
                    h-full
                    w-full
                    overflow-visible
                  "
                  preserveAspectRatio="none"
                >

                  <polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                  />

                  {data.map(
                    (
                      item: ChartData,
                      index: number
                    ) => {

                      if (
                        item.value === null
                      ) {
                        return null;
                      }

                      const x =
                        data.length === 1
                          ? 350
                          : 50 +
                            (
                              index *
                              600
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
                          170;

                      const isActive =
                        hoveredPoint?.type ===
                          title &&
                        hoveredPoint?.index ===
                          index;

                      return (

                        <g
                          key={`${item.timestamp}-${index}`}
                        >

                          <circle
                            cx={x}
                            cy={y}
                            r={
                              isActive
                                ? 8
                                : 6
                            }
                            fill={color}
                            onMouseEnter={() =>
                              setHoveredPoint({
                                type:
                                  title,

                                index,

                                label:
                                  item.label,

                                value:
                                  `${item.value}${valueSuffix}`,

                                x,
                                y,
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

                          <text
                            x={x}
                            y={278}
                            textAnchor="middle"
                            fontSize="13"
                            fill="#64748b"
                          >
                            {item.label}
                          </text>

                        </g>
                      );
                    }
                  )}

                </svg>

                {hoveredPoint?.type ===
                  title && (

                  <div
                    className="
                      pointer-events-none
                      absolute
                      z-10
                      rounded-xl
                      border
                      border-slate-200
                      bg-white
                      px-3
                      py-2
                      text-xs
                      shadow-lg
                    "
                    style={{
                      left:
                        `${Math.min(
                          Math.max(
                            (
                              hoveredPoint.x /
                              700
                            ) *
                              100,
                            8
                          ),
                          86
                        )}%`,

                      top:
                        `${Math.min(
                          Math.max(
                            (
                              hoveredPoint.y /
                              300
                            ) *
                              100 -
                              8,
                            4
                          ),
                          78
                        )}%`,

                      transform:
                        'translate(-50%, -100%)',
                    }}
                  >

                    <div
                      className="
                        font-semibold
                        text-slate-900
                      "
                    >
                      {hoveredPoint.label}
                    </div>

                    <div
                      className="
                        text-slate-500
                      "
                    >
                      {hoveredPoint.value}
                    </div>

                  </div>
                )}

              </div>
            )}

          </div>

        </div>
      );
    };

  // ======================================================
  // 활동량 그래프
  //
  // 기존 코드 유지
  // ======================================================

  const renderBarGraph =
    () => (

      <div
        className="
          rounded-[20px]
          border
          border-slate-200
          bg-white
          p-5
        "
      >

        <div
          className="
            mb-4
            flex
            items-center
            justify-between
          "
        >

          <div>

            <div
              className="
                text-sm
                text-slate-500
              "
            >
              활동량 기록
            </div>

            <div
              className="
                text-2xl
                font-semibold
                tracking-tight
                text-slate-900
              "
            >
              활동량 그래프
            </div>

          </div>

          <div
            className="
              mb-4
              text-sm
              text-slate-500
            "
          >
            일일 총 이동거리(cm)
          </div>

          <div
            className="
              rounded-full
              border
              border-slate-200
              bg-slate-50
              px-4
              py-2
              text-sm
              font-medium
              text-slate-600
            "
          >
            {activeRange}
          </div>

        </div>

        {renderRangeButtons()}

        <div
          className="
            rounded-[18px]
            border
            border-slate-200
            bg-slate-50
            p-6
          "
        >

          <div
            className="
              relative
              flex
              h-[430px]
              items-end
              justify-between
              gap-3
              rounded-[16px]
              border
              border-slate-200
              bg-white
              p-6
            "
          >

            {activityChartData.map(
              (
                item,
                index
              ) => {

                const maxActivityValue =
                  Math.max(
                    ...activityChartData.map(
                      chartItem =>
                        chartItem.value ?? 0
                    ),
                    1
                  );

                const height =
                  Math.max(
                    60,
                    (item.value /
                      maxActivityValue) *
                      320
                  );

                const isActive =
                  hoveredBar?.index ===
                  index;

                return (

                  <div
                    key={item.label}
                    className="
                      flex
                      flex-1
                      flex-col
                      items-center
                      justify-end
                      gap-3
                    "
                  >

                    <div
                      className={`
                        relative
                        w-full
                        max-w-[64px]
                        rounded-t-[14px]
                        transition
                        ${
                          isActive
                            ? 'bg-slate-700'
                            : 'bg-slate-900/85'
                        }
                      `}
                      style={{
                        height:
                          `${height}px`,
                      }}
                      onMouseEnter={() =>
                        setHoveredBar({
                          index,
                          label:
                            item.label,
                          value:
                            `${item.value} cm`,
                        })
                      }
                      onMouseLeave={() =>
                        setHoveredBar(
                          null
                        )
                      }
                    >

                      {isActive && (

                        <div
                          className="
                            absolute
                            left-1/2
                            top-0
                            -translate-x-1/2
                            -translate-y-[calc(100%+8px)]
                            rounded-xl
                            border
                            border-slate-200
                            bg-white
                            px-3
                            py-2
                            text-xs
                            shadow-lg
                          "
                        >

                          <div
                            className="
                              font-semibold
                              text-slate-900
                            "
                          >
                            {item.label}
                          </div>

                          <div
                            className="
                              text-slate-500
                            "
                          >
                            {item.value}
                          </div>

                        </div>
                      )}

                    </div>

                    <div
                      className="
                        text-sm
                        text-slate-500
                      "
                    >
                      {item.label}
                    </div>

                  </div>
                );
              }
            )}

          </div>

        </div>

      </div>
    );

  // ======================================================
  // 알림 패널
  //
  // 위험도 표시 제거
  // ======================================================

  const renderAlertPanel =
    () => (

      <div
        className="
          rounded-[20px]
          border
          border-slate-200
          bg-white
          p-5
        "
      >

        <div
          className="
            mb-4
            flex
            items-center
            justify-between
          "
        >

          <div>

            <div
              className="
                text-sm
                text-slate-500
              "
            >
              센서 이벤트 및 알림 기록
            </div>

            <div
              className="
                text-2xl
                font-semibold
                tracking-tight
                text-slate-900
              "
            >
              알림 목록
            </div>

          </div>

          <div
            className="
              rounded-full
              border
              border-slate-200
              bg-slate-50
              px-4
              py-2
              text-sm
              font-medium
              text-slate-600
            "
          >
            {alertSort}
          </div>

        </div>

        {/* ----------------------------------------------
            알림 정렬
            위험도 높은 순 제거
            ---------------------------------------------- */}

        <div
          className="
            mb-4
            flex
            flex-wrap
            gap-2
          "
        >

          {[
            '최신',
            '오래된 순',
          ].map(
            sort => (

              <button
                key={sort}
                onClick={() =>
                  {
                    setAlertSort(sort);
                    setAlertPage(1);
                  }
                }
                className={`
                  rounded-full
                  border
                  px-3
                  py-1.5
                  text-sm
                  transition
                  ${
                    alertSort === sort
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }
                `}
              >
                {sort}
              </button>

            )
          )}

        </div>

        <div
          className="
            space-y-2
            rounded-[18px]
            border
            border-slate-200
            bg-slate-50
            p-3
          "
        >

          {sortedAlerts.length === 0 ? (

            <div
              className="
                rounded-[16px]
                border
                border-slate-200
                bg-white
                p-8
                text-center
                text-sm
                text-slate-500
              "
            >
              현재 발생한 알림이 없습니다.
            </div>

          ) : (

            pagedAlerts.map(
              alert => (

                <div
                  key={alert.id}
                  className="
                    rounded-[16px]
                    border
                    border-slate-200
                    bg-white
                    p-3
                  "
                >

                  {/* ----------------------------------
                      제목
                      ---------------------------------- */}

                  <div
                    className="
                      font-semibold
                      text-slate-900
                    "
                  >
                    {alert.title}
                  </div>

                  {/* ----------------------------------
                      이벤트 발생 날짜 / 시간
                      ---------------------------------- */}

                  <div
                    className="
                      mt-1
                      text-xs
                      text-slate-500
                    "
                  >
                    {alert.time}
                  </div>

                  {/* ----------------------------------
                      알림 내용
                      ---------------------------------- */}

                  <div
                    className="
                      mt-2
                      text-sm
                      leading-5
                      text-slate-700
                    "
                  >
                    {alert.detail}
                  </div>

                </div>

              )
            )

          )}

        </div>

        {sortedAlerts.length > 0 && (

          <div
            className="
              mt-4
              flex
              items-center
              justify-between
              gap-3
            "
          >

            <div
              className="
                text-sm
                text-slate-500
              "
            >
              {currentAlertPage} / {alertPageCount} 페이지
            </div>

            <div
              className="
                flex
                gap-2
              "
            >

              <button
                type="button"
                disabled={currentAlertPage === 1}
                onClick={() =>
                  setAlertPage(
                    currentAlertPage - 1
                  )
                }
                className="
                  rounded-full
                  border
                  border-slate-200
                  bg-white
                  px-3
                  py-1.5
                  text-sm
                  text-slate-600
                  transition
                  hover:border-slate-300
                  hover:bg-slate-50
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                이전
              </button>

              <button
                type="button"
                disabled={
                  currentAlertPage ===
                  alertPageCount
                }
                onClick={() =>
                  setAlertPage(
                    currentAlertPage + 1
                  )
                }
                className="
                  rounded-full
                  border
                  border-slate-200
                  bg-white
                  px-3
                  py-1.5
                  text-sm
                  text-slate-600
                  transition
                  hover:border-slate-300
                  hover:bg-slate-50
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                다음
              </button>

            </div>

          </div>
        )}

      </div>
    );

  // ======================================================
  // 메인 콘텐츠
  // ======================================================

  const renderRecordMainContent =
    () => {

      if (
        activeRecordTab ===
        '활동량 그래프'
      ) {
        return renderBarGraph();
      }

      if (
        activeRecordTab ===
        '알림'
      ) {
        return renderAlertPanel();
      }

      return renderLineGraph(
        lineChartConfig[
          activeRecordTab
        ]
      );
    };

  // ======================================================
  // 화면
  // ======================================================

  return (

    <div
      className="
        grid
        grid-cols-[220px_minmax(0,1fr)]
        gap-4
      "
    >

      {/* ==================================================
          왼쪽 메뉴
          ================================================== */}

      <aside
        className="
          rounded-[20px]
          border
          border-slate-200
          bg-white
          p-4
        "
      >

        <div
          className="
            rounded-[18px]
            border
            border-slate-200
            bg-slate-50
            p-4
          "
        >

          <div
            className="
              mb-3
              text-sm
              font-semibold
              text-slate-500
            "
          >
            기록 메뉴
          </div>

          <div
            className="
              space-y-3
            "
          >

            {recordTabs.map(
              tab => (

                <button
                  key={tab}
                  onClick={() => {

                    setActiveRecordTab(
                      tab
                    );

                    // 성장/활동량 그래프에서는
                    // 1일 기준을 사용하지 않음
                    if (
                      (
                        tab === '성장 그래프' ||
                        tab === '활동량 그래프'
                      ) &&
                      activeRange === '1일'
                    ) {
                      setActiveRange(
                        '1주'
                      );
                    }

                    setHoveredPoint(
                      null
                    );

                    setHoveredBar(
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
                      activeRecordTab ===
                      tab
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

      {/* ==================================================
          오른쪽 콘텐츠
          ================================================== */}

      <div
        className="
          space-y-4
        "
      >
        {renderRecordMainContent()}
      </div>

    </div>
  );
};

export default Records;