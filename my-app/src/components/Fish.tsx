import React from 'react';

interface FishProps {
  id?: number;
  x: number; // %
  y: number; // %
  angle: number;
}

const Fish: React.FC<FishProps> = ({ x, y, angle }) => {
  // 0~360도 범위로 깔끔하게 정규화
  const normalizedAngle = ((angle % 360) + 360) % 360;
  // 물고기가 왼쪽(90도~270도 사이)을 향하고 있는지 판별
  const isGoingLeft = normalizedAngle > 90 && normalizedAngle < 270;

  // 💡 왼쪽 영역일 때는 기본 각도 축에서 180도를 빼주어야 머리 방향 타겟과 렌더링 축이 일치합니다.
  const renderAngle = isGoingLeft ? angle - 180 : angle;

  return (
    <>
      <style>
        {`
          @keyframes gentleSwim {
            0% { transform: scale(1); }
            50% { transform: scaleX(0.98) scaleY(1.02); }
            100% { transform: scale(1); }
          }
        `}
      </style>

      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          // 보정된 렌더링 각도로 회전
          transform: `translate(-50%, -50%) rotate(${renderAngle}deg)`,
          
          // 💡 해결 핵심: 팽이처럼 빙빙 도는 버그의 주범이었던 'transform 1s linear'를 제거했습니다!
          // 이제 위치 이동(left, top)만 1초 동안 부드럽게 이어지고, 90도가 넘어가서 방향이 바뀔 때는 
          // 빙글빙글 도는 애니메이션 없이 그 자리에서 즉시 깔끔하게 전환됩니다.
          transition: 'left 1s linear, top 1s linear',
          zIndex: 10,
        }}
      >
        <img
          // 왼쪽으로 갈 때는 반전 이미지를 띄워 후진을 원천 차단
          src={isGoingLeft ? "/beta-fish-flipped.png" : "/beta-fish.png"}
          alt="Beta Fish"
          style={{
            width: '220px',
            height: 'auto',
            display: 'block',
            animation: 'gentleSwim 1.6s infinite ease-in-out',
          }}
        />
      </div>
    </>
  );
};

export default Fish;