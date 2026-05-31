// src/components/Aquarium.tsx
import { useState, useEffect } from 'react';
import Fish from './Fish';

export default function Aquarium() {
  const [fish, setFish] = useState({ id: 1, x: 50, y: 50, direction: 'E_right' });

  useEffect(() => {
    let currentX = 50;
    let currentY = 50;
    let currentAngle = Math.random() * 360;

    const interval = setInterval(() => {
      // 부드러운 곡선 주행
      currentAngle += (Math.random() - 0.5) * 90;
      if (currentX < 20) currentAngle = 0;
      else if (currentX > 80) currentAngle = 180;
      if (currentY < 25) currentAngle = 90;
      else if (currentY > 75) currentAngle = 270;

      currentAngle = (currentAngle + 360) % 360;
      const speed = 12;
      const rad = currentAngle * (Math.PI / 180);
      const targetX = Math.max(10, Math.min(90, currentX + Math.cos(rad) * speed));
      const targetY = Math.max(20, Math.min(80, currentY + Math.sin(rad) * speed));

      const dx = targetX - currentX;
      const dy = targetY - currentY;
      let moveAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      moveAngle = (moveAngle + 360) % 360;
      
      const dirIndex = Math.round(moveAngle / 45) % 8;

      // 💡 [핵심 해결 스위치] 원본 사진이 오른쪽을 보고 있었다면 true, 왼쪽이었다면 false로 하세요!
      const isOriginalFacingRight = true; 

      let nextDir = '';
      if (isOriginalFacingRight) {
        // 원본이 오른쪽을 볼 때, 꼬여버린 파이썬 파일명들을 이동 방향에 맞게 완벽히 역이용하는 마법의 매핑
        const rightFacingMapping = [
          'W_left',        // 0도 (우측 이동) -> 실제 파일은 오른쪽을 봄
          'NW_up_left',    // 45도 (우하단 이동) -> 머리 숙이고 오른쪽 봄
          'N_up',          // 90도 (하단 이동)
          'NE_up_right',   // 135도 (좌하단 이동) -> 머리 숙이고 왼쪽 봄
          'E_right',       // 180도 (좌측 이동) -> 실제 파일은 왼쪽을 봄
          'SE_down_right', // 225도 (좌상단 이동) -> 머리 들고 왼쪽 봄
          'S_down',        // 270도 (상단 이동)
          'SW_down_left'   // 315도 (우상단 이동) -> 머리 들고 오른쪽 봄
        ];
        nextDir = rightFacingMapping[dirIndex];
      } else {
        // 원본이 왼쪽을 볼 때의 정석 매핑
        const leftFacingMapping = [
          'E_right', 'SE_down_right', 'S_down', 'SW_down_left', 
          'W_left', 'NW_up_left', 'N_up', 'NE_up_right'
        ];
        nextDir = leftFacingMapping[dirIndex];
      }

      currentX = targetX;
      currentY = targetY;
      setFish({ id: 1, x: currentX, y: currentY, direction: nextDir });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ 
      width: '100%', height: '100%', 
      background: 'linear-gradient(to bottom, #e0faff, #bae6fd)', 
      position: 'relative', overflow: 'hidden' 
    }}>
      
      <style>
        {`
          @keyframes swayA { 0% { transform: rotate(-2deg); } 100% { transform: rotate(3deg); } }
          @keyframes swayB { 0% { transform: rotate(-3deg); } 100% { transform: rotate(1deg); } }
          .seaweed-node { transform-origin: bottom center; border-radius: 20px; position: absolute; }
          .fish-cave { position: absolute; bottom: 0px; right: 10%; width: 180px; height: 110px; background: #78716c; border-radius: 90px 90px 10px 10px; box-shadow: inset -10px -10px 30px rgba(0,0,0,0.3), 5px 5px 15px rgba(0,0,0,0.1); }
          .cave-entrance { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 70px; height: 65px; background: #1c1917; border-radius: 40px 40px 0 0; box-shadow: inset 0 15px 15px rgba(0,0,0,0.8); }
          .cave-moss { position: absolute; top: 15px; left: 25px; width: 60px; height: 25px; background: #4ade80; border-radius: 50%; opacity: 0.7; filter: blur(2px); }
        `}
      </style>

      {/* 🪨 물고기 동굴 은신처 */}
      <div className="fish-cave">
        <div className="cave-moss" />
        <div className="cave-entrance" />
      </div>

      {/* 🌿 좌측 관절 수초 */}
      <div style={{ position: 'absolute', bottom: '-5px', left: '15%' }}>
        <div className="seaweed-node" style={{ width: '16px', height: '40px', background: '#16a34a', bottom: 0, animation: 'swayA 3s infinite alternate ease-in-out' }}>
          <div className="seaweed-node" style={{ width: '14px', height: '40px', background: '#22c55e', bottom: '35px', left: '1px', animation: 'swayB 2.8s infinite alternate ease-in-out' }}>
            <div className="seaweed-node" style={{ width: '12px', height: '40px', background: '#4ade80', bottom: '35px', left: '1px', animation: 'swayA 3.2s infinite alternate ease-in-out' }}>
              <div className="seaweed-node" style={{ width: '10px', height: '40px', background: '#22c55e', bottom: '35px', left: '1px', animation: 'swayB 2.9s infinite alternate ease-in-out' }}>
                <div className="seaweed-node" style={{ width: '8px', height: '35px', background: '#16a34a', bottom: '35px', left: '1px', animation: 'swayA 3.1s infinite alternate ease-in-out' }}>
                  <div className="seaweed-node" style={{ width: '6px', height: '30px', background: '#4ade80', bottom: '30px', left: '1px', animation: 'swayB 2.7s infinite alternate ease-in-out' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🌿 중앙 관절 수초 */}
      <div style={{ position: 'absolute', bottom: '-5px', left: '35%' }}>
        <div className="seaweed-node" style={{ width: '15px', height: '45px', background: '#15803d', bottom: 0, animation: 'swayB 3.5s infinite alternate-reverse ease-in-out' }}>
          <div className="seaweed-node" style={{ width: '13px', height: '45px', background: '#16a34a', bottom: '40px', left: '1px', animation: 'swayA 3.3s infinite alternate-reverse ease-in-out' }}>
            <div className="seaweed-node" style={{ width: '11px', height: '40px', background: '#22c55e', bottom: '40px', left: '1px', animation: 'swayB 3.1s infinite alternate-reverse ease-in-out' }}>
              <div className="seaweed-node" style={{ width: '9px', height: '35px', background: '#4ade80', bottom: '35px', left: '1px', animation: 'swayA 3.4s infinite alternate-reverse ease-in-out' }}>
                <div className="seaweed-node" style={{ width: '7px', height: '35px', background: '#22c55e', bottom: '30px', left: '1px', animation: 'swayB 3.2s infinite alternate-reverse ease-in-out' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Fish x={fish.x} y={fish.y} direction={fish.direction} />
      
    </div>
  );
}