import useOnline from '../../hooks/useOnline';
import { trackedFetch as fetch } from '../../services/requestActivity';
import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Fish2D } from '../../components/Fish2D';
import Aquarium from '../../components/Aquarium';
import FeedingCalendar from '../../components/FeedingCalendar';
import { Link } from 'react-router-dom';
import { Icon, PageHeading } from '../../components/UI';
import useIsMobile from '../../hooks/useIsMobile';
import useElementFullscreen from '../../hooks/useElementFullscreen';
import './fullscreen.css';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://ggnu.site';

const formatLastFeedTime = (value: string | null | undefined) => {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
};

interface FeederStatus {
  feed_count: number;
  angle: number;
  locked: boolean;
  online: boolean;
  last_feed_at: string | null;
  last_command: string | null;
  last_command_status: string | null;
}

// 내 카메라 프레임 전송 주기(ms)
const CAMERA_CAPTURE_INTERVAL_MS = 400;

// import { Fish3D } from '../../components/Fish3D';
// import { Canvas } from '@react-three/fiber';
// import { OrbitControls } from '@react-three/drei';

const Dashboard: React.FC = () => {

  // ====================================================
  // AppContext
  //
  // WebSocket은 AppContext에서 관리한다.
  //
  // Dashboard에서는 fishData만 가져온다.
  // ====================================================

  const isMobile = useIsMobile();
  const online = useOnline();
  const landscapeOnly = isMobile && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);
  const { elementRef: viewerRef, expanded, needsLandscape, toggleFullscreen } = useElementFullscreen({ landscapeOnly });
  const {
    tankName, fishName, fishSpecies,
    isLiveMode,
    setIsLiveMode,
    fishData,
    aquariumDecorations,
    displaySensorData,
    adminLiveFrame,
    controlNotice,
    currentUser,
    tankTheme,
    substrateColor,
    pollutionPreview,
    alerts,
    sensorRanges,
    isWebSocketConnected,
  } = useAppContext();

  // 물리 어항 영상은 admin 소유다. 다른 계정은 본인 카메라를
  // 켰을 때만 자기 영상을 보고, 안 켰으면 admin 영상이 새어
  // 보이면 안 된다.
  const isPhysicalTankOwner = currentUser?.role === 'admin';

  // ====================================================
  // 내 카메라 연동
  //
  // "내 카메라 켜기"는 이 기기가 촬영을 맡아서 프레임을
  // 서버로 보낸다는 뜻일 뿐이다. 화면에 그리는 건 항상
  // fishData(WebSocket, owner_user_id로 필터링됨) 하나로
  // 통일한다 — 그래야 촬영 중인 기기가 아닌 다른 기기
  // (예: 폰)에서 봐도 같은 데이터가 보인다.
  // ====================================================

  const [useMyCamera, setUseMyCamera] = useState(false);
  const [myCameraError, setMyCameraError] = useState('');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  // ====================================================
  // 오염도 판정용 기준선 (이 어항의 전체 이력 평균/표준편차)
  // ====================================================

  const [pollutionBaseline, setPollutionBaseline] = useState<{
    turbidity: { mean: number; std: number };
    tds: { mean: number; std: number };
  } | null>(null);

  const [feederStatus, setFeederStatus] = useState<FeederStatus | null>(null);
  const [feederAvailable, setFeederAvailable] = useState(false);
  const [feederError, setFeederError] = useState('');
  const [feederRequesting, setFeederRequesting] = useState(false);

  useEffect(() => {
    let active = true;

    let loading = false;
    let controller: AbortController | undefined;
    const loadFeederStatus = async () => {
      if (loading || !navigator.onLine || document.visibilityState !== 'visible') return;
      loading = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 5000);
      try {
        const response = await fetch(`${API_BASE}/api/feeder/status`, {
          signal: controller.signal,
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await response.json();
        if (active && response.ok && data.success) {
          setFeederStatus(data);
          setFeederAvailable(true);
        } else if (active) setFeederAvailable(false);
      } catch (error) {
        if (active) setFeederAvailable(false);
        console.error('❌ 급식기 상태 조회 실패:', error);
      } finally { clearTimeout(timeout); loading = false; }
    };

    loadFeederStatus();
    const resume = () => {
      setFeederAvailable(false);
      void loadFeederStatus();
    };
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', resume);
    const intervalId = window.setInterval(loadFeederStatus, 1000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      controller?.abort();
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const requestFeederCommand = async (command: 'feed' | 'reset') => {
    if (feederRequesting || !navigator.onLine || !feederAvailable || !feederStatus?.online) return;
    if (command === 'reset' && !window.confirm('급식기를 초기화하시겠습니까?')) {
      return;
    }

    setFeederRequesting(true);
    setFeederError('');
    try {
      const response = await fetch(`${API_BASE}/api/feeder/${command}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setFeederError(data.error || '급식기 명령 요청에 실패했습니다.');
        return;
      }
      setFeederStatus((current) => current && {
        ...current,
        last_command: data.command.command,
        last_command_status: 'queued',
      });
    } catch (error) {
      console.error('❌ 급식기 명령 요청 실패:', error);
      setFeederError('명령 결과를 확인하지 못했습니다. 마지막 급여와 급식기 상태를 확인해주세요. 명령은 자동 재전송하지 않습니다.');
    } finally {
      setFeederRequesting(false);
    }
  };

  useEffect(() => {
    const loadPollutionBaseline = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/sensor-data/pollution-baseline`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setPollutionBaseline(data.baseline ?? null);
      } catch (err) {
        console.error('❌ 오염도 기준선 조회 실패:', err);
      }
    };

    loadPollutionBaseline();

    // 기준선은 천천히 바뀌는 값이라 30분마다만 갱신한다.
    const intervalId = window.setInterval(loadPollutionBaseline, 30 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const myVideoRef = useRef<HTMLVideoElement>(null);
  const myCaptureCanvasRef = useRef<HTMLCanvasElement>(null);
  const myStreamRef = useRef<MediaStream | null>(null);
  const myCameraTimerRef = useRef<number | null>(null);
  const myCameraSendingRef = useRef(false);

  const stopMyCamera = () => {
    if (myCameraTimerRef.current !== null) {
      window.clearInterval(myCameraTimerRef.current);
      myCameraTimerRef.current = null;
    }
    myStreamRef.current?.getTracks().forEach((track) => track.stop());
    myStreamRef.current = null;
    setUseMyCamera(false);
  };

  useEffect(() => {
    return () => stopMyCamera();
  }, []);

  // 카메라가 여러 대면 고를 수 있게 목록을 가져온다.
  // 권한을 아직 안 줬으면 라벨 없이 개수만 보일 수 있다.
  const loadCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === 'videoinput');
      setAvailableCameras(cameras);
    } catch (err) {
      console.error('❌ 카메라 목록 조회 실패:', err);
    }
  };

  useEffect(() => {
    loadCameraDevices();
  }, []);

  const sendMyCameraFrame = async () => {
    const video = myVideoRef.current;
    const canvas = myCaptureCanvasRef.current;

    if (!video || !canvas || myCameraSendingRef.current || video.readyState < 2) {
      return;
    }

    myCameraSendingRef.current = true;

    try {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

      // 결과는 서버가 WebSocket으로 브로드캐스트해서 fishData에 반영된다.
      // (이 기기 포함, 같은 계정으로 로그인한 모든 기기가 받음)
      await fetch(`${API_BASE}/api/camera/frame`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
    } catch (err) {
      console.error('❌ 내 카메라 프레임 전송 실패:', err);
    } finally {
      myCameraSendingRef.current = false;
    }
  };

  const startMyCamera = async () => {
    setMyCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : {}),
        },
        audio: false,
      });

      myStreamRef.current = stream;

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        await myVideoRef.current.play();
      }

      setUseMyCamera(true);
      myCameraTimerRef.current = window.setInterval(sendMyCameraFrame, CAMERA_CAPTURE_INTERVAL_MS);

      // 권한을 받은 뒤라 이제 카메라 이름(라벨)까지 정확히 보인다.
      loadCameraDevices();
    } catch (err) {
      console.error('❌ 카메라 접근 실패:', err);
      setMyCameraError('카메라에 접근할 수 없습니다. 브라우저 권한을 확인해주세요.');
    }
  };

  const sensorValues =
    displaySensorData;

  const formatValue = (
    value: number | undefined,
    digits: number
  ) =>
    Number.isFinite(value)
      ? value!.toFixed(digits)
      : '-';

  const temperature =
    sensorValues?.temperature;

  const ph =
    sensorValues?.ph;

  const waterLevel =
    sensorValues
      ? sensorValues.water_level * 100
      : undefined;

  const temperatureStatus =
    temperature === undefined
      ? '정보'
      : temperature >= sensorRanges.temperatureMin &&
          temperature <= sensorRanges.temperatureMax
        ? '정상'
        : '주의';

  const phStatus =
    ph === undefined
      ? '정보'
      : ph >= sensorRanges.phMin && ph <= sensorRanges.phMax
        ? '정상'
        : '주의';

  const waterLevelStatus =
    waterLevel === undefined
      ? '정보'
      : waterLevel >= 50
        ? '적정'
        : '낮음';

  // ====================================================
  // 오염도 (탁도 전압 + TDS, 이 어항 자체 이력 기반 상대평가)
  //
  // "TDS 150ppm 이상은 위험" 같은 절대 기준은 이 센서의 실제
  // 캘리브레이션을 모르는 상태에서는 근거가 없다. 대신 이
  // 어항의 전체 이력 평균/표준편차(서버가 계산해줌)를 기준선
  // 삼아 "평소보다 얼마나 벗어났는지"로 판단한다.
  //
  // 탁도는 방향(맑을수록 전압이 오르는지 내리는지)을 모르니
  // 평소와 다르면(±) 그 자체를 이상 신호로 본다. TDS는 방향이
  // 명확하므로(높을수록 오염 물질↑) 평소보다 높아진 쪽만 본다.
  // ====================================================

  const turbidityVoltage =
    sensorValues?.turbidity;

  const tds =
    sensorValues?.tds;

  const zScoreToSeverity = (z: number | null) =>
    z === null
      ? null
      : z < sensorRanges.pollutionWarningZ
        ? 0
        : z < sensorRanges.pollutionDangerZ
          ? 1
          : 2;

  const turbidityBaseline =
    pollutionBaseline?.turbidity;

  const tdsBaseline =
    pollutionBaseline?.tds;

  const turbidityZ =
    turbidityVoltage === undefined || !turbidityBaseline || turbidityBaseline.std < 0.001
      ? null
      : Math.abs(turbidityVoltage - turbidityBaseline.mean) / turbidityBaseline.std;

  const tdsZ =
    tds === undefined || !tdsBaseline || tdsBaseline.std < 0.001
      ? null
      : Math.max(0, (tds - tdsBaseline.mean) / tdsBaseline.std);

  const turbiditySeverity =
    zScoreToSeverity(turbidityZ);

  const tdsSeverity =
    zScoreToSeverity(tdsZ);

  const pollutionSeverity =
    turbiditySeverity === null && tdsSeverity === null
      ? null
      : Math.max(turbiditySeverity ?? 0, tdsSeverity ?? 0);

  // admin이 실측값을 기다리지 않고도 색 변화를 눈으로 확인할 수 있는
  // 미리보기 오버라이드. 실제 판정에는 영향 없음(화면 표시만 바뀜).
  const effectivePollutionSeverity =
    pollutionPreview !== null
      ? pollutionPreview
      : pollutionSeverity;

  const pollutionStatus =
    effectivePollutionSeverity === null
      ? '정보'
      : effectivePollutionSeverity === 0
        ? '정상'
        : effectivePollutionSeverity === 1
          ? '주의'
          : '위험';

  const pollutionLabel =
    effectivePollutionSeverity !== null
      ? pollutionStatus
      : pollutionBaseline === null && sensorValues
        ? '기준 수집 중'
        : '데이터 없음';

  const WATER_COLORS: Record<number, string> = {
    0: '#58b9d8', // 정상 - 맑은 파랑
    1: '#8a9a5b', // 주의 - 탁한 연두빛
    2: '#7a5c3e', // 위험 - 흙탕 갈색
  };

  const waterColor =
    WATER_COLORS[effectivePollutionSeverity ?? 0];

  const bottomStats = [
    {
      label: '수온',
      value:
        temperature === undefined
          ? '-'
          : `${formatValue(temperature, 2)}°C`,
      status: temperatureStatus,
    },
    {
      label: 'pH',
      value:
        ph === undefined
          ? '-'
          : formatValue(ph, 2),
      status: phStatus,
    },
    {
      label: '수위',
      value:
        waterLevel === undefined
          ? '-'
          : waterLevelStatus,
      status:
        waterLevel === undefined
          ? '정보'
          : waterLevelStatus,
    },
    {
      label: '오염도',
      value: pollutionLabel,
      status: pollutionStatus,
    },
  ];

  const statIcons = ['temperature', 'flask', 'waves', 'water'] as const;
  const statDescriptions = [ `적정 범위 ${sensorRanges.temperatureMin}–${sensorRanges.temperatureMax}°C`, `적정 범위 ${sensorRanges.phMin}–${sensorRanges.phMax}`, '어항의 물 높이를 확인해요', '평소 어항 상태와 비교해요'];

  // Share the actual controls and live renderer across two distinct page layouts.
  const twinPanel = (<section ref={viewerRef} className={`cft-panel cft-twin-panel${expanded ? ' is-expanded' : ''}${needsLandscape ? ' needs-landscape' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? '어항 전체화면' : undefined}>
            <div className="cft-panel-heading"><div><h2>{expanded ? isLiveMode ? 'Live Render' : 'Digital Twin' : '실시간 디지털 트윈'}</h2>{isMobile && <span className="cft-badge is-success cft-mobile-live-badge">LIVE</span>}</div><div className="cft-camera-controls">
              {!useMyCamera && availableCameras.length > 1 && <select aria-label="카메라 선택" value={selectedCameraId} onChange={event => setSelectedCameraId(event.target.value)}><option value="">기본 카메라</option>{availableCameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `카메라 ${index + 1}`}</option>)}</select>}
              <button className="cft-button cft-mode-button" onClick={() => setIsLiveMode(!isLiveMode)}>{isLiveMode ? 'Digital Twin' : 'Live Render'} <Icon name="arrow" /></button>
              <button className="cft-button" onClick={useMyCamera ? stopMyCamera : startMyCamera}><Icon name="camera" />{useMyCamera ? '카메라 끄기' : '카메라 켜기'}</button>
            </div></div>
            {myCameraError && <p role="alert" className="cft-error">{myCameraError}</p>}
            <div className={`cft-live-aquarium relative overflow-hidden${isLiveMode ? ' is-live' : ''}`}>
              {!isLiveMode ? (

                /* -------------------------------------------
                   디지털 트윈
                   ------------------------------------------- */

                <div className="
                  absolute
                  inset-0
                  z-0
                ">

                  <Aquarium
                    variant="soft"
                    showFish={false}
                    decorations={aquariumDecorations}
                    waterColor={waterColor}
                    theme={tankTheme}
                    substrateColor={substrateColor}
                  >

                    <Fish2D
                      {...fishData}
                    />

                  </Aquarium>

                </div>

              ) : !useMyCamera && isPhysicalTankOwner ? (

                adminLiveFrame ? (

                  <img
                    src={adminLiveFrame}
                    className="
                      absolute
                      inset-0
                      h-full
                      w-full
                      bg-white
                      object-contain
                    "
                    alt={isWebSocketConnected && online ? "실시간 어항 카메라" : "마지막으로 수신한 어항 카메라 화면"}
                  />

                ) : (

                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                    실시간 화면을 기다리는 중...
                  </div>

                )

              ) : !useMyCamera ? (

                /* admin이 아닌 계정은 본인 카메라를 안 켰으면
                   admin의 물리 어항 영상이 보이면 안 된다. */

                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
                  <div>실시간 화면을 보려면 내 카메라를 먼저 켜주세요.</div>
                </div>

              ) : null}

              {isLiveMode && (!online || !isWebSocketConnected) && <div className="absolute bottom-3 left-3 z-20 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">연결 복구 중 · 마지막 수신 영상</div>}

              {/* 내 카메라 영상. 프레임 캡처가 끊기지 않도록 라이브/트윈
                  모드와 상관없이 항상 마운트해두고, 크기만 바꾼다. */}
              <video
                  ref={myVideoRef}
                  hidden={!useMyCamera}
                  muted
                  playsInline
                  className={
                    isLiveMode
                      ? 'absolute inset-0 z-0 h-full w-full bg-white object-contain'
                      : 'absolute right-3 top-3 z-10 h-24 w-32 overflow-hidden rounded-[10px] border border-white/70 bg-slate-900 object-contain shadow-lg'
                  }
                />
              <canvas ref={myCaptureCanvasRef} className="hidden" />
              <button type="button" className="cft-fullscreen-toggle" aria-label={expanded ? '전체화면 닫기' : '전체화면 보기'} title={expanded ? '전체화면 닫기 (Esc)' : '전체화면 보기'} aria-expanded={expanded} onClick={toggleFullscreen}><Icon name={expanded ? 'collapse' : 'expand'} /><span>{expanded ? '닫기' : '전체화면'}</span></button>

            </div>
            <div className="cft-twin-footer">{isMobile ? <span><strong>{fishName}</strong><small>{fishSpecies === 'betta' ? '베타' : fishSpecies}</small></span> : <span><Icon name="camera" />{useMyCamera ? '내 카메라 연결됨 · 실시간 추적 중' : isLiveMode ? '실시간 카메라 화면' : '실시간 상태 · 디지털 어항'}</span>}{expanded && <span className="cft-fullscreen-status" role="status">{!online || !isWebSocketConnected ? '연결 복구 중 · 마지막 수신 상태' : isMobile ? '실시간 연결됨' : 'Esc 또는 닫기로 돌아가기'}</span>}</div>
            {needsLandscape && <div className="cft-landscape-guide" role="status"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="22" y="14" width="20" height="36" rx="4" /><path d="M27 19h10M30 44h4M11 27a22 22 0 0 1 38-12m-1-8 2 9-9-1M53 37a22 22 0 0 1-38 12m1 8-2-9 9 1" /></svg><h3>가로로 돌려주세요</h3><p>어항 전체화면은 가로 방향으로 볼 수 있어요.</p></div>}
          </section>);
  const statsPanel = (<div className="cft-stat-grid">
            {bottomStats.map((item, index) => (
              <section className="cft-stat-card" key={item.label}>
                <div className="cft-stat-label">
                  <Icon name={statIcons[index]} /><span>{item.label}</span>
                  <span className={`cft-badge ${['주의', '낮음'].includes(item.status) ? 'is-warning' : item.status === '위험' ? 'is-danger' : item.status === '정보' ? 'is-neutral' : 'is-success'}`}>{item.status}</span>
                </div>
                <div className="cft-stat-value">{item.value}</div>
                <p>{statDescriptions[index]}</p>
              </section>
            ))}
          </div>);
  const feederPanel = (<section className="cft-panel cft-feeder-panel">
            <div className="cft-panel-heading"><h2>자동 급식기</h2><span className={`cft-badge ${feederStatus?.online ? 'is-success' : 'is-neutral'}`}>{feederStatus?.online ? '온라인' : '오프라인'}</span></div>
            <p className="cft-caption cft-feeder-connection">{feederStatus?.online ? 'RP2040 연결됨' : 'RP2040 연결 대기'}</p>
            <div className="cft-feeder-stats"><div><span>급여 횟수</span><strong>{feederStatus?.feed_count ?? 0} / 2</strong></div><div><span>현재 위치</span><strong>{feederStatus?.angle ?? 0}°</strong></div></div>
            <div className={`cft-feeder-message ${(feederStatus?.locked || (feederStatus?.feed_count ?? 0) >= 2) ? 'is-warning' : ''}`}>{feederStatus?.last_command_status === 'queued' ? '급여 명령 전송 대기 중...' : (feederStatus?.locked || (feederStatus?.feed_count ?? 0) >= 2) ? '오늘 2회 급여를 완료했어요. 다시 사용하려면 초기화해주세요.' : '물고기에게 먹이를 줄 수 있어요.'}</div>
            {formatLastFeedTime(feederStatus?.last_feed_at) && <p className="cft-caption cft-feeder-last-feed">마지막 급여: {formatLastFeedTime(feederStatus?.last_feed_at)}</p>}
            {(!online || !feederAvailable) && <p className="cft-caption">서버 연결과 급식기 상태를 확인한 후 조작할 수 있어요.</p>}
            {feederError && <p className="cft-error" role="alert">{feederError}</p>}
            <div className="cft-feeder-actions"><button className="cft-button is-primary" onClick={() => requestFeederCommand('feed')} disabled={!online || !feederAvailable || !feederStatus?.online || feederRequesting || feederStatus?.locked || (feederStatus?.feed_count ?? 0) >= 2 || feederStatus?.last_command_status === 'queued'}>밥 주기</button><button className="cft-button" onClick={() => requestFeederCommand('reset')} disabled={!online || !feederAvailable || !feederStatus?.online || feederRequesting || feederStatus?.last_command_status === 'queued'}>초기화</button></div>
          </section>);
  const calendarPanel = (<div className="cft-calendar-panel"><FeedingCalendar key={currentUser?.id} apiBase={API_BASE} lastFeedAt={feederStatus?.last_feed_at ?? null} /></div>);
  const alertsPanel = (<section className="cft-panel cft-recent-alerts"><div className="cft-panel-heading"><h2>최근 알림</h2><Link to="/records" state={{ tab: '알림' }} className="cft-text-link">전체 보기</Link></div>
            {alerts.length ? alerts.slice(0, 2).map(alert => <div className="cft-alert-row" key={alert.id}><span className="cft-alert-icon"><Icon name="bell" /></span><div><strong>{alert.title}</strong><p>{alert.detail}</p><time>{alert.time}</time></div></div>) : <div className="cft-empty">새로운 알림이 없습니다.</div>}
          </section>);

  if (isMobile) return (
    <div className="cft-mobile-dashboard">
      <PageHeading title="내 어항 대시보드" description={tankName} />
      {controlNotice && <div className="cft-notice" role="status">{controlNotice}</div>}
      {twinPanel}
      {feederPanel}
      {statsPanel}
      {calendarPanel}
    </div>
  );

  return (
    <div className="cft-dashboard-page">
      <PageHeading title="내 어항 대시보드" description="물고기와 어항의 상태를 한눈에 확인하세요." />
      {controlNotice && <div className="cft-notice" role="status">{controlNotice}</div>}
      <div className="cft-dashboard-grid">
        <div className="cft-dashboard-main">{twinPanel}{statsPanel}</div>
        <div className="cft-dashboard-sidebar">{feederPanel}{calendarPanel}{alertsPanel}</div>
      </div>
    </div>
  );
};
export default Dashboard;
