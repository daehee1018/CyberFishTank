import React, { useState, useEffect } from 'react';
import Fish from './Fish';

export default function Aquarium({ children, showFish = true }: { children?: React.ReactNode; showFish?: boolean }) {
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

      // 💡 [핵심 해결 스위치] 원본 사진이 오른쪽을 보고 있었다면 true, 왼쪽이었다면 false
      const isOriginalFacingRight = true; 

      let nextDir = '';
      if (isOriginalFacingRight) {
        const rightFacingMapping = [
          'W_left', 'NW_up_left', 'N_up', 'NE_up_right', 
          'E_right', 'SE_down_right', 'S_down', 'SW_down_left' 
        ];
        nextDir = rightFacingMapping[dirIndex];
      } else {
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
      // 🌊 1. 물 속 깊이감을 주는 입체적인 그라데이션 배경
      background: 'linear-gradient(to bottom, #38bdf8 0%, #0369a1 60%, #082f49 100%)', 
      position: 'relative', overflow: 'hidden',
      boxShadow: 'inset 0 0 50px rgba(0,0,0,0.4)', // 어항 모서리 음영 처리
    }}>
      
      <style>
        {`
          /* 기존 수초 애니메이션 */
          @keyframes swayA { 0% { transform: rotate(-2deg); } 100% { transform: rotate(3deg); } }
          @keyframes swayB { 0% { transform: rotate(-3deg); } 100% { transform: rotate(1deg); } }
          
          /* 🫧 2. 공기방울 상승 애니메이션 */
          @keyframes bubbleRise {
            0% { bottom: 10%; transform: translateX(0) scale(0.8); opacity: 0; }
            20% { opacity: 0.8; }
            100% { bottom: 100%; transform: translateX(-20px) scale(1.5); opacity: 0; }
          }
          
          /* ✨ 3. 수면 빛 내림 애니메이션 */
          @keyframes lightRays {
            0% { opacity: 0.3; transform: translateX(-2%) scale(1.05); }
            100% { opacity: 0.6; transform: translateX(2%) scale(1.05); }
          }

          /* 오브젝트 스타일 (바닥 높이에 맞게 위치 상향 조정) */
          .seaweed-node { transform-origin: bottom center; border-radius: 20px; position: absolute; }
          .fish-cave { position: absolute; bottom: 12%; right: 10%; width: 180px; height: 110px; background: #57534e; border-radius: 90px 90px 10px 10px; box-shadow: inset -15px -15px 30px rgba(0,0,0,0.6), 5px 10px 20px rgba(0,0,0,0.4); z-index: 2; }
          .cave-entrance { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 70px; height: 65px; background: #1c1917; border-radius: 40px 40px 0 0; box-shadow: inset 0 15px 15px rgba(0,0,0,0.8); }
          .cave-moss { position: absolute; top: 15px; left: 25px; width: 60px; height: 25px; background: #15803d; border-radius: 50%; opacity: 0.8; filter: blur(3px); }
          
          /* 공기방울 기본 디자인 */
          .bubble { position: absolute; background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.1)); border: 1px solid rgba(255,255,255,0.4); border-radius: 50%; z-index: 3; }
        `}
      </style>

      {/* ✨ 수면에서 떨어지는 빛 내림 (Sun rays) 효과 */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-10%', width: '120%', height: '80%',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 60%)',
        animation: 'lightRays 6s infinite alternate ease-in-out',
        pointerEvents: 'none', zIndex: 1
      }} />

      {/* 🏖️ 어항 바닥 모래/자갈 (Sand) */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, width: '100%', height: '15%',
        background: 'linear-gradient(to bottom, #d6d3d1 0%, #a8a29e 100%)',
        borderTop: '4px solid rgba(0,0,0,0.1)',
        boxShadow: '0 -10px 30px rgba(0,0,0,0.4)', // 바닥과 물의 경계선 그림자
        zIndex: 1
      }} />

      {/* 🫧 공기방울 생성 (산소발생기 느낌) */}
      <div className="bubble" style={{ left: '22%', width: '14px', height: '14px', animation: 'bubbleRise 4s infinite linear' }} />
      <div className="bubble" style={{ left: '26%', width: '8px', height: '8px', animation: 'bubbleRise 3s infinite linear 1s' }} />
      <div className="bubble" style={{ left: '85%', width: '16px', height: '16px', animation: 'bubbleRise 5s infinite linear 2s' }} />
      <div className="bubble" style={{ left: '82%', width: '10px', height: '10px', animation: 'bubbleRise 3.5s infinite linear 0.5s' }} />

      {/* 🪨 물고기 동굴 은신처 */}
      <div className="fish-cave">
        <div className="cave-moss" />
        <div className="cave-entrance" />
      </div>

      {/* 🌿 좌측 관절 수초 */}
      <div style={{ position: 'absolute', bottom: '12%', left: '15%', zIndex: 2 }}>
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
      <div style={{ position: 'absolute', bottom: '12%', left: '40%', zIndex: 2 }}>
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

      {/* 🐟 물고기 렌더링 (Z-index를 높여서 수초 앞/뒤로 자연스럽게 배치) */}
      <div style={{ zIndex: 5, position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
        {children ? children : (showFish && <Fish x={fish.x} y={fish.y} direction={fish.direction} />)}
      </div>
      
    </div>
  );
}