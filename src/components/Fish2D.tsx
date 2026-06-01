import React from 'react';

export function Fish2D({ 
  center_norm = [0.5, 0.5], 
  move_direction = 'none', 
  pose_direction = 'none', 
  abnormal = false 
}: any) {
  
  // 데이터가 없을 때를 대비한 안전장치
  const safeNorm = (Array.isArray(center_norm) && center_norm.length >= 2) ? center_norm : [0.5, 0.5];

  // 좌표(0~1)를 화면의 퍼센트(%) 비율로 변환
  const leftPosition = `${safeNorm[0] * 100}%`;
  const topPosition = `${safeNorm[1] * 100}%`;

  let imageName = 'fish_left.png'; // 기본 이미지
  const dir = String(pose_direction !== 'none' ? pose_direction : move_direction).toLowerCase();

  // 방향에 맞춰 이미지 이름 변경
  if (dir.includes('left') && dir.includes('up')) imageName = 'fish_left_up.png';
  else if (dir.includes('left') && dir.includes('down')) imageName = 'fish_left_down.png';
  else if (dir.includes('right') && dir.includes('up')) imageName = 'fish_right_up.png';
  else if (dir.includes('right') && dir.includes('down')) imageName = 'fish_right_down.png';
  else if (dir.includes('left')) imageName = 'fish_left.png';
  else if (dir.includes('right')) imageName = 'fish_right.png';
  else if (dir.includes('up')) imageName = 'fish_up.png';
  else if (dir.includes('down')) imageName = 'fish_down.png';

  return (
    <div
      style={{
        position: 'absolute',
        left: leftPosition,
        top: topPosition,
        transform: 'translate(-50%, -50%)', 
        transition: 'left 0.2s ease-out, top 0.2s ease-out', // 부드럽게 미끄러지는 효과
        zIndex: 10,
      }}
    >
      <img
        src={`/fish_sprites/${imageName}`} 
        alt="Fish"
        style={{
          width: '120px', // 💡 물고기 크기 조절 원하시면 이 숫자를 바꾸세요
          height: 'auto',
          // 이상 감지 시 물고기 주변에 빨간색 경고 오라(Aura) 발생
          filter: abnormal ? 'drop-shadow(0 0 15px red) sepia(1) hue-rotate(-50deg) saturate(3)' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
          transition: 'filter 0.3s ease',
        }}
      />
    </div>
  );
}