import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

// ======================================================
// 조명 스케줄
// ======================================================

interface LightScheduleItem {
  id: number;
  label: string;
  time: string;
  brightness: number;
}

// ======================================================
// 알림
// ======================================================

interface Alert {
  title: string;
  time: string;
  level: '위험' | '주의' | '정보' | string;
  detail: string;
}

// ======================================================
// 센서 데이터
// 서버에서 WebSocket으로 10분마다 전달되는 데이터
// ======================================================

export interface SensorData {
  temperature: number;
  ph: number;
  water_level: number;
  light: number;
  timestamp: string;
}

// ======================================================
// 1시간 평균 데이터
// ======================================================

export interface HourlyAverage {
  temperature: number;
  ph: number;
  water_level: number;
  light: number;
  timestamp: string;
  sampleCount: number;
}

// ======================================================
// AppContext에서 사용할 전체 데이터 타입
// ======================================================

interface AppContextType {
  // --------------------------------------------------
  // 기본 설정
  // --------------------------------------------------

  isLiveMode: boolean;
  setIsLiveMode: (val: boolean) => void;

  tankName: string;
  setTankName: (val: string) => void;

  fishName: string;
  setFishName: (val: string) => void;

  notificationsEnabled: boolean;
  setNotificationsEnabled: (val: boolean) => void;

  darkModeEnabled: boolean;
  setDarkModeEnabled: (val: boolean) => void;

  language: string;
  setLanguage: (val: string) => void;

  accountEmail: string;
  setAccountEmail: (val: string) => void;

  controlPin: string;
  setControlPin: (val: string) => void;

  // --------------------------------------------------
  // 수온 제어
  // --------------------------------------------------

  targetTemperature: number;
  setTargetTemperature: (val: number) => void;

  heaterPower: boolean;
  setHeaterPower: (val: boolean) => void;

  // --------------------------------------------------
  // 조명 제어
  // --------------------------------------------------

  lightPower: boolean;
  setLightPower: (val: boolean) => void;

  lightBrightness: number;
  setLightBrightness: (val: number) => void;

  autoLightSchedule: boolean;
  setAutoLightSchedule: (val: boolean) => void;

  lightSchedule: LightScheduleItem[];
  setLightSchedule: React.Dispatch<
    React.SetStateAction<LightScheduleItem[]>
  >;

  // --------------------------------------------------
  // 급여 제어
  // --------------------------------------------------

  feedAmount: string;
  setFeedAmount: (val: string) => void;

  autoFeeding: boolean;
  setAutoFeeding: (val: boolean) => void;

  feedingInterval: string;
  setFeedingInterval: (val: string) => void;

  lastFeedTime: string;
  setLastFeedTime: (val: string) => void;

  // --------------------------------------------------
  // 제어 알림
  // --------------------------------------------------

  controlNotice: string;
  setControlNotice: (val: string) => void;

  // --------------------------------------------------
  // 시스템 알림
  // --------------------------------------------------

  alerts: Alert[];

  // ==================================================
  // 센서 데이터
  // ==================================================

  // 가장 최근에 들어온 센서 데이터
  sensorData: SensorData | null;

  // 현재 1시간 동안 모인 10분 데이터
  sensorHistory: SensorData[];

  // 가장 최근에 계산된 1시간 평균
  hourlyAverage: HourlyAverage | null;

  // 지금까지 계산된 1시간 평균 목록
  hourlyAverages: HourlyAverage[];

  // WebSocket 연결 상태
  isWebSocketConnected: boolean;
}

// ======================================================
// Context 생성
// ======================================================

const AppContext = createContext<AppContextType | undefined>(
  undefined
);

// ======================================================
// AppProvider
// ======================================================

export const AppProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // ====================================================
  // 기본 설정
  // ====================================================

  const [isLiveMode, setIsLiveMode] = useState(false);

  const [tankName, setTankName] =
    useState('Cyber Fish Tank');

  const [fishName, setFishName] =
    useState('Nemo');

  const [notificationsEnabled, setNotificationsEnabled] =
    useState(true);

  const [darkModeEnabled, setDarkModeEnabled] =
    useState(false);

  const [language, setLanguage] =
    useState('한국어');

  const [accountEmail, setAccountEmail] =
    useState('user@cyberfishtank.com');

  const [controlPin, setControlPin] =
    useState('2480');

  // ====================================================
  // 수온 제어
  // ====================================================

  const [targetTemperature, setTargetTemperature] =
    useState(25);

  const [heaterPower, setHeaterPower] =
    useState(true);

  // ====================================================
  // 조명 제어
  // ====================================================

  const [lightPower, setLightPower] =
    useState(true);

  const [lightBrightness, setLightBrightness] =
    useState(70);

  const [autoLightSchedule, setAutoLightSchedule] =
    useState(true);

  const [lightSchedule, setLightSchedule] = useState<
    LightScheduleItem[]
  >([
    {
      id: 1,
      label: '아침',
      time: '07:00',
      brightness: 45,
    },
    {
      id: 2,
      label: '낮',
      time: '12:00',
      brightness: 75,
    },
    {
      id: 3,
      label: '저녁',
      time: '18:30',
      brightness: 35,
    },
    {
      id: 4,
      label: '취침',
      time: '22:30',
      brightness: 10,
    },
  ]);

  // ====================================================
  // 급여 제어
  // ====================================================

  const [feedAmount, setFeedAmount] =
    useState('표준');

  const [autoFeeding, setAutoFeeding] =
    useState(true);

  const [feedingInterval, setFeedingInterval] =
    useState('12시간');

  const [lastFeedTime, setLastFeedTime] =
    useState('오늘 09:30');

  // ====================================================
  // 제어 알림
  // ====================================================

  const [controlNotice, setControlNotice] =
    useState('');

  // ====================================================
  // 시스템 알림
  // ====================================================

  const alerts: Alert[] = [
    {
      title: '활동량 급감',
      time: '2026-04-13 11:03',
      level: '위험',
      detail:
        '최근 30분 평균 활동량이 기준치보다 24% 낮습니다.',
    },
    {
      title: 'pH 변동 감지',
      time: '2026-04-13 10:42',
      level: '주의',
      detail:
        'pH가 6.9에서 6.6으로 빠르게 변했습니다.',
    },
    {
      title: '수위 저하 경고',
      time: '2026-04-12 21:10',
      level: '주의',
      detail:
        '수위가 권장 범위 하단에 근접했습니다.',
    },
    {
      title: '조명 제어 완료',
      time: '2026-04-12 19:15',
      level: '정보',
      detail:
        '사용자 요청에 따라 조명 밝기가 70%로 조절되었습니다.',
    },
    {
      title: '수온 상승 경고',
      time: '2026-04-11 14:08',
      level: '위험',
      detail:
        '수온이 26.3°C까지 올라 권장 범위를 초과했습니다.',
    },
  ];

  // ====================================================
  // 센서 데이터 상태
  // ====================================================

  // 가장 최근 센서 데이터
  const [sensorData, setSensorData] =
    useState<SensorData | null>(null);

  // 현재 1시간 동안의 10분 데이터
  const [sensorHistory, setSensorHistory] =
    useState<SensorData[]>([]);

  // 가장 최근 1시간 평균
  const [hourlyAverage, setHourlyAverage] =
    useState<HourlyAverage | null>(null);

  // 계산된 모든 1시간 평균
  const [hourlyAverages, setHourlyAverages] =
    useState<HourlyAverage[]>([]);

  // WebSocket 연결 상태
  const [isWebSocketConnected, setIsWebSocketConnected] =
    useState(false);

  // ====================================================
  // WebSocket으로 들어오는 데이터를 임시 저장
  //
  // useRef를 사용하는 이유:
  // 센서 데이터가 들어올 때마다 React를 다시 렌더링하지
  // 않고 6개의 데이터를 안전하게 모아두기 위해서
  // ====================================================

  const sensorBufferRef = useRef<SensorData[]>([]);

  // ====================================================
  // WebSocket 연결
  // ====================================================

  useEffect(() => {
    // Vite 환경변수를 우선 사용
    // 없으면 localhost:8765 사용
    const WS_URL =
      import.meta.env.VITE_WS_URL ||
      'ws://localhost:8765';

    console.log(
      'WebSocket 연결 시도:',
      WS_URL
    );

    const socket = new WebSocket(WS_URL);

    // --------------------------------------------------
    // WebSocket 연결 성공
    // --------------------------------------------------

    socket.onopen = () => {
      console.log(
        'WebSocket 연결 성공'
      );

      setIsWebSocketConnected(true);
    };

    // --------------------------------------------------
    // 센서 데이터 수신
    // --------------------------------------------------

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(
          event.data
        );

        console.log(
          '센서 데이터 수신:',
          data
        );

        // ----------------------------------------------
        // 서버 데이터 확인
        // ----------------------------------------------

        if (
          typeof data.temperature !== 'number' ||
          typeof data.ph !== 'number' ||
          typeof data.water_level !== 'number' ||
          typeof data.light !== 'number'
        ) {
          console.error(
            '센서 데이터 형식이 올바르지 않습니다:',
            data
          );

          return;
        }

        // ----------------------------------------------
        // 센서 데이터 생성
        // ----------------------------------------------

        const newSensorData: SensorData = {
          temperature: data.temperature,
          ph: data.ph,
          water_level: data.water_level,
          light: data.light,
          timestamp:
            data.timestamp ||
            new Date().toISOString(),
        };

        // ----------------------------------------------
        // 가장 최근 센서값 저장
        // ----------------------------------------------

        setSensorData(newSensorData);

        // ----------------------------------------------
        // 10분 데이터 저장
        // ----------------------------------------------

        sensorBufferRef.current = [
          ...sensorBufferRef.current,
          newSensorData,
        ];

        // 현재 1시간 데이터 표시
        setSensorHistory(
          sensorBufferRef.current
        );

        console.log(
          `현재 1시간 데이터: ${sensorBufferRef.current.length}/6`
        );

        // ----------------------------------------------
        // 10분 데이터가 6개가 되면
        // = 1시간 평균 계산
        // ----------------------------------------------

        if (
          sensorBufferRef.current.length >= 6
        ) {
          const samples =
            sensorBufferRef.current;

          // 평균 계산
          const avgTemperature =
            samples.reduce(
              (sum, item) =>
                sum + item.temperature,
              0
            ) / samples.length;

          const avgPh =
            samples.reduce(
              (sum, item) =>
                sum + item.ph,
              0
            ) / samples.length;

          const avgWaterLevel =
            samples.reduce(
              (sum, item) =>
                sum + item.water_level,
              0
            ) / samples.length;

          const avgLight =
            samples.reduce(
              (sum, item) =>
                sum + item.light,
              0
            ) / samples.length;

          // --------------------------------------------
          // 평균 데이터 생성
          // --------------------------------------------

          const averageData: HourlyAverage = {
            temperature: Number(
              avgTemperature.toFixed(2)
            ),

            ph: Number(
              avgPh.toFixed(2)
            ),

            water_level: Number(
              avgWaterLevel.toFixed(2)
            ),

            light: Number(
              avgLight.toFixed(2)
            ),

            timestamp:
              new Date().toISOString(),

            sampleCount:
              samples.length,
          };

          console.log(
            '================================'
          );

          console.log(
            '1시간 평균 계산 완료'
          );

          console.log(
            averageData
          );

          console.log(
            '================================'
          );

          // --------------------------------------------
          // 가장 최근 평균 저장
          // --------------------------------------------

          setHourlyAverage(
            averageData
          );

          // --------------------------------------------
          // 지금까지의 평균 기록에 추가
          // --------------------------------------------

          setHourlyAverages(
            (prev) => [
              ...prev,
              averageData,
            ]
          );

          // --------------------------------------------
          // 다음 1시간을 위해 초기화
          // --------------------------------------------

          sensorBufferRef.current = [];

          setSensorHistory([]);
        }
      } catch (error) {
        console.error(
          '센서 JSON 데이터 처리 오류:',
          error
        );
      }
    };

    // --------------------------------------------------
    // WebSocket 오류
    // --------------------------------------------------

    socket.onerror = (error) => {
      console.error(
        'WebSocket 오류:',
        error
      );

      setIsWebSocketConnected(false);
    };

    // --------------------------------------------------
    // WebSocket 종료
    // --------------------------------------------------

    socket.onclose = () => {
      console.log(
        'WebSocket 연결 종료'
      );

      setIsWebSocketConnected(false);
    };

    // --------------------------------------------------
    // 컴포넌트 종료 시 WebSocket 종료
    // --------------------------------------------------

    return () => {
      socket.close();
    };
  }, []);

  // ====================================================
  // 제어 알림 자동 제거
  // ====================================================

  useEffect(() => {
    if (!controlNotice) return;

    const timer = setTimeout(
      () => setControlNotice(''),
      2200
    );

    return () =>
      clearTimeout(timer);
  }, [controlNotice]);

  // ====================================================
  // Context에서 제공할 데이터
  // ====================================================

  const value: AppContextType = {
    // 기본 설정
    isLiveMode,
    setIsLiveMode,

    tankName,
    setTankName,

    fishName,
    setFishName,

    notificationsEnabled,
    setNotificationsEnabled,

    darkModeEnabled,
    setDarkModeEnabled,

    language,
    setLanguage,

    accountEmail,
    setAccountEmail,

    controlPin,
    setControlPin,

    // 수온
    targetTemperature,
    setTargetTemperature,

    heaterPower,
    setHeaterPower,

    // 조명
    lightPower,
    setLightPower,

    lightBrightness,
    setLightBrightness,

    autoLightSchedule,
    setAutoLightSchedule,

    lightSchedule,
    setLightSchedule,

    // 급여
    feedAmount,
    setFeedAmount,

    autoFeeding,
    setAutoFeeding,

    feedingInterval,
    setFeedingInterval,

    lastFeedTime,
    setLastFeedTime,

    // 제어 알림
    controlNotice,
    setControlNotice,

    // 시스템 알림
    alerts,

    // 센서 데이터
    sensorData,
    sensorHistory,
    hourlyAverage,
    hourlyAverages,
    isWebSocketConnected,
  };

  // ====================================================
  // Provider
  // ====================================================

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

// ======================================================
// Custom Hook
// ======================================================

export const useAppContext = () => {
  const context = useContext(
    AppContext
  );

  if (context === undefined) {
    throw new Error(
      'useAppContext must be used within an AppProvider'
    );
  }

  return context;
};