// src/components/Fish.tsx
import React from 'react';

interface FishProps {
  x: number;
  y: number;
  direction: string; 
}

const directionFileMap: Record<string, string> = {
  'E_right': 'E_right.png', 'SE_down_right': 'SE_down_right.png', 
  'S_down': 'S_down.png', 'SW_down_left': 'SW_down_left.png',
  'W_left': 'W_left.png', 'NW_up_left': 'NW_up_left.png', 
  'N_up': 'N_up.png', 'NE_up_right': 'NE_up_right.png'
};

const Fish: React.FC<FishProps> = ({ x, y, direction }) => {
  const fileName = directionFileMap[direction] || 'E_right.png';

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
    </>
  );
};

export default Fish;