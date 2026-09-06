import { useEffect, useMemo, useState } from 'react';

type Fish2DProps = {
  center_norm?: number[];
  move_direction?: string;
  pose_direction?: string;

  // YOLO keypoints
  head?: number[];
  tail?: number[];

  abnormal?: boolean;
};

export function Fish2D({
  center_norm = [0.5, 0.5],
  move_direction = 'none',
  pose_direction = 'none',
  head,
  tail,
  abnormal = false,
}: Fish2DProps) {

  console.log(
  '[Fish2D 위치]',
  center_norm,
  '방향:',
  pose_direction,
  '이동:',
  move_direction
);

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
  // 기존 방향 결정
  //
  // head / tail 계산이 불가능할 경우 기존 YOLO 방향 사용
  // ============================================================

  const dir = String(
    pose_direction !== 'none'
      ? pose_direction
      : move_direction
  ).toLowerCase();

  // ============================================================
  // 36방향 계산
  //
  // YOLO:
  // head = 물고기 머리
  // tail = 물고기 꼬리
  //
  // tail → head 방향을 물고기의 실제 방향으로 사용
  //
  // 0도   = 오른쪽
  // 90도  = 아래
  // 180도 = 왼쪽
  // 270도 = 위
  //
  // 화면 좌표계(Y가 아래로 증가)를 기준으로 계산
  // ============================================================

  const directionAngle = useMemo(() => {

    if (
      !Array.isArray(head) ||
      !Array.isArray(tail) ||
      head.length < 2 ||
      tail.length < 2
    ) {
      return null;
    }

    const headX = Number(head[0]);
    const headY = Number(head[1]);

    const tailX = Number(tail[0]);
    const tailY = Number(tail[1]);

    if (
      !Number.isFinite(headX) ||
      !Number.isFinite(headY) ||
      !Number.isFinite(tailX) ||
      !Number.isFinite(tailY)
    ) {
      return null;
    }

    // 꼬리 → 머리
    const dx = headX - tailX;
    const dy = headY - tailY;

    const distance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );

    // 두 점이 너무 가까우면 방향 계산하지 않음
    if (distance < 1) {
      return null;
    }

    // 화면 좌표 기준 각도
    let angle =
      Math.atan2(dy, dx) *
      (180 / Math.PI);

    if (angle < 0) {
      angle += 360; 
    }

    // fish_right.png의 기본 방향을 기준으로 보정
    angle += 0;

    if (angle >= 360) {
      angle -= 360;
    }

    // ==========================================================
    // 36방향
    //
    // 360 / 36 = 10도
    //
    // 가장 가까운 10도 단위로 반올림
    // ==========================================================

    let quantizedAngle =
      Math.round(angle / 10) * 10;

    if (quantizedAngle >= 360) {
      quantizedAngle = 0;
    }

    return quantizedAngle;

  }, [head, tail]);

  console.log(
  '[Fish2D 방향 계산]',
  'head:', head,
  'tail:', tail,
  'angle:', directionAngle
  );

  // ============================================================
  // 방향 → 기존 이미지 파일
  //
  // head/tail이 없을 때 사용하는 기존 로직
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

  // ============================================================
  // 이미지 선택
  //
  // head/tail이 정상적으로 들어오면
  // 항상 fish_right.png를 기준으로 회전
  //
  // head/tail이 없으면 기존 8방향 이미지 사용
  // ============================================================

  const imageName =
    directionAngle !== null
      ? 'fish_right.png'
      : getImageName(dir);

  // ============================================================
  // 36방향 표시 보정
  //
  // fish_right.png는 기본적으로 오른쪽을 보고 있음.
  //
  // 90° ~ 270° 구간에서는 물고기를 180° 돌리는 대신
  // 좌우 반전(scaleX(-1)) + 회전으로 표현한다.
  //
  // 이렇게 하면 물고기의 배가 위로 뒤집히지 않는다.
  // ============================================================

  const displayDirection =
    directionAngle !== null
      ? (() => {
          let rotation = directionAngle;
          let flipX = false;

          // 왼쪽 방향 영역
          if (
            directionAngle > 90 &&
            directionAngle <= 270
          ) {
            rotation = directionAngle - 180;
            flipX = true;
          }

          // 270° ~ 360° → -90° ~ 0°
          else if (directionAngle > 270) {
            rotation = directionAngle - 360;
          }

          return {
            rotation,
            flipX,
          };
        })()
      : null;

  // ============================================================
  // 이미지 URL
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
        transform: 'translate(-50%, -50%)',
        transition:
          'left 0.2s ease-out, top 0.2s ease-out',
        zIndex: 10,
      }}
    >
      <div
        style={{
          transform:
            displayDirection !== null
              ? `rotate(${displayDirection.rotation}deg)`
              : 'none',
          transition:
            'transform 0.15s linear',
        }}
      >
        <img
          src={imageSrc}
          alt="Fish"
          style={{
            width: '120px',
            height: 'auto',
            objectFit: 'contain',

            transform:
              displayDirection?.flipX
                ? 'scaleX(-1)'
                : 'none',

            filter: abnormal
              ? 'drop-shadow(0 0 15px red) sepia(1) hue-rotate(-50deg) saturate(3)'
              : 'drop-shadow(0 4px 6px rgba(15,23,42,0.3))',
          }}
        />
      </div>
    </div>
  );
}