import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Aquarium from '../components/Aquarium';
import FishSprite from '../components/FishSprite';
import { FishTrackingFilter, TRACKING_LABELS, DEPTH_LABELS, mapTrackingPoint } from '../lib/fishTracking';
import { FishTrackingFilter as LegacyFilter } from './legacyFishTracking';
import { advanceFishDisplay, createFishDisplay, depthAppearance } from '../lib/fishDisplay';
import type { FishTrackingSample } from '../lib/fishTracking';
import type { FishRig } from '../lib/fishRig';
import type { AquariumDecoration } from '../context/AppContext';
import '../components/FishVisuals.css';

type Frame = FishTrackingSample & { at_ms: number };
// Deliberately synthetic: approach, height-only silhouette spike, turn, loss, recovery.
const demo: Frame[] = Array.from({ length: 70 }, (_, i) => {
  const size = i < 12 ? 1 : i < 28 ? 1 + (i - 12) * .018 : i < 34 ? 1.27 : 1.27 - Math.min(20, i - 34) * .018;
  const left = i >= 35, h = 120 * (i === 22 ? 1.9 : size);
  const cx = 580, cy = 330;
  return {
    at_ms: i * 400, timestamp_ms: 100000 + i * 400, source: 'demo', stream_id: 'synthetic', frame_id: i, track_id: 1,
    state: i >= 48 && i < 54 ? 'lost' : 'tracked',
    center_norm: i === 16 ? [.99, .02] : i >= 48 && i < 54 ? null : [.30 + Math.min(i, 36) * .007, .46],
    conf: i === 30 ? .12 : .7, pose_conf: i === 31 ? 0 : .7,
    frame_size: [1280, 720], bbox: [cx - 140 * size, cy - h / 2, cx + 140 * size, cy + h / 2],
    head: [cx + (left ? -1 : 1) * 100 * size, cy], tail: [cx - (left ? -1 : 1) * 100 * size, cy],
  };
});
// Comparison props only. Never saved into a user's actual aquarium layout.
const comparisonDecorations: AquariumDecoration[] = [
  { id: 'back-demo', type: 'structure', src: '/assets/aquarium/structures/structure_wood_bridge_01.png', x: 20, y: 88, width: 28, height: 34, layer: 'back' },
  { id: 'middle-demo', type: 'cave', src: '/assets/aquarium/caves/cave_rounded_stone_01.png', x: 67, y: 64, width: 25, height: 27, layer: 'middle' },
  { id: 'front-demo', type: 'structure', src: '/assets/aquarium/structures/structure_stone_arch_01.png', x: 88, y: 86, width: 21, height: 30, layer: 'front' },
];

function Replay() {
  const [frames, setFrames] = useState<Frame[]>(demo);
  const [label, setLabel] = useState('합성 테스트 · 실제 측정 데이터 아님');
  const [rig, setRig] = useState<FishRig | null>(null);
  const [playing, setPlaying] = useState(false);
  const [readout, setReadout] = useState('재생 대기');
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const filter = useRef(new FishTrackingFilter()), legacy = useRef(new LegacyFilter());
  const elapsed = useRef(0), cursor = useRef(0);
  const shown = useRef([createFishDisplay(), createFishDisplay(), createFishDisplay()]);
  const activity = useRef(0);
  useEffect(() => { void fetch('/fish_sprites/fish_right.rig.json').then(r => r.json()).then(setRig); }, []);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  const draw = (dt: number) => {
    for (let i = 0; i < 3; i++) {
      const element = panels.current[i]; if (!element) continue;
      const state = shown.current[i];
      let compression = 1;
      if (i === 0) {
        const old = legacy.current, a = 1 - Math.exp(-dt / .3);
        state.x += (old.x - state.x) * a; state.y += (old.y - state.y) * a;
        state.rotation += (old.rotation() - state.rotation) * (1 - Math.exp(-dt / .22)); state.flip = old.flip;
      } else compression = advanceFishDisplay(state, filter.current, dt, matchMedia('(prefers-reduced-motion: reduce)').matches);
      const viewport = element.closest<HTMLElement>('.aquarium')!;
      const [x, y] = mapTrackingPoint(state.x, state.y, (i === 0 ? legacy.current : filter.current).frameSize, viewport.clientWidth, viewport.clientHeight);
      element.style.left = `${x * 100}%`; element.style.top = `${y * 100}%`;
      const depth = element.querySelector<HTMLElement>('.twin-fish-depth')!;
      depth.style.transform = `scale(${i === 2 ? state.scale : 1})`;
      depth.style.filter = i === 2 ? depthAppearance(state.scale) : 'none';
      element.querySelector<HTMLElement>('.twin-fish-orientation')!.style.transform = `rotate(${state.rotation}deg)`;
      element.querySelector<HTMLElement>('.twin-fish-facing')!.style.transform = `scaleX(${(state.flip ? -1 : 1) * compression})`;
    }
    activity.current = ['tracking', 'pose'].includes(filter.current.status(elapsed.current)) ? filter.current.speed : 0;
  };
  const diagnostic = () => {
    const f = filter.current, d = f.depth;
    return `${(elapsed.current / 1000).toFixed(1)}초 · ${TRACKING_LABELS[f.status(elapsed.current)]} · 깊이 ${DEPTH_LABELS[d.state]} (${d.reason}) · 높이 ${d.rawHeight?.toFixed(3) ?? '—'} → ${d.height?.toFixed(3) ?? '—'} / 기준 ${d.baseline?.toFixed(3) ?? '—'} · ${d.scale.toFixed(3)}배 · 수신 간격 ${Math.round(f.interval)}ms`;
  };
  const advance = (target: number) => {
    // A fixed display step makes pause/seek and repeated runs comparable.
    while (elapsed.current < target) {
      const next = Math.min(target, elapsed.current + 1000 / 60);
      while (cursor.current < frames.length && frames[cursor.current].at_ms <= next) {
        const sample = frames[cursor.current++];
        filter.current.ingest(sample, sample.at_ms); legacy.current.ingest(sample, sample.at_ms);
      }
      draw((next - elapsed.current) / 1000); elapsed.current = next;
    }
  };
  const reset = () => {
    setPlaying(false); filter.current = new FishTrackingFilter(); legacy.current = new LegacyFilter();
    elapsed.current = 0; cursor.current = 0; shown.current = [createFishDisplay(), createFishDisplay(), createFishDisplay()];
    if (video.current) video.current.currentTime = 0;
    draw(0); setReadout('재생 대기');
  };
  useEffect(() => {
    if (!playing) { video.current?.pause(); return; }
    if (video.current && videoUrl) { video.current.currentTime = elapsed.current / 1000; void video.current.play().catch(() => {}); }
    let frame = 0, last = performance.now(), nextLabel = 0;
    const render = (now: number) => {
      const dt = Math.min(100, now - last); last = now;
      advance(elapsed.current + dt);
      if (now >= nextLabel) { setReadout(diagnostic()); nextLabel = now + 200; }
      if (elapsed.current > (frames.at(-1)?.at_ms ?? 0) + 5500) { setPlaying(false); return; }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [playing, frames, videoUrl]);

  return <main style={{ maxWidth: 1500, margin: '30px auto', padding: 20, fontFamily: 'Pretendard, sans-serif', color: '#23494d' }}>
    <h1>디지털 트윈 입력 재생 검증</h1><p><strong>데모 / 검증 전용</strong> · {label}</p>
    <p>동일 로그를 기존 필터 / 개선 움직임 / 깊이·3레이어로 비교합니다. 영상과 JSON은 브라우저에서만 열립니다.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
      <button onClick={() => setPlaying(v => !v)}>{playing ? '일시 정지' : '재생'}</button><button onClick={reset}>처음으로</button>
      <label>녹화 JSON 열기 <input type="file" accept="application/json,.json" onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (!Array.isArray(data) || !data.length || data.length > 50000 || data.some((f, i) => !Number.isFinite(f.at_ms) || f.at_ms < 0 || (i > 0 && f.at_ms < data[i - 1].at_ms))) throw new Error('시간순 at_ms가 있는 프레임 배열이 필요합니다.');
          reset(); setFrames(data); setLabel(`${file.name} · 사용자 제공 입력`); setError('');
        } catch (e) { setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.'); }
      }} /></label>
      <label>같은 시간축의 원본 영상 <input type="file" accept="video/*" onChange={event => {
        const file = event.target.files?.[0]; if (file) { setPlaying(false); setVideoUrl(URL.createObjectURL(file)); }
      }} /></label>
    </div>
    <label style={{ display: 'flex', gap: 12, alignItems: 'center' }}>재생 위치 <input aria-label="재생 위치" type="range" min="0" max={(frames.at(-1)?.at_ms ?? 0) + 5500} step="100" value={elapsed.current} style={{ flex: 1 }} onChange={event => {
      const target = Number(event.target.value); reset(); advance(target); setReadout(diagnostic());
      if (video.current) video.current.currentTime = target / 1000;
    }} /></label>
    {error && <p role="alert">{error}</p>}<p role="status" style={{ fontSize: 13, lineHeight: 1.7 }}>{readout}</p>
    {videoUrl && <video ref={video} src={videoUrl} muted playsInline style={{ display: 'block', width: 'min(100%, 640px)', margin: '20px auto' }} />}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
      {['기존 필터 + 표시', '개선 움직임', '개선 움직임 + 깊이·3레이어'].map((title, i) => <section key={i}><h2 style={{ fontSize: 18 }}>{title}</h2><div style={{ height: 320, borderRadius: 14, overflow: 'hidden' }}>
        <Aquarium showFish={false} decorations={i === 2 ? comparisonDecorations : []}>
          <div ref={el => { panels.current[i] = el; }} className="twin-fish-anchor" style={{ left: '50%', top: '50%' }}>
            <div className="twin-fish-visual"><div className="twin-fish-depth"><div className="twin-fish-orientation"><div className="twin-fish-facing"><FishSprite src="/fish_sprites/fish_right.png" rig={rig} activityRef={i === 0 ? undefined : activity} /></div></div></div></div>
          </div><span className="twin-tracking-status">비교용 합성 장면</span>
        </Aquarium>
      </div></section>)}
    </div>
    <p>입력 형식: <code>[{'{ "at_ms": 0, "frame_id": 1, "bbox": [440,270,720,390], "frame_size": [1280,720], "center_norm": [0.5,0.4], ... }'}]</code></p>
    <p>at_ms 0이 영상 시작 시각입니다. 박스와 키포인트는 frame_size와 같은 픽셀 좌표입니다. 합성 테스트로 실제 지느러미 펼침 판별이나 실기기 성능을 검증했다고 해석하지 않습니다.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Replay />);
