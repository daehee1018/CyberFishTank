import { useRef } from 'react';

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

  const dir = String(pose_direction !== 'none' ? pose_direction : move_direction).toLowerCase();

  const getAngleFromDirection = (direction: string): number => {
    if (!direction || direction === 'none') return 0;
    if ((direction.includes('right') && direction.includes('up')) || direction.includes('up_right')) return 45;
    if ((direction.includes('right') && direction.includes('down')) || direction.includes('down_right')) return 315;
    if ((direction.includes('left') && direction.includes('up')) || direction.includes('up_left')) return 135;
    if ((direction.includes('left') && direction.includes('down')) || direction.includes('down_left')) return 225;
    if (direction.includes('left')) return 180;
    if (direction.includes('right')) return 0;
    if (direction.includes('up')) return 90;
    if (direction.includes('down')) return 270;
    return 0;
  };

  const angle = getAngleFromDirection(dir);
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const flipVertically = normalizedAngle > 90 && normalizedAngle < 270;
  const baseRotation = flipVertically ? -angle : angle;
  const lastRotationRef = useRef<number | null>(null);
  const getNearestRotation = (target: number, previous: number) => {
    const choices = [target, target + 360, target - 360];
    return choices.reduce((best, candidate) =>
      Math.abs(candidate - previous) < Math.abs(best - previous) ? candidate : best,
    choices[0]);
  };

  const rotation = lastRotationRef.current === null
    ? baseRotation
    : getNearestRotation(baseRotation, lastRotationRef.current);

  lastRotationRef.current = rotation;
  const imageName = 'fish_right.png';

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
          objectFit: 'contain',
          transform: `rotate(${rotation}deg) scaleY(${flipVertically ? -1 : 1})`,
          transformOrigin: 'center center',
          transition: 'transform 0.2s ease-out, filter 0.3s ease',
          // 이상 감지 시 물고기 주변에 빨간색 경고 오라(Aura) 발생
          filter: abnormal ? 'drop-shadow(0 0 15px red) sepia(1) hue-rotate(-50deg) saturate(3)' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
        }}
      />
    </div>
  );
}