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
  id: number;

  title: string;

  time: string;

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
// 어항 커스터마이징 구조물
// ======================================================

export type AquariumDecorationType =
  | 'house'
  | 'plant'
  | 'rock'
  | 'structure';

export interface AquariumDecoration {
  id: string;

  type: AquariumDecorationType;

  src: string;

  // 어항 내부 위치 (%)
  x: number;
  y: number;

  // 크기 (%)
  width?: number;
  height?: number;

  sway?: boolean;
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
// 로그인 계정
// ======================================================

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  cameraConfigured: boolean;
}

// ======================================================
// AppContext 타입
// ======================================================

interface AppContextType {

  // --------------------------------------------------
  // 로그인
  // --------------------------------------------------

  currentUser: AuthUser | null;
  authLoading: boolean;

  login: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;

  signup: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;

  logout: () => Promise<void>;

  // --------------------------------------------------
  // 기본 설정
  // --------------------------------------------------

  isLiveMode: boolean;
  setIsLiveMode: (val: boolean) => void;

  tankName: string;
  setTankName: (val: string) => void;

  fishName: string;
  setFishName: (val: string) => void;

  fishSpecies: string | null;

  // 로그인 후 /api/fish 조회가 끝났는지 여부.
  // 물고기 미설정 계정을 /select-fish로 보내는 판단에 사용된다.
  fishLoading: boolean;

  updateFish: (
    species: string,
    name: string
  ) => Promise<{ success: boolean; error?: string }>;

  // 색상 틴트(0~360도, hue-rotate 각도) / 액세서리(빈 문자열 = 없음)
  fishColorHue: number;
  fishAccessory: string;

  updateFishAppearance: (
    colorHue: number,
    accessory: string
  ) => Promise<{ success: boolean; error?: string }>;

  // 어항 배경 테마: 'default' | 'night' | 'halloween' | 'christmas'
  tankTheme: string;

  updateTankTheme: (
    theme: string
  ) => Promise<{ success: boolean; error?: string }>;

  // 바닥재(자갈/모래) 색상: 'natural' | 'white' | 'black' | 'pink' | 'blue'
  substrateColor: string;

  updateSubstrateColor: (
    substrateColor: string
  ) => Promise<{ success: boolean; error?: string }>;

  confirmCameraSetup: () => Promise<{ success: boolean; error?: string }>;

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
  // 어항 커스터마이징
  // --------------------------------------------------

  aquariumDecorations: AquariumDecoration[];

  setAquariumDecorations: (
    decorations: AquariumDecoration[]
  ) => void;

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

  setAlerts: React.Dispatch<
    React.SetStateAction<Alert[]>
  >;

  // --------------------------------------------------
  // YOLO / 물고기
  // --------------------------------------------------

  fishData: FishData;

  // --------------------------------------------------
  // 센서
  // --------------------------------------------------

  sensorData: SensorData | null;

  displaySensorData: DisplaySensorData | null;

  adminLiveFrame: string | null;

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
  // 로그인
  // ====================================================

  const API_BASE =
    import.meta.env.VITE_API_URL ||
    'https://ggnu.site';

  const [currentUser, setCurrentUser] =
    useState<AuthUser | null>(null);

  // WebSocket onmessage 클로저(마운트 시 1회 생성)가
  // 로그인 상태 변경을 즉시 반영할 수 있도록 ref로도 들고 있는다.
  const currentUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);

  const [authLoading, setAuthLoading] =
    useState(true);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/me`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          setCurrentUser(null);
          return;
        }

        const data = await response.json();
        setCurrentUser(data.user ?? null);
      } catch (error) {
        console.error('❌ 로그인 상태 확인 실패:', error);
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    loadCurrentUser();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || '로그인에 실패했습니다.' };
      }

      setCurrentUser(data.user);
      return { success: true };
    } catch (error) {
      console.error('❌ 로그인 요청 실패:', error);
      return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
  };

  const signup = async (username: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || '회원가입에 실패했습니다.' };
      }

      setCurrentUser(data.user);
      return { success: true };
    } catch (error) {
      console.error('❌ 회원가입 요청 실패:', error);
      return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('❌ 로그아웃 요청 실패:', error);
    } finally {
      setCurrentUser(null);
      setFishSpecies(null);
      setFishName('');
      setFishColorHue(0);
      setFishAccessory('');
      setTankTheme('default');
      setSubstrateColor('natural');
    }
  };

  // ====================================================
  // 로그인한 유저별 물고기 설정
  //
  // 센서/YOLO 데이터는 물리 어항 하나를 공유하지만,
  // 물고기 종류/이름은 계정별로 개별 저장된다.
  // ====================================================

  useEffect(() => {
    // 로그인 확인이 아직 안 끝났으면 판단을 미룬다. currentUser가
    // null → 유저 객체로 바뀌는 렌더와 이 effect가 재실행되는 렌더
    // 사이에 한 틱의 간격이 있는데, 그 틈에 fishLoading이 (로그인
    // 전 기본값인) false로 남아있으면 라우터가 "물고기 없음"으로
    // 오판해서 이미 물고기를 고른 계정도 선택 화면으로 잘못
    // 튕겨나간다.
    if (authLoading) {
      return;
    }

    if (!currentUser) {
      setFishLoading(false);
      setFishSpecies(null);
      setFishName('');
      setFishColorHue(0);
      setFishAccessory('');
      setTankTheme('default');
      setSubstrateColor('natural');
      return;
    }

    setFishLoading(true);
    let cancelled = false;

    // 조회가 일시적으로 실패했다고 "물고기 없음"으로 단정지으면
    // 서버가 잠깐 불안정할 때마다 이미 골라둔 물고기가 있는
    // 계정도 선택 화면으로 튕겨나간다. 확실한 응답을 받을
    // 때까지는 재시도하고, 그 전엔 로딩 상태를 유지한다.
    const loadFish = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(`${API_BASE}/api/fish`, {
            credentials: 'include',
            cache: 'no-store',
          });

          if (!response.ok) {
            throw new Error(`상태 코드 ${response.status}`);
          }

          const data = await response.json();

          if (data.fish) {
            setFishSpecies(data.fish.species);
            setFishName(data.fish.fishName);
            setFishColorHue(data.fish.colorHue ?? 0);
            setFishAccessory(data.fish.accessory ?? '');
            setTankTheme(data.fish.tankTheme || 'default');
            setSubstrateColor(data.fish.substrateColor || 'natural');
          } else {
            setFishSpecies(null);
            setFishName('');
            setFishColorHue(0);
            setFishAccessory('');
            setTankTheme('default');
            setSubstrateColor('natural');
          }

          setFishLoading(false);
          return;
        } catch (error) {
          console.error('❌ 물고기 정보 조회 실패, 재시도합니다:', error);

          await new Promise((resolve) => {
            window.setTimeout(resolve, 2000);
          });
        }
      }
    };

    loadFish();

    return () => {
      cancelled = true;
    };
  }, [currentUser, authLoading]);

  const updateFish = async (species: string, name: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/fish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species, fishName: name }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || '물고기 정보 저장에 실패했습니다.' };
      }

      setFishSpecies(species);
      setFishName(name);
      return { success: true };
    } catch (error) {
      console.error('❌ 물고기 정보 저장 실패:', error);
      return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
  };

  const updateFishAppearance = async (colorHue: number, accessory: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/fish/appearance`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorHue, accessory }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || '외형 저장에 실패했습니다.' };
      }

      setFishColorHue(colorHue);
      setFishAccessory(accessory);
      return { success: true };
    } catch (error) {
      console.error('❌ 물고기 외형 저장 실패:', error);
      return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
  };

  const updateTankTheme = async (theme: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/tank-theme`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || '테마 저장에 실패했습니다.' };
      }

      setTankTheme(theme);
      return { success: true };
    } catch (error) {
      console.error('❌ 어항 테마 저장 실패:', error);
      return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
  };

  const updateSubstrateColor = async (substrateColor: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/tank-substrate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ substrateColor }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || '바닥재 저장에 실패했습니다.' };
      }

      setSubstrateColor(substrateColor);
      return { success: true };
    } catch (error) {
      console.error('❌ 바닥재 색상 저장 실패:', error);
      return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
  };

  // 카메라 연결(필수 단계) 완료 표시.
  // 성공하면 currentUser도 즉시 갱신해서 재로그인 없이 바로 반영되게 한다.
  const confirmCameraSetup = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/camera/confirm-setup`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || '카메라 연결 확인에 실패했습니다.' };
      }

      setCurrentUser((prev) =>
        prev ? { ...prev, cameraConfigured: true } : prev
      );

      return { success: true };
    } catch (error) {
      console.error('❌ 카메라 연결 확인 실패:', error);
      return { success: false, error: '서버에 연결할 수 없습니다.' };
    }
  };

  // ====================================================
  // 기본 설정
  // ====================================================

  const [isLiveMode, setIsLiveMode] =
    useState(false);

  const [tankName, setTankName] =
    useState('Cyber Fish Tank');

  const [fishName, setFishName] =
    useState('');

  const [fishSpecies, setFishSpecies] =
    useState<string | null>(null);

  const [fishLoading, setFishLoading] =
    useState(true);

  const [fishColorHue, setFishColorHue] =
    useState(0);

  const [fishAccessory, setFishAccessory] =
    useState('');

  const [tankTheme, setTankTheme] =
    useState('default');

  const [substrateColor, setSubstrateColor] =
    useState('natural');

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

  const formatAlertTime = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

  // AppProvider 내부:
  const lastAlertTimeRef = useRef<Record<string, number>>({});
  const FIVE_MINUTES = 5 * 60 * 1000;

  // ====================================================
  // 어항 커스터마이징
  // ====================================================

  // 계정별로 분리 저장하기 위해 유저 id를 key에 포함시킨다.
  const getDecorationsKey = (userId: number | null | undefined) =>
    userId
      ? `cyber-fishtank-aquarium-decorations-${userId}`
      : null;

  const parseDecorations = (saved: string | null): AquariumDecoration[] => {
    try {
      if (!saved) {
        return [];
      }

      const parsed =
        JSON.parse(saved);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(
        item =>
          item &&
          typeof item.id === 'string' &&
          typeof item.type === 'string' &&
          typeof item.src === 'string' &&
          Number.isFinite(item.x) &&
          Number.isFinite(item.y)
      );
    } catch (error) {
      console.warn(
        '어항 배치 복원 실패:',
        error
      );
      return [];
    }
  };

  const [
    aquariumDecorations,
    setAquariumDecorations
  ] = useState<AquariumDecoration[]>([]);

  // currentUser가 바뀔 때(로그인/로그아웃/계정 전환)마다
  // 해당 계정의 배치를 새로 불러온다.
  useEffect(() => {
    const key = getDecorationsKey(currentUser?.id);

    if (!key) {
      setAquariumDecorations([]);
      return;
    }

    setAquariumDecorations(
      parseDecorations(localStorage.getItem(key))
    );
  }, [currentUser?.id]);

  useEffect(() => {
    const key = getDecorationsKey(currentUser?.id);

    if (!key) {
      return;
    }

    try {
      localStorage.setItem(
        key,
        JSON.stringify(aquariumDecorations)
      );
    } catch (error) {
      console.warn(
        '어항 배치 저장 실패:',
        error
      );
    }
  }, [aquariumDecorations]);

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

  const [alerts, setAlerts] =
    useState<Alert[]>([]);

  const checkAndSaveAlert = async (
    type: string,
    title: string,
    detail: string,
    eventTimeMs: number
  ) => {

    const lastTime =
      lastAlertTimeRef.current[type];

    // ==================================================
    // 프론트엔드 1차 5분 디바운싱
    //
    // 최종 중복 방지는 server.cjs에서도 수행한다.
    // ==================================================

    if (
      lastTime !== undefined &&
      eventTimeMs - lastTime < FIVE_MINUTES
    ) {
      return;
    }

    lastAlertTimeRef.current[type] =
      eventTimeMs;

    const formattedTime =
      formatAlertTime(
        new Date(eventTimeMs)
      );

    try {

      const API_URL =
        import.meta.env.VITE_API_URL ||
        'https://ggnu.site';

      const response =
        await fetch(
          `${API_URL}/api/alerts`,
          {
            method: 'POST',

            credentials: 'include',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              title,
              time: formattedTime,
              detail,
              type,
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          '알람 저장 요청에 실패했습니다.'
        );
      }

      const result =
        await response.json();

      // ==================================================
      // 새 알람 저장 성공 시
      //
      // WebSocket 브로드캐스트도 오지만,
      // POST 응답으로 먼저 상태를 즉시 반영한다.
      // 이후 WebSocket으로 같은 ID가 들어와도
      // 중복되지 않도록 ID를 검사한다.
      // ==================================================

      if (
        result.success &&
        result.data
      ) {

        const savedAlert: Alert = {
          id: Number(
            result.data.id
          ),

          title: String(
            result.data.title
          ),

          time: String(
            result.data.time
          ),

          detail: String(
            result.data.detail
          ),
        };

        setAlerts(prev => {

          const alreadyExists =
            prev.some(
              alert =>
                alert.id ===
                savedAlert.id
            );

          if (alreadyExists) {
            return prev;
          }

          return [
            savedAlert,
            ...prev,
          ];
        });
      }

    } catch (error) {

      // 저장 실패 시 이번 디바운싱 기록을 제거하여
      // 다음 센서 수신 때 재시도할 수 있도록 한다.
      if (
        lastAlertTimeRef.current[type] ===
        eventTimeMs
      ) {
        delete lastAlertTimeRef.current[type];
      }

      console.error(
        '❌ 알람 DB 저장 실패:',
        error
      );
    }
  };

  const evaluateRealtimeSensor = (temp: number, ph: number, waterLevel: number, timestampStr: string) => {
    const eventTimeMs = new Date(timestampStr).getTime() || Date.now();

    if (Number.isFinite(temp)) {
      if (temp > 26) checkAndSaveAlert('temperature-increase', '수온 상승 경고', '수온이/가 기준에서 벗어났습니다. 적정 기준: 24 ~ 26도', eventTimeMs);
      else if (temp < 24) checkAndSaveAlert('temperature-decrease', '수온 저하 경고', '수온이/가 기준에서 벗어났습니다. 적정 기준: 24 ~ 26도', eventTimeMs);
    }

    if (Number.isFinite(ph)) {
      if (ph > 7) checkAndSaveAlert('ph-increase', 'pH 상승 경고', 'pH이/가 기준에서 벗어났습니다. 적정 기준: 6 ~ 7', eventTimeMs);
      else if (ph < 6) checkAndSaveAlert('ph-decrease', 'pH 하락 경고', 'pH이/가 기준에서 벗어났습니다. 적정 기준: 6 ~ 7', eventTimeMs);
    }

    if (Number.isFinite(waterLevel) && waterLevel === 0) {
      checkAndSaveAlert('water-decrease', '수위 저하 경고', '수위가 기준보다 낮습니다.', eventTimeMs);
    }
  };

  // ====================================================
  // DB에서 알람 기록 불러오기
  // ====================================================

  useEffect(() => {

    const loadAlerts = async () => {

      try {

        const API_URL =
          import.meta.env.VITE_API_URL ||
          'https://ggnu.site';

        const response =
          await fetch(
            `${API_URL}/api/alerts`,
            { credentials: 'include' }
          );

        if (!response.ok) {

          throw new Error(
            '알람 데이터를 불러오지 못했습니다.'
          );

        }

        const data =
          await response.json();

        const loadedAlerts: Alert[] =
          Array.isArray(data)
            ? data.map(item => ({
                id: Number(item.id),
                title: String(item.title),
                time: String(item.time),
                detail: String(item.detail),
              }))
            : [];

        setAlerts(loadedAlerts);

        console.log(
          '📋 DB 알람 기록 불러오기:',
          loadedAlerts
        );

      } catch (error) {

        console.error(
          '❌ 알람 기록 불러오기 실패:',
          error
        );

      }

    };

    loadAlerts();

  }, []);

  // ====================================================
  // 센서별 마지막 알람 발생 시간
  //
  // 같은 알람은 5분 이후에만 다시 발생
  // ====================================================
  
  // ====================================================
  // 이상 징후 알림 추가
  //
  // 같은 알람은 5분 이후에만 다시 발생
  // ====================================================
  
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

  // 센서 값은 원래 WebSocket 실시간 수신으로만 채워지는데,
  // 서버가 막 재시작됐거나 다음 패킷이 아직 안 왔으면 그 사이엔
  // 화면이 계속 비어있었다. 새로고침 시 마지막 저장값으로 먼저
  // 채워두고, 실시간 값이 오면 그걸로 자연스럽게 덮어써진다.
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const hydrateLatestSensorData = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/sensor-data/latest`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const row = data?.data;

        if (!row) {
          return;
        }

        setDisplaySensorData({
          temperature: Number(row.temperature ?? 0),
          ph: Number(row.ph ?? 0),
          water_level:
            row.water_level_detected === '1' ? 1 : 0,
          light: 0,
          tds: Number(row.tds ?? 0),
          turbidity: Number(row.turbidity_voltage ?? 0),
          timestamp: row.timestamp,
        });
      } catch (error) {
        console.error('❌ 초기 센서 데이터 조회 실패:', error);
      }
    };

    hydrateLatestSensorData();
  }, [currentUser]);

  // ====================================================
  // Live Render (admin 물리 어항 원본 영상)
  // ====================================================

  const [adminLiveFrame, setAdminLiveFrame] =
    useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const hydrateLiveFrame = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/live-camera-frame`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data?.image) {
          setAdminLiveFrame(data.image);
        }
      } catch (error) {
        console.error('❌ 초기 Live 프레임 조회 실패:', error);
      }
    };

    hydrateLiveFrame();
  }, [currentUser]);

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

  const recentSensorBufferRef =
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
        // 0. Live Render 원본 프레임 확인
        // =================================================

        if (data.type === 'live_frame') {

          if (
            data.owner_user_id !== undefined &&
            data.owner_user_id !== currentUserIdRef.current
          ) {
            return;
          }

          setAdminLiveFrame(data.image);

          return;
        }

        // =================================================
        // 1. 알람 데이터 확인
        // =================================================

        if (
          data.type === 'alert'
        ) {

          if (
            data.owner_user_id !== undefined &&
            data.owner_user_id !== currentUserIdRef.current
          ) {
            return;
          }

          const newAlert: Alert = {
            id:
              Number(data.alert.id),

            title:
              String(data.alert.title),

            time:
              String(data.alert.time),

            detail:
              String(data.alert.detail),
          };

          setAlerts(prev => {

            const alreadyExists =
              prev.some(
                alert =>
                  alert.id === newAlert.id
              );

            if (alreadyExists) {
              return prev;
            }

            return [
              newAlert,
              ...prev,
            ];

          });

          console.log(
            '🚨 새로운 알람 수신:',
            newAlert
          );

          return;
        }

        // =================================================
        // 2. YOLO 데이터 확인
        // =================================================

        const isYoloData =
          data.center_norm !== undefined ||
          data.move_direction !== undefined ||
          data.head !== undefined ||
          data.tail !== undefined;

        if (isYoloData) {

          // 이 물리 어항은 owner_user_id 계정 소유다.
          // 로그인한 계정이 그 소유자가 아니면 이 데이터를 무시한다
          // (본인 카메라를 켠 경우에만 자기 데이터를 따로 받는다).
          if (
            data.owner_user_id !== undefined &&
            data.owner_user_id !== currentUserIdRef.current
          ) {
            return;
          }

          const newFishData: FishData = {

            center_norm:
              Array.isArray(data.center_norm)
                ? data.center_norm
                : [0.5, 0.5],

            move_direction:
              data.move_direction || 'none',

            pose_direction:
              data.pose_direction || 'none',

            head: Array.isArray(data.head)
              ? data.head
              : Array.isArray(data.keypoints?.head)
                ? data.keypoints.head
                : [0.5, 0.5],

            tail: Array.isArray(data.tail)
              ? data.tail
              : Array.isArray(data.keypoints?.tail)
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
        // 3. 센서 데이터인지 확인
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

        // 센서도 물고기 데이터와 마찬가지로 소유 계정 것만 반영한다.
        if (
          data.owner_user_id !== undefined &&
          data.owner_user_id !== currentUserIdRef.current
        ) {
          return;
        }

        // =================================================
        // 4. 센서 데이터 변환
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
        // 5. 실제 센서 데이터 저장
        // =================================================

        setSensorData(
          newSensorData
        );

        // setSensorData(newSensorData); 호출 바로 다음 위치에 추가
        evaluateRealtimeSensor(
          newSensorData.temperature_c,
          newSensorData.ph,
          Number(newSensorData.water_level_detected),
          newSensorData.timestamp
        );

        console.log(
          '📡 센서 데이터:',
          newSensorData
        );

        // =================================================
        // 6. 기록 그래프용 데이터 생성
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
        // 7. 최근 10분 평균 저장
        // =================================================

        const newTimestamp =
          new Date(
            newDisplayData.timestamp
          ).getTime();

        const recentSamples =
          Number.isFinite(newTimestamp)
            ? [
                ...recentSensorBufferRef.current,
                newDisplayData,
              ].filter(
                item => {
                  const itemTimestamp =
                    new Date(
                      item.timestamp
                    ).getTime();

                  return (
                    Number.isFinite(itemTimestamp) &&
                    itemTimestamp >=
                      newTimestamp -
                        3 * 60 * 1000 &&
                    itemTimestamp <=
                      newTimestamp
                  );
                }
              )
            : [newDisplayData];

        recentSensorBufferRef.current =
          recentSamples;

        const averageRecent = (
          key: keyof Omit<
            DisplaySensorData,
            'timestamp'
          >
        ) => {
          const values =
            recentSamples
              .map(item => item[key])
              .filter(
                value =>
                  Number.isFinite(value)
              );

          return values.length > 0
            ? values.reduce(
                (sum, value) =>
                  sum + value,
                0
              ) / values.length
            : 0;
        };

        const averagedDisplayData:
          DisplaySensorData = {
            temperature:
              averageRecent('temperature'),
            ph:
              averageRecent('ph'),
            water_level:
              averageRecent('water_level'),
            light:
              averageRecent('light'),
            tds:
              averageRecent('tds'),
            turbidity:
              averageRecent('turbidity'),
            timestamp:
              newDisplayData.timestamp,
          };

        setDisplaySensorData(
          averagedDisplayData
        );

        // =================================================
        // 8. 1시간 버퍼에 추가
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
        // 9. 6개가 모이면 1시간 평균 계산
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
          // 10. 1시간 평균 데이터
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
          // 11. 콘솔 출력
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
          // 12. 가장 최근 1시간 평균
          // =================================================

          setHourlyAverage(
            averageData
          );

          // =================================================
          // 13. 전체 시간 평균 기록에 추가
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
          // 14. 다음 1시간 측정 시작
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
    // 로그인
    // --------------------------------------------------

    currentUser,
    authLoading,
    login,
    signup,
    logout,

    // --------------------------------------------------
    // 기본 설정
    // --------------------------------------------------

    isLiveMode,
    setIsLiveMode,

    tankName,
    setTankName,

    fishName,
    setFishName,

    fishSpecies,
    fishLoading,
    updateFish,
    fishColorHue,
    fishAccessory,
    updateFishAppearance,
    tankTheme,
    updateTankTheme,
    substrateColor,
    updateSubstrateColor,
    confirmCameraSetup,

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
    // 어항 커스터마이징
    // --------------------------------------------------

    aquariumDecorations,
    setAquariumDecorations,

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
    setAlerts,

    // --------------------------------------------------
    // YOLO
    // --------------------------------------------------

    fishData,

    // --------------------------------------------------
    // 센서
    // --------------------------------------------------

    sensorData,

    displaySensorData,

    adminLiveFrame,

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