import React from 'react';
import { useAppContext } from '../../context/AppContext';
import FishSettings from '../../components/FishSettings';
import { Fish2D } from '../../components/Fish2D';
import Aquarium from '../../components/Aquarium';

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
  } = useAppContext();

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

  // ====================================================
  // 하단 상태
  //
  // 현재는 기존 디자인 유지
  //
  // 이후 sensorData를 연결해서
  // 실제 센서값으로 변경 가능
  // ====================================================

  const bottomStats = [
    {
      label: '수온',
      value: '25.4°C',
      status: '정상',
    },
    {
      label: 'pH',
      value: '6.8',
      status: '주의',
    },
    {
      label: '수위',
      value: '82%',
      status: '정상',
    },
    {
      label: '조도',
      value: '420 lx',
      status: '정상',
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

    주의:
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

    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">

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

        {/* =================================================
            물고기 설정
            ================================================= */}

        {!isLiveMode && (

          <div className="transition-all duration-300 animate-fadeIn">

            <FishSettings />

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
                  isLiveMode
                    ? '실시간 하드웨어 피드 스트리밍'
                    : '지능형 개체 미러링 화면'
                }

              </div>

            </div>


            {/* -------------------------------------------
                Live Render / Digital Twin 버튼
                ------------------------------------------- */}

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

          </div>


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

            {isLiveMode ? (

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

                <Aquarium showFish={false}>

                  <Fish2D
                    {...fishData}
                  />

                </Aquarium>

              </div>

            )}

          </div>

        </div>


        {/* =================================================
            하단 센서 상태
            ================================================= */}

        <div className="grid grid-cols-4 gap-4">

          {bottomStats.map(
            (item) => (

              <div
                key={item.label}
                className="
                  rounded-[18px]
                  border
                  border-slate-200
                  bg-white
                  px-5
                  py-4
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