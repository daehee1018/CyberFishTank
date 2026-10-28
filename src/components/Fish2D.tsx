import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { useFishColorFilter } from './FishColorFilter';
import { FishTrackingFilter, mapTrackingPoint, TRACKING_LABELS } from '../lib/fishTracking';
import type { FishTrackingSample, TrackingStatus } from '../lib/fishTracking';
import type { RigSource } from '../lib/fishRig';
import { advanceFishDisplay, createFishDisplay, depthAppearance } from '../lib/fishDisplay';
import FishSprite from './FishSprite';
import './FishVisuals.css';

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

const API_BASE = import.meta.env.VITE_API_URL || 'https://ggnu.site';

export function Fish2D({ trackingStatusContainer, ...sample }: FishTrackingSample & { trackingStatusContainer?: HTMLElement | null }) {
  const { currentUser, fishColorHue, fishColorRgb, fishAccessory, fishAccessoryX, fishAccessoryY, activeGraphicDir, isWebSocketConnected } = useAppContext();
  const { colorFilter, colorFilterDefinition } = useFishColorFilter(fishColorRgb, fishColorHue);
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState<(RigSource & { key: string }) | null>(null);
  const [fallback, setFallback] = useState(false);
  const [status, setStatus] = useState<TrackingStatus>('waiting');
  const [warning, setWarning] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const orientationRef = useRef<HTMLDivElement>(null);
  const facingRef = useRef<HTMLDivElement>(null);
  const depthRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef(0);
  const filterRef = useRef(new FishTrackingFilter());
  const shownRef = useRef(createFishDisplay());
  const connectedRef = useRef(isWebSocketConnected);
  connectedRef.current = isWebSocketConnected;
  const abnormalSince = useRef<number | null>(null);
  const abnormalFresh = useRef<number | null>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const sourceKey = `${currentUser?.id}/${activeGraphicDir}`;

  useEffect(() => {
    const tank = anchorRef.current?.closest<HTMLElement>('.aquarium');
    if (!tank) return;
    const resize = () => { viewportRef.current = { width: tank.clientWidth, height: tank.clientHeight }; };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(tank);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    window.addEventListener('fish-style-changed', update);
    return () => window.removeEventListener('fish-style-changed', update);
  }, []);
  useEffect(() => {
    filterRef.current = new FishTrackingFilter();
    shownRef.current = createFishDisplay();
    abnormalSince.current = null; abnormalFresh.current = null;
    setWarning(false); setStatus('waiting');
  }, [currentUser?.id]);
  useEffect(() => {
    const controller = new AbortController();
    setFallback(false);
    if (currentUser) void fetch(`${API_BASE}/api/fish/rig`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (response.ok && data.success) { setSource({ ...data, key: sourceKey }); setFallback(false); } })
      .catch(() => { /* Existing sprites remain usable when rig metadata is unavailable. */ });
    return () => controller.abort();
  }, [sourceKey, currentUser?.id, revision]);

  useEffect(() => {
    if (sample.receivedAt === undefined || sample.owner_user_id !== currentUser?.id) return;
    const accepted = filterRef.current.ingest(sample, sample.receivedAt);
    if (accepted) {
      const now = sample.receivedAt;
      abnormalSince.current = sample.abnormal ? abnormalSince.current ?? now : null;
      abnormalFresh.current = now;
    }
  }, [sample, currentUser?.id]);

  const selected = source?.key === sourceKey && !fallback ? source : null;
  const rig = selected?.rig ?? null;
  const legacyPath = currentUser ? `/fish_sprites/${currentUser.id}${activeGraphicDir ? '/' + activeGraphicDir : ''}/fish_right.png` : '/fish_sprites/fish_right.png';
  const imageSrc = selected ? `${selected.imageUrl}?v=${selected.imageHash}` : fallback ? '/fish_sprites/fish_right.png' : `${legacyPath}?v=${revision}`;
  const sourceLeft = rig?.facing === 'left';
  const sourceLeftRef = useRef(sourceLeft);
  sourceLeftRef.current = sourceLeft;

  useEffect(() => {
    let frame = 0, previous = performance.now(), nextStatus = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const render = (now: number) => {
      const dt = Math.min(.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      const filter = filterRef.current, shown = shownRef.current;
      const compression = advanceFishDisplay(shown, filter, dt, reduced.matches);
      const tracking = ['tracking', 'pose'].includes(filter.status(now, connectedRef.current));
      if (!tracking) filter.depth.hold('추적·연결 확인 중');
      activityRef.current = tracking ? filter.speed : 0;
      const viewport = viewportRef.current;
      const [x, y] = mapTrackingPoint(shown.x, shown.y, filter.frameSize, viewport.width, viewport.height);
      if (anchorRef.current) { anchorRef.current.style.left = `${x * 100}%`; anchorRef.current.style.top = `${y * 100}%`; }
      if (orientationRef.current) orientationRef.current.style.transform = `rotate(${shown.rotation}deg)`;
      if (depthRef.current) {
        depthRef.current.style.transform = `scale(${shown.scale})`;
        depthRef.current.style.filter = depthAppearance(shown.scale);
      }
      if (facingRef.current) facingRef.current.style.transform = `scaleX(${(shown.flip !== sourceLeftRef.current ? -1 : 1) * compression})`;
      if (now >= nextStatus) {
        setStatus(filter.status(now, connectedRef.current));
        const fresh = abnormalFresh.current !== null && now - abnormalFresh.current < filter.lossDelay();
        setWarning(fresh && abnormalSince.current !== null && now - abnormalSince.current >= 5000);
        nextStatus = now + 250;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  const trackingStatus = <div className="twin-tracking-status" data-status={status} role="status" aria-live="polite">{TRACKING_LABELS[status]}</div>;

  return <>
    {colorFilterDefinition}
    {trackingStatusContainer === undefined ? trackingStatus : trackingStatusContainer && createPortal(trackingStatus, trackingStatusContainer)}
    <div ref={anchorRef} data-aquarium-fish className="twin-fish-anchor" style={{ left: '50%', top: '50%' }}>
      {warning && <span className="twin-fish-notice" role="status">⚠ 이상행동 신호 확인</span>}
      <div className="twin-fish-visual"><div ref={depthRef} className="twin-fish-depth"><div ref={orientationRef} className="twin-fish-orientation"><div ref={facingRef} className="twin-fish-facing">
        <FishSprite key={imageSrc} src={imageSrc} rig={rig} activityRef={activityRef} filter={colorFilter} onError={() => setFallback(true)} />
        {fishAccessory && ACCESSORY_STYLE[fishAccessory] && <span style={{ position: 'absolute', left: fishAccessoryX != null ? `${fishAccessoryX}%` : ACCESSORY_STYLE[fishAccessory].left, top: fishAccessoryY != null ? `${fishAccessoryY}%` : ACCESSORY_STYLE[fishAccessory].top, transform: 'translate(-50%, -50%)', fontSize: ACCESSORY_STYLE[fishAccessory].fontSize, lineHeight: 1 }}>
          {ACCESSORY_STYLE[fishAccessory].emoji}
        </span>}
      </div></div></div></div>
    </div>
  </>;
}
