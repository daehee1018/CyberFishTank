// src/components/Fish.tsx
import { useRef } from 'react';
import type { FC } from 'react';

interface FishProps {
  x: number;
  y: number;
  angle: number;
}

const getNearestRotation = (target: number, previous: number) => {
  const choices = [target, target + 360, target - 360];
  return choices.reduce((best, candidate) =>
    Math.abs(candidate - previous) < Math.abs(best - previous) ? candidate : best,
  choices[0]);
};

const Fish: FC<FishProps> = ({ x, y, angle }) => {
  const lastRotationRef = useRef<number | null>(null);
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const flipVertically = normalizedAngle > 90 && normalizedAngle < 270;
  const baseRotation = flipVertically ? -angle : angle;
  const rotation = lastRotationRef.current === null
    ? baseRotation
    : getNearestRotation(baseRotation, lastRotationRef.current);

  lastRotationRef.current = rotation;
  const fileName = 'E_right.png';

  return (
    <>
      <style>
        {`
          @keyframes naturalSwim {
            0% { transform: scale(1) translateY(0); }
            25% { transform: scale(1.01, 0.99) translateY(-1px); }
            50% { transform: scale(1) translateY(0); }
            75% { transform: scale(0.99, 1.01) translateY(1px); }
            100% { transform: scale(1) translateY(0); }
          }
        `}
      </style>

      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          transition: 'left 2.1s linear, top 2.1s linear',
          zIndex: 10,
          /* 💡 박스 크기를 180x180으로 고정해서 회전 시 튀는 현상을 막습니다 */
          width: '180px',
          height: '180px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `rotate(${rotation}deg) scaleY(${flipVertically ? -1 : 1})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-out',
          }}
        >
          <img
            src={`/assets/fish/${fileName}`} 
            alt="Digital Twin Fish"
            style={{
              /* 💡 핵심: 이미지가 정사각형 박스 안을 벗어나지 않고 비율을 유지(contain)하도록 합니다. */
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              animation: 'naturalSwim 1.5s infinite ease-in-out',
            }}
            onError={(e) => {
              e.currentTarget.src = '/beta-fish.png';
            }}
          />
        </div>
      </div>
    </>
  );
};

export default Fish;