import React, { useState, useEffect, useRef, useMemo } from 'react';
import Fish from './Fish';
import type { AquariumDecoration } from '../context/AppContext';

const THEME_TINTS: Record<string, string> = {
  night:
    'linear-gradient(to bottom, rgba(8,12,40,0.5), rgba(8,12,40,0.28))',
  halloween:
    'linear-gradient(to bottom, rgba(255,140,0,0.16), rgba(70,0,90,0.14))',
  christmas:
    'linear-gradient(to bottom, rgba(190,225,255,0.18), rgba(255,255,255,0.04))',
};

// 바닥재(자갈/모래) 프리셋. 조약돌은 바닥색과 대비되게 색을
// 따로 잡는다(밝은 바닥엔 어두운 조약돌, 어두운 바닥엔 밝은 조약돌).
const SUBSTRATE_PRESETS: Record<
  string,
  { base: string; gradient: string; pebble: string }
> = {
  natural: {
    base: '#d7b77f',
    gradient: 'linear-gradient(to bottom, rgba(255,255,255,0.25), rgba(0,0,0,0.08) 100%)',
    pebble: '120,90,50',
  },
  white: {
    base: '#e9e4d6',
    gradient: 'linear-gradient(to bottom, rgba(255,255,255,0.5), rgba(0,0,0,0.05) 100%)',
    pebble: '150,140,120',
  },
  black: {
    base: '#2e2c2a',
    gradient: 'linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(0,0,0,0.25) 100%)',
    pebble: '210,205,195',
  },
  pink: {
    base: '#e8a9bb',
    gradient: 'linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(0,0,0,0.08) 100%)',
    pebble: '150,60,90',
  },
  blue: {
    base: '#6f93b8',
    gradient: 'linear-gradient(to bottom, rgba(255,255,255,0.25), rgba(0,0,0,0.1) 100%)',
    pebble: '30,55,80',
  },
};

export default function Aquarium({
  children,
  showFish = true,
  decorations = [],
  waterColor = '#58b9d8',
  theme = 'default',
  substrateColor = 'natural',
}: {
  children?: React.ReactNode;
  showFish?: boolean;
  decorations?: AquariumDecoration[];
  waterColor?: string;
  theme?: string;
  substrateColor?: string;
}) {
  const substrate = SUBSTRATE_PRESETS[substrateColor] ?? SUBSTRATE_PRESETS.natural;

  const [fish, setFish] = useState({
    id: 1,
    x: 50,
    y: 50,
    angle: Math.random() * 360,
  });

  // ================================
  // 기포 / 바닥 조약돌
  //
  // 매 렌더마다 새로 뽑히면 위치가 계속 튀니, 마운트 시
  // 한 번만 랜덤 생성해서 고정한다.
  // ================================

  const bubbles = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: 8 + Math.random() * 84,
        size: 3 + Math.random() * 6,
        duration: 5 + Math.random() * 5,
        delay: -(Math.random() * 10),
        drift: `${(Math.random() - 0.5) * 24}px`,
      })),
    []
  );

  const pebbles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: 30 + Math.random() * 60,
        size: 3 + Math.random() * 5,
        opacity: 0.12 + Math.random() * 0.18,
      })),
    []
  );

  // ================================
  // 테마 장식 (밤 / 할로윈 / 크리스마스)
  // ================================

  const stars = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 45,
        size: 6 + Math.random() * 8,
        duration: 1.8 + Math.random() * 2.4,
        delay: -(Math.random() * 3),
      })),
    []
  );

  const halloweenItems = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: i,
        emoji: i % 2 === 0 ? '🎃' : '🦇',
        left: 8 + Math.random() * 84,
        top: 8 + Math.random() * 55,
        size: 20 + Math.random() * 14,
        duration: 4 + Math.random() * 3,
        delay: -(Math.random() * 5),
        drift: `${(Math.random() - 0.5) * 40}px`,
      })),
    []
  );

  const snowflakes = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 10 + Math.random() * 10,
        duration: 6 + Math.random() * 6,
        delay: -(Math.random() * 10),
        drift: `${(Math.random() - 0.5) * 60}px`,
      })),
    []
  );

  const currentRef = useRef({
    x: 50,
    y: 50,
    angle: fish.angle,
  });

  const targetRef = useRef({
    x: 50,
    y: 50,
    angle: fish.angle,
  });

  useEffect(() => {
    const clamp = (
      value: number,
      min: number,
      max: number
    ) => Math.max(min, Math.min(max, value));

    const lerp = (
      start: number,
      end: number,
      t: number
    ) => start + (end - start) * t;

    const shortestAngleDiff = (
      from: number,
      to: number
    ) => {
      const diff =
        ((to - from + 540) % 360) - 180;

      return diff;
    };

    const setNewTarget = () => {
      let nextAngle =
        targetRef.current.angle +
        (Math.random() - 0.5) * 90;

      if (currentRef.current.x < 20) {
        nextAngle = 0;
      } else if (currentRef.current.x > 80) {
        nextAngle = 180;
      }

      if (currentRef.current.y < 25) {
        nextAngle = 90;
      } else if (currentRef.current.y > 75) {
        nextAngle = 270;
      }

      nextAngle =
        (nextAngle + 360) % 360;

      const rad =
        (nextAngle * Math.PI) / 180;

      const distance = 14;

      const nextX = clamp(
        currentRef.current.x +
          Math.cos(rad) * distance,
        10,
        90
      );

      const nextY = clamp(
        currentRef.current.y +
          Math.sin(rad) * distance,
        20,
        80
      );

      targetRef.current = {
        x: nextX,
        y: nextY,
        angle: nextAngle,
      };
    };

    let frameId = 0;

    const animate = () => {
      const smoothing = 0.05;

      currentRef.current.x = lerp(
        currentRef.current.x,
        targetRef.current.x,
        smoothing
      );

      currentRef.current.y = lerp(
        currentRef.current.y,
        targetRef.current.y,
        smoothing
      );

      const angleDiff =
        shortestAngleDiff(
          currentRef.current.angle,
          targetRef.current.angle
        );

      currentRef.current.angle =
        (
          currentRef.current.angle +
          angleDiff * smoothing +
          360
        ) % 360;

      if (
        Math.abs(
          targetRef.current.x -
          currentRef.current.x
        ) < 0.02
      ) {
        currentRef.current.x =
          targetRef.current.x;
      }

      if (
        Math.abs(
          targetRef.current.y -
          currentRef.current.y
        ) < 0.02
      ) {
        currentRef.current.y =
          targetRef.current.y;
      }

      if (
        Math.abs(angleDiff) < 0.5
      ) {
        currentRef.current.angle =
          targetRef.current.angle;
      }

      setFish({
        id: 1,
        x: currentRef.current.x,
        y: currentRef.current.y,
        angle: currentRef.current.angle,
      });

      frameId =
        requestAnimationFrame(animate);
    };

    const interval =
      setInterval(
        setNewTarget,
        1800
      );

    frameId =
      requestAnimationFrame(animate);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',

        // 오염도(탁도+TDS)에 따라 Dashboard가 색을 바꿔서 넘겨준다.
        // 그 위에 수심에 따른 명암 그라데이션을 겹쳐서 입체감을 준다.
        backgroundColor:
          waterColor,

        backgroundImage:
          'linear-gradient(to bottom, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.06) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.16) 100%)',

        transition:
          'background-color 1.5s ease',

        boxShadow:
          'inset 0 0 18px rgba(15,23,42,0.1)',
      }}
    >

      {/* ================================
          카오틱 광선 (물속에서 흔들리는 빛줄기)
          ================================ */}

      <div
        className="aquarium-caustics"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          opacity: 0.4,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          filter: 'blur(10px)',
          backgroundImage:
            'radial-gradient(ellipse 22% 10% at 18% 12%, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%), ' +
            'radial-gradient(ellipse 16% 8% at 62% 30%, rgba(255,255,255,0.5), rgba(255,255,255,0) 70%), ' +
            'radial-gradient(ellipse 20% 9% at 85% 8%, rgba(255,255,255,0.45), rgba(255,255,255,0) 70%), ' +
            'radial-gradient(ellipse 18% 9% at 38% 55%, rgba(255,255,255,0.4), rgba(255,255,255,0) 70%)',
          backgroundSize: '200% 200%',
        }}
      />

      {/* ================================
          수면 반짝임 (물 맨 위쪽)
          ================================ */}

      <div
        className="aquarium-surface"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '5%',
          zIndex: 1,
          opacity: 0.3,
          filter: 'blur(4px)',
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(to bottom, rgba(255,255,255,0.75), rgba(255,255,255,0) 100%)',
          backgroundSize: '200% 100%',
        }}
      />

      {/* ================================
          테마 틴트 (밤/할로윈/크리스마스)
          ================================ */}

      {THEME_TINTS[theme] && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            backgroundImage: THEME_TINTS[theme],
            transition: 'background-image 1.5s ease',
          }}
        />
      )}

      {/* ================================
          밤: 달 + 별
          ================================ */}

      {theme === 'night' && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '6%',
              right: '8%',
              fontSize: '32px',
              zIndex: 1,
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          >
            🌙
          </div>

          {stars.map((star) => (
            <span
              key={star.id}
              className="aquarium-star"
              style={{
                position: 'absolute',
                left: `${star.left}%`,
                top: `${star.top}%`,
                fontSize: `${star.size}px`,
                zIndex: 1,
                pointerEvents: 'none',
                animationDuration: `${star.duration}s`,
                animationDelay: `${star.delay}s`,
              }}
            >
              ✨
            </span>
          ))}
        </>
      )}

      {/* ================================
          할로윈: 호박 / 박쥐
          ================================ */}

      {theme === 'halloween' &&
        halloweenItems.map((item) => (
          <span
            key={item.id}
            className="aquarium-bat"
            style={{
              position: 'absolute',
              left: `${item.left}%`,
              top: `${item.top}%`,
              fontSize: `${item.size}px`,
              zIndex: 3,
              pointerEvents: 'none',
              animationDuration: `${item.duration}s`,
              animationDelay: `${item.delay}s`,
              '--bat-drift': item.drift,
            } as React.CSSProperties}
          >
            {item.emoji}
          </span>
        ))}

      {/* ================================
          크리스마스: 눈
          ================================ */}

      {theme === 'christmas' &&
        snowflakes.map((flake) => (
          <span
            key={flake.id}
            className="aquarium-snow"
            style={{
              left: `${flake.left}%`,
              fontSize: `${flake.size}px`,
              zIndex: 8,
              animationDuration: `${flake.duration}s`,
              animationDelay: `${flake.delay}s`,
              '--snow-drift': flake.drift,
            } as React.CSSProperties}
          >
            ❄️
          </span>
        ))}

      {/* ================================
          기포
          ================================ */}

      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className="aquarium-bubble"
          style={{
            left: `${bubble.left}%`,
            width: `${bubble.size}px`,
            height: `${bubble.size}px`,
            zIndex: 3,
            animationDuration: `${bubble.duration}s`,
            animationDelay: `${bubble.delay}s`,
            '--bubble-drift': bubble.drift,
          } as React.CSSProperties}
        />
      ))}

      {/* ================================
          바닥재 (자갈/모래)
          ================================ */}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,

          width: '100%',
          height: '15%',

          backgroundColor: substrate.base,
          backgroundImage: substrate.gradient,
          transition: 'background-color 1s ease',

          borderTop:
            `2px solid rgba(${substrate.pebble},0.15)`,

          zIndex: 1,
        }}
      >
        {pebbles.map((pebble) => (
          <div
            key={pebble.id}
            style={{
              position: 'absolute',
              left: `${pebble.left}%`,
              top: `${pebble.top}%`,
              width: `${pebble.size}px`,
              height: `${pebble.size * 0.7}px`,
              borderRadius: '9999px',
              backgroundColor: `rgba(${substrate.pebble},${pebble.opacity})`,
            }}
          />
        ))}
      </div>

      {/* ================================
          유리 비네트 (테두리를 살짝 어둡게)
          ================================ */}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 6,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.18), inset 0 0 8px rgba(255,255,255,0.15)',
        }}
      />

      {/* ================================
          구조물 레이어
          
          다음 단계에서
          집 / 수초 / 돌 / 장식 등을
          여기에 렌더링
          ================================ */}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >

        {decorations.map(
          decoration => (
            <img
              key={decoration.id}
              src={
                decoration.src.includes('?')
                  ? decoration.src
                  : `${decoration.src}?v=3`
              }
              alt=""
              className={
                decoration.sway
                  ? 'aquarium-decoration aquarium-plant-sway'
                  : 'aquarium-decoration'
              }
              style={{
                left: `${decoration.x}%`,
                top: `${decoration.y}%`,
                width: `${decoration.width ?? 22}%`,
                height: `${decoration.height ?? 22}%`,
              }}
            />
          )
        )}

      </div>

      {/* ================================
          물고기 레이어
          ================================ */}

      <div
        style={{
          zIndex: 5,
          position: 'relative',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {children
          ? children
          : (
            showFish && (
              <Fish
                x={fish.x}
                y={fish.y}
                angle={fish.angle}
              />
            )
          )}
      </div>

    </div>
  );
}