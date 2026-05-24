import React, { useState, useEffect } from 'react';
import Fish from './Fish';

interface FishData {
  id: number;
  angle: number;
  x: number; // %
  y: number; // %
}

// 🌿 자연스러운 관절 수초 컴포넌트
interface SeaweedProps { count: number; max: number; color: string; delay: number; size: number; }
const SeaweedPiece: React.FC<SeaweedProps> = ({ count, max, color, delay, size }) => {
  if (count === 0) return null;
  const isBase = count === max;
  const width = 6 + count * 1.5; 
  const height = 18 * size;
  return (
    <div style={{
      width: `${width}px`, height: `${height}px`, backgroundColor: color, borderRadius: '20px', 
      transformOrigin: 'bottom center', animation: 'seaweedWave 2.5s infinite ease-in-out alternate',
      animationDelay: `${delay - (max - count) * 0.25}s`, position: isBase ? 'relative' : 'absolute',
      bottom: isBase ? '0' : `${height - 4}px`, left: isBase ? 'auto' : '50%',
      marginLeft: isBase ? '0' : `-${width / 2}px`, opacity: 0.9,
    }}>
      <SeaweedPiece count={count - 1} max={max} color={color} delay={delay} size={size} />
    </div>
  );
};

const Seaweed: React.FC<{ segments?: number, color?: string, delay?: number, size?: number }> = ({ segments = 6, color = '#10b981', delay = 0, size = 1 }) => (
  <div style={{ zIndex: 1 }}><SeaweedPiece count={segments} max={segments} color={color} delay={delay} size={size} /></div>
);

// 🏺 어항 배경 장식 컴포넌트 (토분 + 수초)
const Decorations = () => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
    <style>{`@keyframes seaweedWave { 0% { transform: rotate(-4deg); } 100% { transform: rotate(4deg); } }`}</style>
    
    {/* 토분 은신처 */}
    <div style={{
      position: 'absolute', bottom: '5%', right: '15%', width: '140px', height: '100px',
      backgroundColor: '#b45309', borderRadius: '50% 50% 15% 15% / 70% 70% 15% 15%',
      boxShadow: 'inset -15px -10px 25px rgba(0,0,0,0.4), 10px 10px 15px rgba(0,0,0,0.1)',
    }}>
      <div style={{
        position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)',
        width: '60px', height: '70px', backgroundColor: '#0f172a', borderRadius: '50% 50% 0 0',
        boxShadow: 'inset 0 10px 15px rgba(0,0,0,0.8)',
      }} />
    </div>

    {/* 수초 군락 */}
    <div style={{ position: 'absolute', bottom: '0', left: '8%', display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
      <Seaweed segments={8} color="#34d399" delay={0} size={1.2} />
      <Seaweed segments={6} color="#10b981" delay={-0.6} size={1} />
      <Seaweed segments={7} color="#059669" delay={-1.2} size={1.1} />
    </div>

    <div style={{ position: 'absolute', bottom: '0', right: '40%', display: 'flex', gap: '4px', alignItems: 'flex-end' }}>
      <Seaweed segments={5} color="#10b981" delay={-0.4} size={0.9} />
      <Seaweed segments={6} color="#059669" delay={-0.9} size={1} />
    </div>
  </div>
);

export default function Aquarium() {
  const [fishes, setFishes] = useState<FishData[]>([
    { id: 1, x: 50, y: 50, angle: 0 },
  ]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setFishes((prevFishes) => prevFishes.map(fish => {
        const speed = 3 + Math.random() * 2; 
        
        // 💡 변수명 targetAngle로 통일하여 에러 해결
        let targetAngle = fish.angle + (Math.random() - 0.5) * 60;
        
        const margin = 20;
        let bounced = false;
        let reflectedAngle = targetAngle;

        // 가상 이동 위치 계산
        let nextX = fish.x + Math.cos(targetAngle * (Math.PI / 180)) * speed;
        let nextY = fish.y + Math.sin(targetAngle * (Math.PI / 180)) * speed;

        // 벽 충돌 반사각 연산
        if (nextX < margin || nextX > 100 - margin) {
          reflectedAngle = 180 - targetAngle;
          bounced = true;
        }
        if (nextY < margin || nextY > 100 - margin) {
          reflectedAngle = 360 - reflectedAngle;
          bounced = true;
        }

        // 최단 경로 회전 보정
        if (bounced) {
          let delta = (reflectedAngle - fish.angle) % 360;
          if (delta > 180) delta -= 360;
          else if (delta < -180) delta += 360;
          targetAngle = fish.angle + delta;

          nextX = fish.x + Math.cos(targetAngle * (Math.PI / 180)) * speed;
          nextY = fish.y + Math.sin(targetAngle * (Math.PI / 180)) * speed;
        }

        nextX = Math.max(10, Math.min(nextX, 90));
        nextY = Math.max(10, Math.min(nextY, 90));

        return {
          ...fish,
          x: nextX,
          y: nextY,
          angle: targetAngle
        };
      }));
    }, 1000); 

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#e0f7fa', position: 'relative', overflow: 'hidden' }}>
      <Decorations />
      {fishes.map((fish) => (
        <Fish key={fish.id} x={fish.x} y={fish.y} angle={fish.angle} />
      ))}
    </div>
  );
}