import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Fish2D } from '../../components/Fish2D';
import Aquarium from '../../components/Aquarium';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://ggnu.site';

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

  const {
    isLiveMode,
    setIsLiveMode,
    fishData,
    aquariumDecorations,
    displaySensorData,
    controlNotice,
  } = useAppContext();

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

  // ====================================================
  // 빠른 제어
  // ====================================================

  const quickControls = [
    {
      label: '급여',
      sub: '마지막 급여 2시간 전',
    },
    {
      label: '조명 조절',
      sub: '현재 밝기 70%',
    },
  ];

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
      : temperature >= 24 &&
          temperature <= 26
        ? '정상'
        : '주의';

  const phStatus =
    ph === undefined
      ? '정보'
      : ph >= 6 && ph <= 7
        ? '정상'
        : '주의';

  const waterLevelStatus =
    waterLevel === undefined
      ? '정보'
      : waterLevel >= 50
        ? '적정'
        : '낮음';

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
      label: '조도',
      value: '데이터 없음',
      status: '정보',
    },
  ];

  // ====================================================
  // 상태 색상
  // ====================================================

  const statusClasses: Record<
    string,
    string
  > = {

    정상:
      'bg-emerald-50 text-emerald-700 border-emerald-200',

    적정:
      'bg-emerald-50 text-emerald-700 border-emerald-200',

    주의:
      'bg-amber-50 text-amber-700 border-amber-200',

    낮음:
      'bg-amber-50 text-amber-700 border-amber-200',

    위험:
      'bg-rose-50 text-rose-700 border-rose-200',

    정보:
      'bg-sky-50 text-sky-700 border-sky-200',
  };

  // ====================================================
  // 화면
  // ====================================================

  return (

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">

      {/* ==================================================
          왼쪽 빠른 제어
          ================================================== */}

      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">

        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">

          <div className="space-y-4">

            {quickControls.map(
              (item) => (

                <button
                  key={item.label}
                  className="
                    w-full
                    rounded-[14px]
                    border
                    border-slate-200
                    bg-white
                    px-4
                    py-5
                    text-center
                    transition
                    hover:border-slate-300
                    hover:bg-slate-50
                  "
                >

                  <div className="text-lg font-semibold text-slate-900">
                    {item.label}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {item.sub}
                  </div>

                </button>

              )
            )}

          </div>

        </div>

      </aside>


      {/* ==================================================
          오른쪽 메인
          ================================================== */}

      <div className="space-y-4">

        {controlNotice && (
          <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {controlNotice}
          </div>
        )}

        {/* =================================================
            디지털 트윈
            ================================================= */}

        <div className="relative overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5">

          {/* ---------------------------------------------
              제목
              --------------------------------------------- */}

          <div className="mb-4 flex items-center justify-between">

            <div>

              <div className="text-sm text-slate-500">
                실시간 디지털 트윈
              </div>

              <div className="text-2xl font-semibold tracking-tight text-slate-900">

                {
                  useMyCamera
                    ? '내 카메라로 실시간 추적 중'
                    : isLiveMode
                    ? '실시간 하드웨어 피드 스트리밍'
                    : '지능형 개체 미러링 화면'
                }

              </div>

            </div>


            <div className="flex flex-wrap items-center gap-2">

              {!useMyCamera && (
                <button
                  onClick={() =>
                    setIsLiveMode(
                      !isLiveMode
                    )
                  }
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
                    transition
                    hover:bg-slate-100
                  "
                >

                  {
                    isLiveMode
                      ? 'Digital Twin'
                      : 'Live Render'
                  }

                </button>
              )}

              {!useMyCamera && availableCameras.length > 1 && (
                <select
                  value={selectedCameraId}
                  onChange={(event) => setSelectedCameraId(event.target.value)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                >
                  <option value="">기본 카메라</option>
                  {availableCameras.map((camera, index) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `카메라 ${index + 1}`}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={useMyCamera ? stopMyCamera : startMyCamera}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  useMyCamera
                    ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {useMyCamera ? '내 카메라 끄기' : '내 카메라 켜기'}
              </button>

            </div>

          </div>

          {myCameraError && (
            <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {myCameraError}
            </div>
          )}


          {/* =================================================
              어항 화면
              ================================================= */}

          <div className="
            relative
            h-[510px]
            overflow-hidden
            rounded-[18px]
            border
            border-slate-200
            bg-white
          ">

            {/* ---------------------------------------------
                실제 카메라 화면
                --------------------------------------------- */}

            {isLiveMode && !useMyCamera ? (

              <img
                src="http://192.168.31.151:5000/video_feed"
                className="
                  absolute
                  inset-0
                  h-full
                  w-full
                  object-cover
                "
                alt="실시간 어항 카메라"
              />

            ) : (

              /* -------------------------------------------
                 디지털 트윈
                 ------------------------------------------- */

              <div className="
                absolute
                inset-0
                z-0
              ">

                <Aquarium
                  showFish={false}
                  decorations={aquariumDecorations}
                >

                  <Fish2D
                    {...fishData}
                  />

                </Aquarium>

              </div>

            )}

            {useMyCamera && (
              <div className="absolute right-3 top-3 z-10 h-24 w-32 overflow-hidden rounded-[10px] border border-white/70 shadow-lg">
                <video ref={myVideoRef} className="h-full w-full object-cover" muted playsInline />
              </div>
            )}
            <canvas ref={myCaptureCanvasRef} className="hidden" />

          </div>

        </div>


        {/* =================================================
            하단 센서 상태
            ================================================= */}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">

          {bottomStats.map(
            (item) => (

              <div
                key={item.label}
                className="
                  rounded-[18px]
                  border
                  border-slate-200
                  bg-white
                  px-3
                  py-3
                  sm:px-5
                  sm:py-4
                  text-center
                  text-slate-900
                  shadow-[0_8px_24px_rgba(15,23,42,0.04)]
                "
              >

                <div className="
                  text-sm
                  font-medium
                  text-slate-500
                ">
                  {item.label}
                </div>


                <div className="
                  mt-2
                  text-2xl
                  font-bold
                  tracking-tight
                ">
                  {item.value}
                </div>


                <div
                  className={`
                    mt-3
                    inline-flex
                    rounded-full
                    border
                    px-3
                    py-1
                    text-xs
                    font-medium
                    ${statusClasses[item.status] || ''}
                  `}
                >

                  {item.status}

                </div>

              </div>

            )
          )}

        </div>

      </div>

    </div>
  );
};

export default Dashboard;