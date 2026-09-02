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
// YOLO / 물고기 데이터
// ======================================================

export interface FishData {
  center_norm: number[];
  move_direction: string;
  pose_direction: string;
  head: number[];
  tail: number[];
  state: string;
  abnormal: boolean;
}

// ======================================================
// Python → Node.js → WebSocket → React
// 센서 원본 데이터
// ======================================================

export interface SensorData {
  timestamp: string;

  millis: number;

  temperature_c: number;

  ph: number;

  ph_voltage: number;

  tds_ppm: number;

  tds_voltage: number;

  turbidity_voltage: number;

  turbidity_delta: number;

  turbidity_warning: string;

  water_level_detected: string;
}

// ======================================================
// 화면에서 사용하는 센서 데이터
// ======================================================

export interface DisplaySensorData {
  temperature: number;

  ph: number;

  water_level: number;

  light: number;

  tds: number;

  turbidity: number;

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

  tds: number;

  turbidity: number;

  timestamp: string;

  sampleCount: number;
}

// ======================================================
// AppContext 타입
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

  // --------------------------------------------------
  // YOLO / 물고기
  // --------------------------------------------------

  fishData: FishData;

  // --------------------------------------------------
  // 센서
  // --------------------------------------------------

  sensorData: SensorData | null;

  displaySensorData: DisplaySensorData | null;

  sensorHistory: DisplaySensorData[];

  hourlyAverage: HourlyAverage | null;

  hourlyAverages: HourlyAverage[];

  isWebSocketConnected: boolean;
}

// ======================================================
// Context 생성
// ======================================================

const AppContext =
  createContext<AppContextType | undefined>(
    undefined
  );

// ======================================================
// AppProvider
// ======================================================

export const AppProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {

  // ====================================================
  // 기본 설정
  // ====================================================

  const [isLiveMode, setIsLiveMode] =
    useState(false);

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

  const [lightSchedule, setLightSchedule] =
    useState<LightScheduleItem[]>([
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
  // YOLO / 물고기 데이터
  // ====================================================

  const [fishData, setFishData] =
    useState<FishData>({
      center_norm: [0.5, 0.5],
      move_direction: 'none',
      pose_direction: 'none',
      head: [0.5, 0.5],
      tail: [0.5, 0.5],
      state: 'tracked',
      abnormal: false,
    });

  // ====================================================
  // 센서 데이터
  // ====================================================

  const [sensorData, setSensorData] =
    useState<SensorData | null>(null);

  const [displaySensorData, setDisplaySensorData] =
    useState<DisplaySensorData | null>(null);

  const [sensorHistory, setSensorHistory] =
    useState<DisplaySensorData[]>([]);

  const [hourlyAverage, setHourlyAverage] =
    useState<HourlyAverage | null>(null);

  const [hourlyAverages, setHourlyAverages] =
    useState<HourlyAverage[]>([]);

  const [isWebSocketConnected, setIsWebSocketConnected] =
    useState(false);

  // ====================================================
  // 센서 1시간 버퍼
  //
  // 센서가 10분마다 들어온다고 가정
  //
  // 6개 = 1시간
  // ====================================================

  const sensorBufferRef =
    useRef<DisplaySensorData[]>([]);

  // ====================================================
  // WebSocket
  //
  // 중요:
  //
  // Dashboard에서 연결하지 않는다.
  //
  // AppProvider에서 딱 한 번 연결한다.
  //
  // 따라서 Dashboard → Records 이동 시에도
  // WebSocket 연결이 유지된다.
  // ====================================================

  useEffect(() => {

    const WS_URL =
      import.meta.env.VITE_WS_URL ||
      'wss://ggnu.site/ws/';

    console.log('');
    console.log('================================');
    console.log('🔌 WebSocket 연결 시도');
    console.log('주소:', WS_URL);
    console.log('================================');
    console.log('');

    const socket =
      new WebSocket(WS_URL);

    // ==================================================
    // 연결 성공
    // ==================================================

    socket.onopen = () => {

      console.log(
        '✅ WebSocket 연결 성공'
      );

      console.log(
        '📡 센서 + YOLO 데이터 수신 대기'
      );

      setIsWebSocketConnected(true);
    };

    // ==================================================
    // 데이터 수신
    // ==================================================

    socket.onmessage = (event) => {

      try {

        const data =
          JSON.parse(event.data);

        // =================================================
        // 1. YOLO 데이터 확인
        // =================================================

        const isYoloData =
          data.center_norm !== undefined ||
          data.move_direction !== undefined ||
          data.head !== undefined ||
          data.tail !== undefined;

        if (isYoloData) {

          const newFishData: FishData = {

            center_norm:
              Array.isArray(data.center_norm)
                ? data.center_norm
                : [0.5, 0.5],

            move_direction:
              data.move_direction || 'none',

            pose_direction:
              data.pose_direction || 'none',

            head:
              Array.isArray(data.keypoints?.head)
                ? data.keypoints.head
                : [0.5, 0.5],

            tail:
              Array.isArray(data.keypoints?.tail)
                ? data.keypoints.tail
                : [0.5, 0.5],

            state:
              data.state || 'tracked',

            abnormal:
              Boolean(data.abnormal),
          };

          setFishData(
            newFishData
          );

          return;
        }

        // =================================================
        // 2. 센서 데이터인지 확인
        // =================================================

        const isSensorData =
          data.temperature_c !== undefined ||
          data.temperature !== undefined ||
          data.tds_ppm !== undefined ||
          data.tds !== undefined ||
          data.ph !== undefined;

        if (!isSensorData) {

          console.log(
            'ℹ️ 알 수 없는 WebSocket 데이터:',
            data
          );

          return;
        }

        // =================================================
        // 3. 센서 데이터 변환
        // =================================================

        let newSensorData: SensorData;

        // -------------------------------------------------
        // CASE 1
        // Node.js에서 변환된 데이터
        //
        // temperature
        // tds
        // -------------------------------------------------

        if (
          typeof data.temperature === 'number' ||
          typeof data.tds === 'number'
        ) {

          newSensorData = {

            timestamp:
              data.timestamp ||
              new Date().toISOString(),

            millis:
              Number(data.millis || 0),

            temperature_c:
              Number(
                data.temperature ??
                data.temperature_c ??
                0
              ),

            ph:
              Number(data.ph ?? 0),

            ph_voltage:
              Number(data.ph_voltage ?? 0),

            tds_ppm:
              Number(
                data.tds ??
                data.tds_ppm ??
                0
              ),

            tds_voltage:
              Number(data.tds_voltage ?? 0),

            turbidity_voltage:
              Number(
                data.turbidity ??
                data.turbidity_voltage ??
                0
              ),

            turbidity_delta:
              Number(
                data.turbidity_delta ??
                0
              ),

            turbidity_warning:
              String(
                data.turbidity_warning ??
                ''
              ),

            water_level_detected:
              String(
                data.water_level ??
                data.water_level_detected ??
                ''
              ),
          };

        }

        // -------------------------------------------------
        // CASE 2
        // Python 원본 데이터
        // -------------------------------------------------

        else {

          if (
            data.temperature_c === undefined ||
            data.ph === undefined ||
            data.tds_ppm === undefined
          ) {

            console.warn(
              '⚠️ 센서 데이터 형식 오류:',
              data
            );

            return;
          }

          newSensorData = {

            timestamp:
              data.timestamp ||
              new Date().toISOString(),

            millis:
              Number(
                data.millis || 0
              ),

            temperature_c:
              Number(
                data.temperature_c
              ),

            ph:
              Number(
                data.ph
              ),

            ph_voltage:
              Number(
                data.ph_voltage || 0
              ),

            tds_ppm:
              Number(
                data.tds_ppm
              ),

            tds_voltage:
              Number(
                data.tds_voltage || 0
              ),

            turbidity_voltage:
              Number(
                data.turbidity_voltage || 0
              ),

            turbidity_delta:
              Number(
                data.turbidity_delta || 0
              ),

            turbidity_warning:
              String(
                data.turbidity_warning ?? ''
              ),

            water_level_detected:
              String(
                data.water_level_detected ?? ''
              ),
          };
        }

        // =================================================
        // 4. 실제 센서 데이터 저장
        // =================================================

        setSensorData(
          newSensorData
        );

        console.log(
          '📡 센서 데이터:',
          newSensorData
        );

        // =================================================
        // 5. 기록 그래프용 데이터 생성
        // =================================================

        const newDisplayData: DisplaySensorData = {

          // 수온
          temperature:
            newSensorData.temperature_c,

          // pH
          ph:
            newSensorData.ph,

          // 수위
          //
          // 현재 센서:
          // 1 = 감지
          // 0 = 미감지
          //
          water_level:
            Number(
              newSensorData.water_level_detected
            ),

          // 현재 조도 센서는 실제 데이터가 없으므로 0
          light:
            0,

          // TDS
          tds:
            newSensorData.tds_ppm,

          // 탁도
          turbidity:
            newSensorData.turbidity_voltage,

          // timestamp
          timestamp:
            newSensorData.timestamp,
        };

        // =================================================
        // 6. 최신 데이터 저장
        // =================================================

        setDisplaySensorData(
          newDisplayData
        );

        // =================================================
        // 7. 1시간 버퍼에 추가
        // =================================================

        sensorBufferRef.current = [
          ...sensorBufferRef.current,
          newDisplayData,
        ];

        // 현재까지 수집된 데이터 표시
        setSensorHistory([
          ...sensorBufferRef.current,
        ]);

        console.log(
          `⏱️ 1시간 수집 진행: ` +
          `${sensorBufferRef.current.length}/6`
        );

        // =================================================
        // 8. 6개가 모이면 1시간 평균 계산
        // =================================================

        if (
          sensorBufferRef.current.length >= 6
        ) {

          const samples =
            sensorBufferRef.current.slice(
              0,
              6
            );

          // ------------------------------------------------
          // 평균 계산 함수
          // ------------------------------------------------

          const average = (
            values: number[]
          ) => {

            if (
              values.length === 0
            ) {
              return 0;
            }

            return (
              values.reduce(
                (sum, value) =>
                  sum + value,
                0
              ) / values.length
            );
          };

          // ------------------------------------------------
          // 각 센서 평균
          // ------------------------------------------------

          const avgTemperature =
            average(
              samples.map(
                item =>
                  item.temperature
              )
            );

          const avgPh =
            average(
              samples.map(
                item =>
                  item.ph
              )
            );

          const avgWaterLevel =
            average(
              samples.map(
                item =>
                  item.water_level
              )
            );

          const avgLight =
            average(
              samples.map(
                item =>
                  item.light
              )
            );

          const avgTds =
            average(
              samples.map(
                item =>
                  item.tds
              )
            );

          const avgTurbidity =
            average(
              samples.map(
                item =>
                  item.turbidity
              )
            );

          // =================================================
          // 9. 1시간 평균 데이터
          // =================================================

          const averageData: HourlyAverage = {

            temperature:
              Number(
                avgTemperature.toFixed(2)
              ),

            ph:
              Number(
                avgPh.toFixed(2)
              ),

            water_level:
              Number(
                avgWaterLevel.toFixed(2)
              ),

            light:
              Number(
                avgLight.toFixed(2)
              ),

            tds:
              Number(
                avgTds.toFixed(2)
              ),

            turbidity:
              Number(
                avgTurbidity.toFixed(3)
              ),

            timestamp:
              samples[
                samples.length - 1
              ].timestamp,

            sampleCount:
              samples.length,
          };

          // =================================================
          // 10. 콘솔 출력
          // =================================================

          console.log('');
          console.log(
            '================================'
          );

          console.log(
            '⏱️ 1시간 평균 계산 완료'
          );

          console.log(
            averageData
          );

          console.log(
            '================================'
          );
          console.log('');

          // =================================================
          // 11. 가장 최근 1시간 평균
          // =================================================

          setHourlyAverage(
            averageData
          );

          // =================================================
          // 12. 전체 시간 평균 기록에 추가
          //
          // 예:
          //
          // 1시간 → 1개
          // 2시간 → 2개
          // 3시간 → 3개
          //
          // 일주일이면
          //
          // 7 × 24 = 168개
          // =================================================

          setHourlyAverages(
            prev => [
              ...prev,
              averageData,
            ]
          );

          // =================================================
          // 13. 다음 1시간 측정 시작
          // =================================================

          sensorBufferRef.current = [];

          setSensorHistory([]);

          console.log(
            '🔄 다음 1시간 측정을 시작합니다.'
          );
        }

      } catch (error) {

        console.error(
          '❌ WebSocket JSON 처리 오류:',
          error
        );

      }
    };

    // ==================================================
    // WebSocket 오류
    // ==================================================

    socket.onerror = (error) => {

      console.error(
        '❌ WebSocket 오류:',
        error
      );

      setIsWebSocketConnected(false);
    };

    // ==================================================
    // WebSocket 종료
    // ==================================================

    socket.onclose = () => {

      console.log(
        '🔌 WebSocket 연결 종료'
      );

      setIsWebSocketConnected(false);
    };

    // ==================================================
    // Provider 종료 시에만 WebSocket 종료
    // ==================================================

    return () => {

      console.log(
        '🧹 AppProvider 종료 → WebSocket 정리'
      );

      socket.close();
    };

  }, []);

  // ====================================================
  // 제어 알림 자동 제거
  // ====================================================

  useEffect(() => {

    if (!controlNotice) {
      return;
    }

    const timer =
      setTimeout(
        () => {
          setControlNotice('');
        },
        2200
      );

    return () => {
      clearTimeout(timer);
    };

  }, [controlNotice]);

  // ====================================================
  // Context 값
  // ====================================================

  const value: AppContextType = {

    // --------------------------------------------------
    // 기본 설정
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 수온
    // --------------------------------------------------

    targetTemperature,
    setTargetTemperature,

    heaterPower,
    setHeaterPower,

    // --------------------------------------------------
    // 조명
    // --------------------------------------------------

    lightPower,
    setLightPower,

    lightBrightness,
    setLightBrightness,

    autoLightSchedule,
    setAutoLightSchedule,

    lightSchedule,
    setLightSchedule,

    // --------------------------------------------------
    // 급여
    // --------------------------------------------------

    feedAmount,
    setFeedAmount,

    autoFeeding,
    setAutoFeeding,

    feedingInterval,
    setFeedingInterval,

    lastFeedTime,
    setLastFeedTime,

    // --------------------------------------------------
    // 제어 알림
    // --------------------------------------------------

    controlNotice,
    setControlNotice,

    // --------------------------------------------------
    // 시스템 알림
    // --------------------------------------------------

    alerts,

    // --------------------------------------------------
    // YOLO
    // --------------------------------------------------

    fishData,

    // --------------------------------------------------
    // 센서
    // --------------------------------------------------

    sensorData,

    displaySensorData,

    sensorHistory,

    hourlyAverage,

    hourlyAverages,

    isWebSocketConnected,
  };

  // ====================================================
  // Provider
  // ====================================================

  return (
    <AppContext.Provider
      value={value}
    >
      {children}
    </AppContext.Provider>
  );
};

// ======================================================
// Custom Hook
// ======================================================

export const useAppContext = () => {

  const context =
    useContext(
      AppContext
    );

  if (
    context === undefined
  ) {

    throw new Error(
      'useAppContext must be used within an AppProvider'
    );
  }

  return context;
};