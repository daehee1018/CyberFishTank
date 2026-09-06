import React, { useState, useEffect, useRef } from 'react';
import Fish from './Fish';

export default function Aquarium({
  children,
  showFish = true,
}: {
  children?: React.ReactNode;
  showFish?: boolean;
}) {
  const [fish, setFish] = useState({
    id: 1,
    x: 50,
    y: 50,
    angle: Math.random() * 360,
  });

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

        /*
          기본 물 배경
          너무 복잡하지 않고
          디지털 트윈 화면에 적합하도록 구성
        */
        background:
          'linear-gradient(to bottom, #7dd3fc 0%, #38bdf8 45%, #0ea5e9 100%)',

        boxShadow:
          'inset 0 0 30px rgba(0,0,0,0.15)',
      }}
    >

      {/* ================================
          기본 모래 바닥
          ================================ */}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,

          width: '100%',
          height: '15%',

          background:
            'linear-gradient(to bottom, #f5deb3 0%, #d6b77a 100%)',

          borderTop:
            '2px solid rgba(120,90,50,0.15)',

          zIndex: 1,
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

        {/*
          Decoration Objects
          다음 단계에서 추가
        */}

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