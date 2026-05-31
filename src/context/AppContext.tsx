import React, { createContext, useContext, useState, useEffect,type ReactNode } from 'react';

interface LightScheduleItem {
  id: number;
  label: string;
  time: string;
  brightness: number;
}

interface Alert {
  title: string;
  time: string;
  level: '위험' | '주의' | '정보' | string;
  detail: string;
}

interface AppContextType {
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
  targetTemperature: number;
  setTargetTemperature: (val: number) => void;
  heaterPower: boolean;
  setHeaterPower: (val: boolean) => void;
  lightPower: boolean;
  setLightPower: (val: boolean) => void;
  lightBrightness: number;
  setLightBrightness: (val: number) => void;
  autoLightSchedule: boolean;
  setAutoLightSchedule: (val: boolean) => void;
  lightSchedule: LightScheduleItem[];
  setLightSchedule: React.Dispatch<React.SetStateAction<LightScheduleItem[]>>;
  feedAmount: string;
  setFeedAmount: (val: string) => void;
  autoFeeding: boolean;
  setAutoFeeding: (val: boolean) => void;
  feedingInterval: string;
  setFeedingInterval: (val: string) => void;
  lastFeedTime: string;
  setLastFeedTime: (val: string) => void;
  controlNotice: string;
  setControlNotice: (val: string) => void;
  alerts: Alert[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [tankName, setTankName] = useState('Cyber Fish Tank');
  const [fishName, setFishName] = useState('Nemo');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [language, setLanguage] = useState('한국어');
  const [accountEmail, setAccountEmail] = useState('user@cyberfishtank.com');
  const [controlPin, setControlPin] = useState('2480');

  const [targetTemperature, setTargetTemperature] = useState(25);
  const [heaterPower, setHeaterPower] = useState(true);
  const [lightPower, setLightPower] = useState(true);
  const [lightBrightness, setLightBrightness] = useState(70);
  const [autoLightSchedule, setAutoLightSchedule] = useState(true);
  const [lightSchedule, setLightSchedule] = useState([
    { id: 1, label: '아침', time: '07:00', brightness: 45 },
    { id: 2, label: '낮', time: '12:00', brightness: 75 },
    { id: 3, label: '저녁', time: '18:30', brightness: 35 },
    { id: 4, label: '취침', time: '22:30', brightness: 10 },
  ]);
  const [feedAmount, setFeedAmount] = useState('표준');
  const [autoFeeding, setAutoFeeding] = useState(true);
  const [feedingInterval, setFeedingInterval] = useState('12시간');
  const [lastFeedTime, setLastFeedTime] = useState('오늘 09:30');
  const [controlNotice, setControlNotice] = useState('');

  const alerts: Alert[] = [
    { title: '활동량 급감', time: '2026-04-13 11:03', level: '위험', detail: '최근 30분 평균 활동량이 기준치보다 24% 낮습니다.' },
    { title: 'pH 변동 감지', time: '2026-04-13 10:42', level: '주의', detail: 'pH가 6.9에서 6.6으로 빠르게 변했습니다.' },
    { title: '수위 저하 경고', time: '2026-04-12 21:10', level: '주의', detail: '수위가 권장 범위 하단에 근접했습니다.' },
    { title: '조명 제어 완료', time: '2026-04-12 19:15', level: '정보', detail: '사용자 요청에 따라 조명 밝기가 70%로 조절되었습니다.' },
    { title: '수온 상승 경고', time: '2026-04-11 14:08', level: '위험', detail: '수온이 26.3°C까지 올라 권장 범위를 초과했습니다.' },
  ];

  useEffect(() => {
    if (!controlNotice) return;
    const timer = setTimeout(() => setControlNotice(''), 2200);
    return () => clearTimeout(timer);
  }, [controlNotice]);

  const value = {
    isLiveMode, setIsLiveMode,
    tankName, setTankName,
    fishName, setFishName,
    notificationsEnabled, setNotificationsEnabled,
    darkModeEnabled, setDarkModeEnabled,
    language, setLanguage,
    accountEmail, setAccountEmail,
    controlPin, setControlPin,
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
    controlNotice, setControlNotice,
    alerts
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
