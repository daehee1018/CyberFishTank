import React, { useEffect, useRef } from 'react';
import { Fish2D } from './Fish2D';
import './Aquarium.css';
import type { AquariumDecoration } from '../context/AppContext';

const THEME_TINTS: Record<string, string> = {
  night: 'linear-gradient(#08152988, #102b4566)',
  halloween: 'linear-gradient(#805b3526, #321e4838)',
  christmas: 'linear-gradient(#c4e3ef26, #d8ebed0a)',
};
const SUBSTRATES: Record<string, { base: string; grain: string }> = {
  natural: { base: '#b9ac8b', grain: '89,75,49' },
  white: { base: '#deddd0', grain: '119,115,95' },
  black: { base: '#393d3b', grain: '178,181,170' },
  pink: { base: '#c699a4', grain: '114,65,78' },
  blue: { base: '#7999a9', grain: '44,73,86' },
};
const NATURAL_ASSETS = '/assets/aquarium/natural';
// Keep sensor severity inputs, with restrained presentation tints.
const WATER_TINTS: Record<string, string> = {
  '#58b9d8': '#559b97', '#8a9a5b': '#7b9480', '#7a5c3e': '#858a75',
};
// Fixed emitter positions and phases keep bubbles in two small streams.
const BUBBLES = Array.from({ length: 8 }, (_, i) => ({
  left: (i < 5 ? 15 : 86) + (i % 3) * 0.7,
  size: 3 + (i % 3) * 1.3,
  duration: 8 + (i % 4) * 1.4,
  delay: -i * 2.7,
  drift: `${i % 2 ? 9 : -6}px`,
}));

export default function Aquarium({
  children, showFish = true, decorations = [], waterColor = '#58b9d8',
  theme = 'default', substrateColor = 'natural', variant = 'default',
}: {
  children?: React.ReactNode;
  showFish?: boolean;
  decorations?: AquariumDecoration[];
  waterColor?: string;
  theme?: string;
  substrateColor?: string;
  variant?: 'default' | 'soft';
}) {
  const substrate = SUBSTRATES[substrateColor] ?? SUBSTRATES.natural;
  const tankRef = useRef<HTMLDivElement>(null);

  // Only resize changes the travel distance; no per-frame React updates.
  useEffect(() => {
    const tank = tankRef.current;
    if (!tank) return;
    const update = () => tank.style.setProperty('--bubble-rise', `${-tank.clientHeight * 0.91}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(tank);
    return () => observer.disconnect();
  }, []);

  const renderDecorations = (layer: 'back' | 'front') => (
    <div className={`aquarium-decorations aquarium-decorations--${layer}`} data-decoration-layer={layer}>
      {decorations.filter(item => (item.layer ?? 'back') === layer).map(decoration => {
        const phase = Array.from(decoration.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
        return (
          <div key={decoration.id} className="aquarium-decoration-anchor" style={{
            left: `${decoration.x}%`, top: `${decoration.y}%`,
            width: `${decoration.width ?? 22}%`, height: `${decoration.height ?? 22}%`,
            '--plant-duration': `${4.8 + (phase % 7) * 0.43}s`,
            '--plant-delay': `${-(phase % 13) * 0.61}s`,
          } as React.CSSProperties}>
            <span className="aquarium-contact-shadow" />
            <img src={decoration.src} alt="" draggable={false}
              className={`aquarium-decoration${decoration.sway ? ' aquarium-plant-sway' : ''}`} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={tankRef} className={`aquarium aquarium--${variant}`} data-theme={theme} data-substrate={substrateColor}
      style={{
        '--aquarium-water': WATER_TINTS[waterColor] ?? waterColor,
        '--sand-color': substrate.base, '--sand-grain': substrate.grain,
      } as React.CSSProperties}>
      <div className="aquarium-depth" aria-hidden="true" />
      <div className="aquarium-rear-plants" aria-hidden="true">
        <img src={`${NATURAL_ASSETS}/plant-v1.webp`} alt="" />
        <img src={`${NATURAL_ASSETS}/plant-v1.webp`} alt="" />
      </div>
      <div className="aquarium-substrate" aria-hidden="true"><div className="aquarium-floor-light" /></div>
      <div className="aquarium-hardscape" aria-hidden="true">
        <span className="aquarium-hardscape-shadow" />
        <img src={`${NATURAL_ASSETS}/driftwood-v1.webp`} alt="" />
      </div>
      {THEME_TINTS[theme] && <div className="aquarium-theme-tint" style={{ background: THEME_TINTS[theme] }} aria-hidden="true" />}
      {theme === 'night' && <div className="aquarium-night-lights" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ left: `${9 + i * 10}%`, top: `${8 + (i % 3) * 9}%`, animationDelay: `${-i * 0.7}s` }} />)}</div>}
      {theme === 'halloween' && <svg className="aquarium-seasonal" viewBox="0 0 600 340" aria-hidden="true"><g fill="#302f43" opacity=".55"><path d="M75 55q12-18 25 0l8-5 8 5q13-18 25 0-21-5-33 15-12-20-33-15M457 91q12-18 25 0l8-5 8 5q13-18 25 0-21-5-33 15-12-20-33-15" /></g><g fill="#b9814d" opacity=".7"><ellipse cx="560" cy="304" rx="18" ry="14" /><path d="M558 292l3-10 4 2-4 8" /></g></svg>}
      {theme === 'christmas' && <div className="aquarium-seasonal" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <span className="aquarium-snow" key={i} style={{ left: `${5 + i * 10}%`, animationDuration: `${10 + i % 4}s`, animationDelay: `${-i * 1.7}s` }}>✧</span>)}</div>}
      {renderDecorations('back')}
      <div className="aquarium-bubbles" aria-hidden="true">
        {BUBBLES.map((bubble, i) => <span className="aquarium-bubble" key={i} style={{
          left: `${bubble.left}%`, width: bubble.size, height: bubble.size,
          animationDuration: `${bubble.duration}s`, animationDelay: `${bubble.delay}s`,
          '--bubble-drift': bubble.drift,
        } as React.CSSProperties} />)}
      </div>
      <div className="aquarium-fish-layer">
        {children ?? (showFish && <Fish2D />)}
      </div>
      <div className="aquarium-foreground" aria-hidden="true">
        <img className="aquarium-foreground-left" src={`${NATURAL_ASSETS}/plant-v1.webp`} alt="" />
        <img className="aquarium-foreground-right" src={`${NATURAL_ASSETS}/plant-v1.webp`} alt="" />
      </div>
      {renderDecorations('front')}
      <div className="aquarium-surface" aria-hidden="true" />
      <div className="aquarium-glass" aria-hidden="true" />
    </div>
  );
}
