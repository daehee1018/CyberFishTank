import { useEffect, useState } from 'react';

type Fish2DProps = {
  center_norm?: number[];
  move_direction?: string;
  pose_direction?: string;
  abnormal?: boolean;
};

export function Fish2D({
  center_norm = [0.5, 0.5],
  move_direction = 'none',
  pose_direction = 'none',
  abnormal = false,
}: Fish2DProps) {

  // ============================================================
  // 선택된 물고기 이미지 갱신용
  // ============================================================

  const [spriteVersion, setSpriteVersion] = useState(
    Date.now()
  );

  // ============================================================
  // 물고기 스타일 변경 이벤트 감지
  // ============================================================

  useEffect(() => {

    const handleFishStyleChanged = () => {

      console.log(
        '[Fish2D] 새로운 물고기 스타일 적용'
      );

      // 이미지 URL을 강제로 변경해서
      // 브라우저가 새 이미지를 다시 요청하도록 함
      setSpriteVersion(Date.now());

    };

    window.addEventListener(
      'fish-style-changed',
      handleFishStyleChanged
    );

    return () => {
      window.removeEventListener(
        'fish-style-changed',
        handleFishStyleChanged
      );
    };

  }, []);

  // ============================================================
  // 위치 안전 처리
  // ============================================================

  const safeNorm =
    Array.isArray(center_norm) &&
    center_norm.length >= 2
      ? center_norm
      : [0.5, 0.5];

  const leftPosition =
    `${safeNorm[0] * 100}%`;

  const topPosition =
    `${safeNorm[1] * 100}%`;

  // ============================================================
  // 방향 결정
  // ============================================================

  const dir = String(
    pose_direction !== 'none'
      ? pose_direction
      : move_direction
  ).toLowerCase();

  // ============================================================
  // 방향 → 이미지 파일
  // ============================================================

  const getImageName = (
    direction: string
  ): string => {

    if (
      (direction.includes('right') &&
        direction.includes('up')) ||
      direction.includes('up_right')
    ) {
      return 'fish_right_up.png';
    }

    if (
      (direction.includes('right') &&
        direction.includes('down')) ||
      direction.includes('down_right')
    ) {
      return 'fish_right_down.png';
    }

    if (
      (direction.includes('left') &&
        direction.includes('up')) ||
      direction.includes('up_left')
    ) {
      return 'fish_left_up.png';
    }

    if (
      (direction.includes('left') &&
        direction.includes('down')) ||
      direction.includes('down_left')
    ) {
      return 'fish_left_down.png';
    }

    if (direction.includes('left')) {
      return 'fish_left.png';
    }

    if (direction.includes('right')) {
      return 'fish_right.png';
    }

    if (direction.includes('up')) {
      return 'fish_up.png';
    }

    if (direction.includes('down')) {
      return 'fish_down.png';
    }

    return 'fish_right.png';
  };

  const imageName = getImageName(dir);

  // ============================================================
  // 이미지 URL
  //
  // spriteVersion을 붙여서
  // 선택한 물고기가 바뀌면 반드시 새 이미지 요청
  // ============================================================

  const imageSrc =
    `/fish_sprites/${imageName}?v=${spriteVersion}`;

  // ============================================================
  // 렌더링
  // ============================================================

  return (
    <div
      style={{
        position: 'absolute',
        left: leftPosition,
        top: topPosition,

        transform:
          'translate(-50%, -50%)',

        transition:
          'left 0.2s ease-out, top 0.2s ease-out',

        zIndex: 10,
      }}
    >

      <img
        src={imageSrc}
        alt="Fish"

        style={{
          width: '120px',
          height: 'auto',

          objectFit: 'contain',

          transition:
            'filter 0.3s ease',

          filter: abnormal
            ? 'drop-shadow(0 0 15px red) sepia(1) hue-rotate(-50deg) saturate(3)'
            : 'drop-shadow(0 4px 6px rgba(15,23,42,0.3))',
        }}

        onError={(e) => {
          console.error(
            '[Fish2D] 물고기 이미지 로딩 실패:',
            imageSrc
          );
        }}
      />

    </div>
  );
}