import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
} from 'react';

interface DbSensorData {
  id?: number;
  temperature?: number | null;
  ph?: number | null;
  water_level?: number | null;
  timestamp: string;
}

interface ChartData {
  label: string;
  value: number;
  timestamp: string;
}

interface RecordAlert {
  id: string;
  type: string;
  title: string;
  time: string;
  detail: string;
}

type SensorKey =
  | 'temperature'
  | 'ph';

const Records: React.FC = () => {

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

  const [activeRecordTab, setActiveRecordTab] =
    useState('성장 그래프');

  const [activeRange, setActiveRange] =
    useState('1주');

  const [alertSort, setAlertSort] =
    useState('최신');

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
  // Records 페이지 접속 시간
  //
  // 1일 그래프의 기준 시간
  // ======================================================

  const connectedAtRef =
    useRef(new Date());

  // ======================================================
  // 알람 관련 상태
  // ======================================================

  const [recordAlerts, setRecordAlerts] =
    useState<RecordAlert[]>([]);

  // 마지막으로 처리한 DB 데이터 시간
  const lastProcessedIdRef =
    useRef<number | null>(null);

  // 처음 DB를 불러왔는지 여부
  const alertInitializedRef =
    useRef(false);

  // 이벤트별 마지막 알람 발생 시간
  //
  // 예:
  // temperature-increase
  // temperature-decrease
  // ph-increase
  // ph-decrease
  // water-decrease
  //
  const lastAlertTimeRef =
    useRef<Record<string, number>>({});

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

          // ==================================================
          // 알람 처리
          // ==================================================

          processNewSensorAlerts(
            normalized
          );

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
// 새로운 센서 데이터의 알람 확인
// ======================================================

const processNewSensorAlerts = (
  data: DbSensorData[]
) => {

  if (
    data.length === 0
  ) {
    return;
  }

  // --------------------------------------------------
  // ID가 정상인 데이터만 사용
  // --------------------------------------------------

  const validData =
    data
      .filter(
        item =>
          typeof item.id === 'number' &&
          Number.isFinite(item.id)
      )
      .sort(
        (a, b) =>
          (a.id ?? 0) -
          (b.id ?? 0)
      );

  if (
    validData.length === 0
  ) {
    return;
  }

  const latestId =
    validData[
      validData.length - 1
    ].id!;

  // --------------------------------------------------
  // 최초 데이터 로딩
  //
  // 기존 DB에 저장되어 있던 데이터는
  // 알람으로 만들지 않는다.
  //
  // 이후 새로 들어오는 데이터부터 확인한다.
  // --------------------------------------------------

  if (
    !alertInitializedRef.current
  ) {

    alertInitializedRef.current =
      true;

    lastProcessedIdRef.current =
      latestId;

    return;
  }

  const lastProcessed =
    lastProcessedIdRef.current;

  // --------------------------------------------------
  // 새로운 데이터 찾기
  //
  // timestamp가 아니라 DB의 id를 기준으로
  // 새로 추가된 데이터를 판단한다.
  // --------------------------------------------------

  const newData =
    validData.filter(
      item => {

        const id =
          item.id!;

        if (
          lastProcessed === null
        ) {
          return true;
        }

        return (
          id >
          lastProcessed
        );
      }
    );

  if (
    newData.length === 0
  ) {
    return;
  }

  // --------------------------------------------------
  // 새로운 데이터 하나씩 검사
  // --------------------------------------------------

  newData.forEach(
    item => {

      checkTemperatureAlert(
        item
      );

      checkPhAlert(
        item
      );

      checkWaterLevelAlert(
        item
      );
    }
  );

  // --------------------------------------------------
  // 마지막 처리 ID 갱신
  // --------------------------------------------------

  lastProcessedIdRef.current =
    latestId;
};

  // ======================================================
  // 알람 추가
  //
  // 같은 이벤트는 1시간 동안 다시 생성하지 않음
  // ======================================================

  const addAlert = (
    type: string,
    title: string,
    detail: string,
    timestamp: string
  ) => {

    const eventTime =
      new Date(
        timestamp
      ).getTime();

    if (
      !Number.isFinite(eventTime)
    ) {
      return;
    }

    const lastAlertTime =
      lastAlertTimeRef.current[
        type
      ];

    const ONE_HOUR =
      60 *
      60 *
      1000;

    // ----------------------------------------------
    // 같은 이벤트가 1시간 이내에 발생했으면
    // 알람을 추가하지 않음
    // ----------------------------------------------

    if (
      lastAlertTime !== undefined &&
      eventTime -
        lastAlertTime <
        ONE_HOUR
    ) {
      return;
    }

    // 마지막 알람 시간 저장
    lastAlertTimeRef.current[
      type
    ] =
      eventTime;

    const date =
      new Date(
        eventTime
      );

    const formattedTime =
      date.toLocaleString(
        'ko-KR',
        {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }
      );

    const newAlert:
      RecordAlert = {
        id:
          `${type}-${eventTime}-${Math.random()}`,

        type,

        title,

        time:
          formattedTime,

        detail,
      };

    setRecordAlerts(
      previous => [
        newAlert,
        ...previous,
      ]
    );
  };

  // ======================================================
  // 수온 알람
  //
  // 27도 이상 → 증가 경고
  // 24도 이하 → 하락 경고
  // ======================================================

  const checkTemperatureAlert = (
    item: DbSensorData
  ) => {

    const temperature =
      item.temperature;

    if (
      typeof temperature !== 'number' ||
      !Number.isFinite(temperature)
    ) {
      return;
    }

    // ----------------------------------------------
    // 27도 이상
    // ----------------------------------------------

    if (
      temperature >= 27
    ) {

      addAlert(
        'temperature-increase',
        '수온 증가 경고',
        `수온이 ${temperature}도까지 올라 권장 범위를 초과하였습니다.`,
        item.timestamp
      );

      return;
    }

    // ----------------------------------------------
    // 24도 이하
    // ----------------------------------------------

    if (
      temperature <= 24
    ) {

      addAlert(
        'temperature-decrease',
        '수온 하락 경고',
        `수온이 ${temperature}도까지 내려가 권장 범위를 초과하였습니다.`,
        item.timestamp
      );
    }
  };

  // ======================================================
  // pH 알람
  //
  // 8.0 초과 → 증가 경고
  // 6.0 미만 → 하락 경고
  // ======================================================

  const checkPhAlert = (
    item: DbSensorData
  ) => {

    const ph =
      item.ph;

    if (
      typeof ph !== 'number' ||
      !Number.isFinite(ph)
    ) {
      return;
    }

    // ----------------------------------------------
    // pH 8.0 초과
    // ----------------------------------------------

    if (
      ph > 8.0
    ) {

      addAlert(
        'ph-increase',
        'pH 증가 경고',
        `pH 농도가 ${ph}까지 올라 권장 범위를 초과하였습니다.`,
        item.timestamp
      );

      return;
    }

    // ----------------------------------------------
    // pH 6.0 미만
    // ----------------------------------------------

    if (
      ph < 6.0
    ) {

      addAlert(
        'ph-decrease',
        'pH 하락 경고',
        `pH 농도가 ${ph}까지 내려가 권장 범위를 초과하였습니다.`,
        item.timestamp
      );
    }
  };

  // ======================================================
  // 수위 알람
  //
  // 수위가 0이면 경고
  // ======================================================

  const checkWaterLevelAlert = (
    item: DbSensorData
  ) => {

    const waterLevel =
      item.water_level;

    if (
      typeof waterLevel !== 'number' ||
      !Number.isFinite(waterLevel)
    ) {
      return;
    }

    if (
      waterLevel === 0
    ) {

      addAlert(
        'water-decrease',
        '수위 감소 경고',
        '수위가 권장 높이보다 낮습니다.',
        item.timestamp
      );
    }
  };

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
  // 기존 데이터 유지
  // ======================================================

  const growthData =
    useMemo(
      () => [
        {
          label: '초기',
          value: 2.8,
          timestamp: 'growth-1',
        },
        {
          label: '성장1',
          value: 3.7,
          timestamp: 'growth-2',
        },
        {
          label: '성장2',
          value: 4.6,
          timestamp: 'growth-3',
        },
        {
          label: '성장3',
          value: 5.4,
          timestamp: 'growth-4',
        },
        {
          label: '성장4',
          value: 6.0,
          timestamp: 'growth-5',
        },
        {
          label: '현재',
          value: 6.4,
          timestamp: 'growth-6',
        },
      ],
      []
    );

  // ======================================================
  // 활동량
  //
  // 기존 데이터 유지
  // ======================================================

  const activityData =
    useMemo(
      () => [
        {
          label: '월',
          value: 62,
        },
        {
          label: '화',
          value: 71,
        },
        {
          label: '수',
          value: 68,
        },
        {
          label: '목',
          value: 76,
        },
        {
          label: '금',
          value: 64,
        },
        {
          label: '토',
          value: 81,
        },
        {
          label: '일',
          value: 73,
        },
      ],
      []
    );

  // ======================================================
  // 알림 정렬
  //
  // 위험도 정렬 제거
  // ======================================================

  const sortedAlerts =
    [...recordAlerts].sort(
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
        activeRange,

      currentValue:
        `${
          growthData[
            growthData.length - 1
          ]?.value ?? '-'
        } cm`,

      data:
        growthData,

      min:
        Math.min(
          ...growthData.map(
            d => d.value
          )
        ) - 0.5,

      max:
        Math.max(
          ...growthData.map(
            d => d.value
          )
        ) + 0.5,

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

        {rangeOptions.map(
          range => (

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

            {activityData.map(
              (
                item,
                index
              ) => {

                const height =
                  Math.max(
                    60,
                    item.value *
                      3.2
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
                            item.value,
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
            space-y-3
            rounded-[18px]
            border
            border-slate-200
            bg-slate-50
            p-4
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

            sortedAlerts.map(
              alert => (

                <div
                  key={alert.id}
                  className="
                    rounded-[16px]
                    border
                    border-slate-200
                    bg-white
                    p-4
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
                      mt-2
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
                      mt-3
                      text-sm
                      leading-6
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