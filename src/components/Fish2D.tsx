import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';

// 가벼운 코스메틱 액세서리. 실제 이미지 대신 이모지로 표현해서
// 스프라이트가 뭐든(기본/AI 변환본) 항상 겹쳐 쓸 수 있게 한다.
//
// fish_right.png 실측 기준 눈은 (가로 70%, 세로 42%)에 있고,
// 정수리는 그보다 위쪽인 (가로 66%, 세로 24%) 부근이다. 얼굴에
// 쓰는 것(선글라스)과 머리 위에 얹는 것(모자류)은 앵커가 다르다.
export const ACCESSORY_STYLE: Record<
  string,
  { emoji: string; left: string; top: string; fontSize: string }
> = {
  hat: { emoji: '🎩', left: '66%', top: '22%', fontSize: '22px' },
  crown: { emoji: '👑', left: '66%', top: '20%', fontSize: '22px' },
  ribbon: { emoji: '🎀', left: '64%', top: '24%', fontSize: '18px' },
  sunglasses: { emoji: '🕶️', left: '70%', top: '42%', fontSize: '20px' },
  flower: { emoji: '🌸', left: '60%', top: '30%', fontSize: '18px' },
};

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

  const { currentUser, fishColorHue, fishAccessory } = useAppContext();

  const [spriteVersion, setSpriteVersion] = useState(
    Date.now()
  );

  // 계정별 생성 이미지가 없으면(아직 커스터마이징 안 함)
  // 기본 공용 이미지로 대체한다.
  const [useDefaultSprite, setUseDefaultSprite] = useState(false);

  useEffect(() => {
    setUseDefaultSprite(false);
  }, [currentUser?.id, spriteVersion]);

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

  // ============================================================
  // 상태 말풍선 (⚠️ 이상행동 / 😴 휴식 중)
  //
  // 둘 다 자체 발명 기준 대신, 이 프로젝트가 이미 검증해서 쓰고
  // 있는 기준을 그대로 재사용한다:
  //
  // 😴 휴식: calculate_activity.cjs의 일별 활동량 계산이 쓰는
  // MIN_DISTANCE=0.003(정규화 좌표, 1초 기준 이동거리)을 그대로
  // 가져온다 — 그 값보다 적게 움직이면 "활동량 계산에서도 노이즈
  // 취급해서 버리는 수준"이라는 뜻이다. 단, 그 순간 한 번만 보면
  // 물리 어항/개인 카메라의 전송 주기가 서로 달라 흔들릴 수 있어,
  // 초당 이동거리가 이 기준 밑으로 RESTING_SUSTAINED_MS(5초) 이상
  // 유지될 때만 휴식으로 판단한다. 업데이트 주기가 아니라 실제
  // 경과시간(ms)으로 재기 때문에 두 소스 모두에 안전하다.
  //
  // ⚠️ 이상행동: 서버의 알림 시스템(handleAbnormalBehaviorAlert)은
  // "flipped_pose가 3분 이상 지속"일 때만 DB에 알림을 남긴다.
  // 말풍선은 그보다 훨씬 가벼운 화면 표시라 3분까지 기다리면 너무
  // 둔감하지만, 그렇다고 원본 신호를 그대로 쓰면(노이즈 있음) 바로
  // 깜빡인다. 절충으로 "5초 이상 연속"을 최소 지속시간으로 둔다 —
  // DB 알림 기준(3분)과 다르니, 더 엄격하게 맞추고 싶으면 조정.
  // ============================================================

  const RESTING_MIN_DIST_PER_SEC = 0.003;
  const RESTING_SUSTAINED_MS = 5000;
  const ABNORMAL_SUSTAINED_MS = 5000;

  const lastSampleRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const restingSinceRef = useRef<number | null>(null);
  const abnormalSinceRef = useRef<number | null>(null);
  const [moodEmoji, setMoodEmoji] = useState<string | null>(null);

  useEffect(() => {
    const [x, y] = safeNorm;
    const now = Date.now();
    const prev = lastSampleRef.current;

    if (prev) {
      // 너무 짧은 간격은 아주 작은 픽셀 흔들림도 "빠른 속도"로
      // 부풀릴 수 있어 최소 0.5초로 묶어서 나눈다.
      const dtSec = Math.max((now - prev.t) / 1000, 0.5);
      const dist = Math.hypot(x - prev.x, y - prev.y);
      const distPerSec = dist / dtSec;

      if (distPerSec < RESTING_MIN_DIST_PER_SEC) {
        if (restingSinceRef.current === null) {
          restingSinceRef.current = now;
        }
      } else {
        restingSinceRef.current = null;
      }
    }

    lastSampleRef.current = { x, y, t: now };

    abnormalSinceRef.current = abnormal
      ? abnormalSinceRef.current ?? now
      : null;

    const isAbnormalSustained =
      abnormalSinceRef.current !== null &&
      now - abnormalSinceRef.current >= ABNORMAL_SUSTAINED_MS;

    const isResting =
      restingSinceRef.current !== null &&
      now - restingSinceRef.current >= RESTING_SUSTAINED_MS;

    if (isAbnormalSustained) {
      setMoodEmoji('⚠️');
    } else if (isResting) {
      setMoodEmoji('😴');
    } else {
      // 평상시(이상행동도 휴식도 아님) — 항상 뭔가 떠 있게 해서
      // "지금 판정 자체가 안 되고 있는 건지" 헷갈리지 않게 한다.
      setMoodEmoji('🙂');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeNorm[0], safeNorm[1], abnormal]);

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
    currentUser && !useDefaultSprite
      ? `/fish_sprites/${currentUser.id}/${imageName}?v=${spriteVersion}`
      : `/fish_sprites/${imageName}?v=${spriteVersion}`;

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
      {/* 상태 말풍선: 물고기 방향(회전/반전)과 무관하게 항상
          똑바로 떠 있어야 하므로 회전 래퍼 바깥에 둔다.
          물고기가 어항 위쪽 가장자리 근처에 있으면 말풍선을
          위로 붙이면 어항 박스 바깥으로 튀어나가 보이므로,
          그럴 땐 대신 아래쪽에 붙인다. */}
      {moodEmoji && (() => {
        const flipped = safeNorm[1] < 0.15; // 물고기가 위쪽이라 말풍선을 아래에 붙인 경우

        return (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: flipped ? '100%' : '-10px',
              marginTop: flipped ? '10px' : 0,
              transform: flipped
                ? 'translateX(-50%)'
                : 'translate(-50%, -100%)',
              zIndex: 11,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '26px',
                borderRadius: '10px',
                background: 'white',
                boxShadow: '0 2px 6px rgba(15,23,42,0.2)',
                fontSize: '15px',
              }}
            >
              {moodEmoji}
            </div>

            {/* 말풍선 꼬리: 물고기를 향해 뾰족하게 */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                ...(flipped
                  ? { top: '-5px', borderBottom: '6px solid white' }
                  : { bottom: '-5px', borderTop: '6px solid white' }),
              }}
            />
          </div>
        );
      })()}

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
        {/* 좌우 반전은 이미지와 액세서리가 같이 뒤집혀야 하므로
            이 래퍼에서 함께 적용한다(머리 방향과 어긋나지 않게). */}
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            transform:
              displayDirection?.flipX
                ? 'scaleX(-1)'
                : 'none',
          }}
        >
          <img
            src={imageSrc}
            onError={() => setUseDefaultSprite(true)}
            alt="Fish"
            style={{
              width: '120px',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',

              filter: abnormal
                ? 'drop-shadow(0 0 15px red) sepia(1) hue-rotate(-50deg) saturate(3)'
                : `hue-rotate(${fishColorHue}deg) drop-shadow(0 4px 6px rgba(15,23,42,0.3))`,
            }}
          />

          {/* 액세서리 */}
          {fishAccessory && ACCESSORY_STYLE[fishAccessory] && (
            <span
              style={{
                position: 'absolute',
                left: ACCESSORY_STYLE[fishAccessory].left,
                top: ACCESSORY_STYLE[fishAccessory].top,
                transform: 'translate(-50%, -50%)',
                fontSize: ACCESSORY_STYLE[fishAccessory].fontSize,
                lineHeight: 1,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))',
              }}
            >
              {ACCESSORY_STYLE[fishAccessory].emoji}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}