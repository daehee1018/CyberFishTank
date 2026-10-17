import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Aquarium from '../components/Aquarium';
import FishSprite from '../components/FishSprite';
import { FishTrackingFilter, TRACKING_LABELS } from '../lib/fishTracking';
import type { FishTrackingSample } from '../lib/fishTracking';
import type { FishRig } from '../lib/fishRig';
import '../components/FishVisuals.css';

type Frame = FishTrackingSample & { at_ms: number };
const demo: Frame[] = Array.from({ length: 25 }, (_, i) => ({
  at_ms: i * 500, source: 'demo', stream_id: 'synthetic', frame_id: i, track_id: 1,
  state: i >= 13 && i < 18 ? 'lost' : 'tracked',
  center_norm: i === 8 ? [.98, .05] : i >= 13 && i < 18 ? null : [i < 18 ? .35 + i * .012 : .72, .45],
  conf: .65, pose_conf: i === 9 ? 0 : .5, frame_size: [1280, 720], head: [800, 350], tail: [600, 350],
}));
function Replay() {
  const [frames, setFrames] = useState<Frame[]>(demo);
  const [label, setLabel] = useState('합성 테스트 · 실제 측정 데이터 아님');
  const [rig, setRig] = useState<FishRig | null>(null);
  const [playing, setPlaying] = useState(false);
  const [revision, setRevision] = useState(0);
  const [readout, setReadout] = useState('재생 대기');
  const [error, setError] = useState('');
  const raw = useRef<HTMLDivElement>(null), stable = useRef<HTMLDivElement>(null);
  const filter = useRef(new FishTrackingFilter());
  const elapsed = useRef(0), cursor = useRef(0), shown = useRef({ x: .5, y: .5 });
  useEffect(() => { void fetch('/fish_sprites/fish_right.rig.json').then(r => r.json()).then(setRig); }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = performance.now(), nextLabel = 0;
    const render = (now: number) => {
      const dt = Math.min(100, now - last); last = now; elapsed.current += dt;
      while (cursor.current < frames.length && frames[cursor.current].at_ms <= elapsed.current) {
        const sample = frames[cursor.current++];
        filter.current.ingest(sample, sample.at_ms);
        // Baseline reproduces the old immediate position/fallback behavior.
        const p = sample.center_norm ?? [.5, .5];
        if (raw.current) { raw.current.style.left = `${p[0] * 100}%`; raw.current.style.top = `${p[1] * 100}%`; }
      }
      const alpha = 1 - Math.exp(-dt / 300);
      shown.current.x += (filter.current.x - shown.current.x) * alpha;
      shown.current.y += (filter.current.y - shown.current.y) * alpha;
      if (stable.current) { stable.current.style.left = `${shown.current.x * 100}%`; stable.current.style.top = `${shown.current.y * 100}%`; }
      if (now >= nextLabel) { setReadout(`${(elapsed.current / 1000).toFixed(1)}초 · ${TRACKING_LABELS[filter.current.status(elapsed.current)]}`); nextLabel = now + 200; }
      if (elapsed.current > (frames.at(-1)?.at_ms ?? 0) + 5500) { setPlaying(false); return; }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [playing, frames, revision]);
  const reset = () => { setPlaying(false); filter.current = new FishTrackingFilter(); elapsed.current = 0; cursor.current = 0; shown.current = { x: .5, y: .5 }; for (const el of [raw.current, stable.current]) if (el) { el.style.left = '50%'; el.style.top = '50%'; } setReadout('재생 대기'); setRevision(v => v + 1); };
  return <main style={{ maxWidth: 1100, margin: '30px auto', padding: 20, fontFamily: 'Pretendard, sans-serif', color: '#23494d' }}>
    <h1>디지털 트윈 입력 재생 검증</h1><p><strong>데모 / 검증 전용</strong> · {label}</p>
    <p>동일 입력의 원래 위치 표시와 안정화·지느러미 변형을 비교합니다. 실제 데이터는 외부로 전송하지 않습니다.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
      <button onClick={() => setPlaying(v => !v)}>{playing ? '일시 정지' : '재생'}</button><button onClick={reset}>처음으로</button>
      <label>녹화 JSON 열기 <input type="file" accept="application/json,.json" onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (!Array.isArray(data) || !data.length || data.length > 50000 || data.some((f, i) => !Number.isFinite(f.at_ms) || f.at_ms < 0 || (i > 0 && f.at_ms < data[i - 1].at_ms))) throw new Error('시간순 at_ms가 있는 프레임 배열이 필요합니다.');
          reset(); setFrames(data); setLabel(`${file.name} · 사용자 제공 입력`); setError('');
        } catch (error) { setError(error instanceof Error ? error.message : '파일을 읽지 못했습니다.'); }
      }} /></label>
    </div>
    {error && <p role="alert">{error}</p>}<p role="status">{readout}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
      {[false, true].map(improved => <section key={String(improved)}><h2>{improved ? '개선 표시' : '기존 위치 표시 기준'}</h2><div style={{ height: 320, borderRadius: 14, overflow: 'hidden' }}><Aquarium showFish={false}><div ref={improved ? stable : raw} className="twin-fish-anchor" style={{ left: '50%', top: '50%' }}><div className="twin-fish-visual"><FishSprite src="/fish_sprites/fish_right.png" rig={improved ? rig : null} /></div></div><span className="twin-tracking-status">데모 · {improved ? '안정화 적용' : '입력 직접 표시'}</span></Aquarium></div></section>)}
    </div>
    <p>입력 형식: <code>[{'{ "at_ms": 0, "frame_id": 1, "state": "tracked", "center_norm": [0.5, 0.4], ... }'}]</code></p>
    <p>키포인트는 frame_size와 같은 픽셀 좌표, timestamp_ms는 프레임 입력 시각입니다. 합성 입력의 점수는 형식 예시이며 실제 정확도가 아닙니다.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Replay />);
