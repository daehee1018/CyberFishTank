import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useAppContext } from '../../context/AppContext';
import FishSettings from '../../components/FishSettings';
import { Fish3D } from '../../components/Fish3D';

const Dashboard: React.FC = () => {
  const { isLiveMode, setIsLiveMode } = useAppContext();
  
  // 💡 1. YOLO 데이터 구조에 맞게 상태 초기값 변경
  const [fishData, setFishData] = useState({
    center_norm: [0.5, 0.5],
    move_direction: 'none',
    pose_direction: 'none',
    abnormal: false
  });

  // 2. 컴포넌트가 나타나면 바로 웹소켓 연결
  useEffect(() => {
    const socket = new WebSocket('wss://ggnu.site/ws/');
    
    socket.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        
        console.log("받은 데이터:", parsedData)
        
        setFishData(parsedData); // 서버에서 받은 데이터로 상태 업데이트
      } catch (e) {
        console.error("데이터 파싱 에러:", e);
      }
    };

    return () => socket.close(); // 화면에서 사라지면 연결 종료
  }, []);

  const quickControls = [
    { label: '급여', sub: '마지막 급여 2시간 전' },
    { label: '조명 조절', sub: '현재 밝기 70%' },
  ];

  const bottomStats = [
    { label: '수온', value: '25.4°C', status: '정상' },
    { label: 'pH', value: '6.8', status: '주의' },
    { label: '수위', value: '82%', status: '정상' },
    { label: '조도', value: '420 lx', status: '정상' },
  ];

  const statusClasses: Record<string, string> = {
    정상: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    주의: 'bg-amber-50 text-amber-700 border-amber-200',
    위험: 'bg-rose-50 text-rose-700 border-rose-200',
    정보: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-4">
            {quickControls.map((item) => (
              <button key={item.label} className="w-full rounded-[14px] border border-slate-200 bg-white px-4 py-5 text-center transition hover:border-slate-300 hover:bg-slate-50">
                <div className="text-lg font-semibold text-slate-900">{item.label}</div>
                <div className="mt-1 text-xs text-slate-500">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-4">
        {!isLiveMode && (
          <div className="transition-all duration-300 animate-fadeIn">
            <FishSettings />
          </div>
        )}

        <div className="relative overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">실시간 디지털 트윈</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">
                {isLiveMode ? '실시간 하드웨어 피드 스트리밍' : '지능형 개체 미러링 화면'}
              </div>
            </div>
            <button
              onClick={() => setIsLiveMode(!isLiveMode)}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {isLiveMode ? 'Digital Twin' : 'Live Render'}
            </button>
          </div>

          <div className="relative h-[510px] overflow-hidden rounded-[18px] border border-slate-200 bg-slate-950">
            {isLiveMode ? (
              <img src="http://192.168.31.151:5000/video_feed" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 z-0">
                <Canvas camera={{ position: [0, 0, 15], fov: 45 }} style={{ background: '#0f172a' }}>
                  <ambientLight intensity={0.8} />
                  <directionalLight position={[5, 5, 5]} intensity={1} />
                  {/* 💡 3. x, y 각각 넘기던 것을 fishData 통째로 넘기도록 변경 */}
                  <Fish3D {...fishData} />
                  <OrbitControls makeDefault enableZoom={false} />
                </Canvas>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {bottomStats.map((item) => (
            <div key={item.label} className="rounded-[18px] border border-slate-200 bg-white px-5 py-4 text-center text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="text-sm font-medium text-slate-500">{item.label}</div>
              <div className="mt-2 text-2xl font-bold tracking-tight">{item.value}</div>
              <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClasses[item.status] || ''}`}>{item.status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;