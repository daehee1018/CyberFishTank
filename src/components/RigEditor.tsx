import { trackedFetch as fetch } from '../services/requestActivity';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import FishSprite from './FishSprite';
import { moveRigPart, PART_NAMES } from '../lib/fishRig';
import type { FishRig, Point, Rect, RigPart, RigSource, Strength } from '../lib/fishRig';
import './FishVisuals.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://ggnu.site';
const PARTS: RigPart[] = ['body', 'tail', 'dorsal', 'lower'];
const COLORS = { body: '#e9bd53', tail: '#53d8d2', dorsal: '#b5a1ff', lower: '#f799b5' };
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
type Drag = { handle: string; part: RigPart; start: Point; rect: Rect };

export default function RigEditor({ graphicId, onClose }: { graphicId: number; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [source, setSource] = useState<RigSource | null>(null);
  const [rig, setRig] = useState<FishRig | null>(null);
  const [previewRig, setPreviewRig] = useState<FishRig | null>(null);
  const [part, setPart] = useState<RigPart>('body');
  const [fast, setFast] = useState(false);
  const [animated, setAnimated] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    dialogRef.current?.showModal();
    void fetch(`${API_BASE}/api/fish/graphics/${graphicId}/rig`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || '움직임 설정을 불러오지 못했습니다.'); return data as RigSource; })
      .then(data => {
        setSource(data);
        setRig(data.rig ?? { version: 1, imageHash: data.imageHash, sourceSize: data.sourceSize, facing: 'right', body: { rect: [.4, .3, .35, .35] }, tail: null, dorsal: null, lower: null });
      }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [graphicId]);
  useEffect(() => { const timer = setTimeout(() => setPreviewRig(rig), 180); return () => clearTimeout(timer); }, [rig]);

  const point = (event: PointerEvent<SVGSVGElement>): Point => {
    const box = svgRef.current!.getBoundingClientRect();
    return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
  };
  const setRect = (key: RigPart, rect: Rect) => setRig(current => {
    if (!current) return current;
    const previous = current[key];
    if (key === 'body') return { ...current, body: { rect } };
    const [x, y, w, h] = rect;
    if (key === 'tail') return { ...current, tail: { strength: 'medium', root: [current.facing === 'right' ? x + w : x, y + h / 2], ...previous, rect } } as FishRig;
    return { ...current, [key]: { strength: 'low', rootLine: [[x + w * .25, key === 'dorsal' ? y + h : y], [x + w * .75, key === 'dorsal' ? y + h : y]], ...previous, rect } } as FishRig;
  });
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!rig) return;
    const target = event.target as SVGElement;
    const chosen = (target.dataset.part as RigPart) || part;
    setPart(chosen);
    const handle = drawing ? 'draw' : target.dataset.handle || 'draw';
    const start = point(event);
    dragRef.current = { handle, part: chosen, start, rect: rig[chosen]?.rect ?? [start[0], start[1], .01, .01] };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (handle === 'draw') setRect(chosen, [Math.min(start[0], .99), Math.min(start[1], .99), .01, .01]);
  };
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || !rig) return;
    const p = point(event), [sx, sy] = drag.start, [x, y, w, h] = drag.rect;
    if (drag.handle === 'draw') setRect(drag.part, [Math.min(sx, p[0], .99), Math.min(sy, p[1], .99), Math.max(.01, Math.abs(p[0] - sx)), Math.max(.01, Math.abs(p[1] - sy))]);
    else if (drag.handle === 'move') {
      const nx = clamp(x + p[0] - sx, 0, 1 - w), ny = clamp(y + p[1] - sy, 0, 1 - h);
      setRig(current => current ? moveRigPart(current, drag.part, nx, ny) : current);
    } else if (drag.handle === 'size') setRect(drag.part, [x, y, clamp(p[0] - x, .01, 1 - x), clamp(p[1] - y, .01, 1 - y)]);
    else setRig(current => {
      if (!current || !current[drag.part]) return current;
      if (drag.part === 'tail' && current.tail) return { ...current, tail: { ...current.tail, root: p } };
      if ((drag.part === 'dorsal' || drag.part === 'lower') && current[drag.part]) {
        const value = current[drag.part]!;
        const line: [Point, Point] = [...value.rootLine];
        line[drag.handle === 'root0' ? 0 : 1] = p;
        return { ...current, [drag.part]: { ...value, rootLine: line } };
      }
      return current;
    });
  };
  const nudge = (event: KeyboardEvent<SVGElement>, key: RigPart, handle: string) => {
    if (!rig || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? .02 : .003;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    if (handle === 'move' || handle === 'size') {
      const [x, y, w, h] = rig[key]!.rect;
      if (handle === 'move') setRig(current => current ? moveRigPart(current, key, x + dx, y + dy) : current);
      else setRect(key, [x, y, clamp(w + dx, .01, 1 - x), clamp(h + dy, .01, 1 - y)]);
    } else setRig(current => {
      if (!current) return current;
      const value = current[key];
      const move = ([x, y]: Point): Point => [clamp(x + dx), clamp(y + dy)];
      if (key === 'tail' && current.tail) return { ...current, tail: { ...current.tail, root: move(current.tail.root) } };
      if ((key === 'dorsal' || key === 'lower') && value && 'rootLine' in value) {
        const line: [Point, Point] = [...value.rootLine];
        const index = handle === 'root0' ? 0 : 1;
        line[index] = move(line[index]);
        return { ...current, [key]: { ...value, rootLine: line } };
      }
      return current;
    });
  };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/api/fish/graphics/${graphicId}/rig`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rig }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '저장에 실패했습니다.');
      window.dispatchEvent(new Event('fish-style-changed'));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했습니다.'); }
    finally { setSaving(false); }
  };
  const aspect = source ? source.sourceSize[0] / source.sourceSize[1] : 1;
  const handle = (key: RigPart, p: Point, name: string, label: string) => <g key={name}>
    <ellipse cx={p[0]} cy={p[1]} rx=".07" ry={.07 * aspect} className="rig-hit"
      tabIndex={0} role="button" aria-label={`${PART_NAMES[key]} ${label}`} data-part={key} data-handle={name}
      onKeyDown={event => nudge(event, key, name)} />
    <ellipse cx={p[0]} cy={p[1]} rx=".018" ry={.018 * aspect} className="rig-handle" pointerEvents="none" />
  </g>;

  return <dialog ref={dialogRef} className="rig-dialog" aria-labelledby="rig-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <div className="rig-heading"><div><h2 id="rig-title">물고기 움직임 설정</h2><p>몸통을 보호하고, 지느러미가 붙는 지점을 맞춰주세요.</p></div><button className="cft-button" onClick={onClose} disabled={saving} aria-label="움직임 설정 닫기">✕</button></div>
    {error && <p className="cft-error" role="alert">{error}</p>}
    {!source || !rig ? <p role="status">{error ? '설정을 불러오지 못했습니다.' : '원본 이미지를 불러오는 중…'}</p> : <>
      {source.stale && <p role="status">이미지가 바뀌어 이전 설정을 해제했습니다. 부위를 다시 지정해주세요.</p>}
      <div className="rig-part-tabs" role="group" aria-label="움직임 부위 선택">{PARTS.map(key => <button className={`cft-button${part === key ? ' is-selected' : ''}`} key={key} aria-pressed={part === key} onClick={() => { setPart(key); setDrawing(!rig[key]); }}>{PART_NAMES[key]}</button>)}</div>
      <div className="rig-layout">
        <div>
          <div className="rig-checker" style={{ aspectRatio: `${source.sourceSize[0]} / ${source.sourceSize[1]}` }}>
            <img src={`${source.imageUrl}?v=${source.imageHash}`} alt="부위를 지정할 원본 물고기" draggable={false} />
            <svg ref={svgRef} viewBox="0 0 1 1" preserveAspectRatio="none" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { dragRef.current = null; setDrawing(false); }} onPointerCancel={() => { dragRef.current = null; }} aria-label="이미지에서 드래그하여 부위 영역 지정">
              {PARTS.map(key => { const value = rig[key]; if (!value) return null; const [x, y, w, h] = value.rect; return <g key={key} style={{ color: COLORS[key], opacity: part === key ? 1 : .45 }}>
                <rect x={x} y={y} width={w} height={h} fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth=".004" tabIndex={0} role="button" aria-label={`${PART_NAMES[key]} 영역 이동`} data-part={key} data-handle="move" onKeyDown={event => nudge(event, key, 'move')} />
                {part === key && <>{handle(key, [x + w, y + h], 'size', '영역 크기')}{'root' in value && handle(key, value.root, 'root', '뿌리점')}{'rootLine' in value && <><line x1={value.rootLine[0][0]} y1={value.rootLine[0][1]} x2={value.rootLine[1][0]} y2={value.rootLine[1][1]} stroke="white" strokeWidth=".005" />{value.rootLine.map((p, i) => handle(key, p, `root${i}`, `부착선 ${i + 1}`))}</>}</>}</g>; })}
            </svg>
          </div>
          <p className="rig-hint">영역은 드래그로 이동, 모서리 점은 크기 조절, 흰 점은 뿌리·부착선입니다. Tab과 방향키로 미세 조정할 수 있습니다.</p>
        </div>
        <div className="rig-preview"><div className="rig-preview-tank"><FishSprite src={`${source.imageUrl}?v=${source.imageHash}`} rig={animated ? previewRig : null} fast={fast} /></div>
          <div className="rig-part-tabs"><button className="cft-button" aria-pressed={animated} onClick={() => setAnimated(!animated)}>{animated ? '원본 보기' : '움직임 보기'}</button><label><input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} /> 빠른 수영 미리보기</label></div>
          <p className="rig-hint">미리보기 · 지느러미 움직임은 화면 연출입니다. 눈·몸통이 흔들리면 보호 영역을 넓히거나 강도를 낮춰주세요.</p>
        </div>
      </div>
      <div className="rig-controls">
        <button className="cft-button" aria-pressed={drawing} onClick={() => setDrawing(true)}>{PART_NAMES[part]} 다시 그리기</button>
        {part !== 'body' && <><label>움직임 강도 <select aria-label="지느러미 움직임 강도" value={rig[part]?.strength ?? 'low'} disabled={!rig[part]} onChange={e => setRig({ ...rig, [part]: { ...rig[part]!, strength: e.target.value as Strength } })}><option value="low">약</option><option value="medium">보통</option><option value="high">강</option></select></label><button className="cft-button" onClick={() => setRig({ ...rig, [part]: null })}>이 부위 생략</button></>}
        <label>원본 머리 방향 <select aria-label="원본 머리 방향" value={rig.facing} onChange={e => setRig({ ...rig, facing: e.target.value as 'left' | 'right' })}><option value="right">오른쪽</option><option value="left">왼쪽</option></select></label>
      </div>
      {drawing && <p role="status" className="rig-hint">원본 이미지 위에서 드래그하여 {PART_NAMES[part]} 영역을 그려주세요.</p>}
      <div className="rig-footer"><button className="cft-button" onClick={onClose} disabled={saving}>취소</button><button className="cft-button cft-button--primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '이 그래픽에 저장'}</button></div>
    </>}
  </dialog>;
}
