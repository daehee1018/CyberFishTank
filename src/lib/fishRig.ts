export type Point = [number, number];
export type Rect = [number, number, number, number];
export type Strength = 'low' | 'medium' | 'high';
export type RigPart = 'body' | 'tail' | 'dorsal' | 'lower';
export interface FishRig {
  version: 1;
  imageHash: string;
  sourceSize: Point;
  facing: 'left' | 'right';
  body: { rect: Rect };
  tail: { rect: Rect; root: Point; strength: Strength } | null;
  dorsal: { rect: Rect; rootLine: [Point, Point]; strength: Strength } | null;
  lower: { rect: Rect; rootLine: [Point, Point]; strength: Strength } | null;
}
export interface RigSource { imageHash: string; sourceSize: Point; imageUrl: string; rig: FishRig | null; stale?: boolean }
export const PART_NAMES: Record<RigPart, string> = { body: '몸통 보호', tail: '꼬리', dorsal: '등 지느러미', lower: '아래 지느러미' };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
function rectWeight(x: number, y: number, [rx, ry, w, h]: Rect) {
  return smooth(Math.min((x - rx) / (w * .16), (rx + w - x) / (w * .16), (y - ry) / (h * .16), (ry + h - y) / (h * .16)));
}
export interface VertexWeight { tail: number; dorsal: number; lower: number; phase: number }
export function vertexWeight(x: number, y: number, rig: FishRig): VertexWeight {
  // Protect the entire body including its border; fade protection just outside it.
  const [bx, by, bw, bh] = rig.body.rect;
  const outside = Math.max(bx - x, x - bx - bw, by - y, y - by - bh, 0);
  const protection = smooth(outside / .035);
  let tail = 0, dorsal = 0, lower = 0, phase = 0;
  if (rig.tail) {
    const part = rig.tail;
    const distance = Math.hypot(x - part.root[0], y - part.root[1]);
    const reach = Math.max(part.rect[2], part.rect[3]);
    const free = smooth(distance / Math.max(.01, reach * .75));
    tail = rectWeight(x, y, part.rect) * free * ({ low: .5, medium: 1, high: 1.45 }[part.strength]);
    phase = distance * 7;
  }
  for (const key of ['dorsal', 'lower'] as const) {
    const part = rig[key];
    if (!part) continue;
    const [a, b] = part.rootLine;
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = clamp(((x - a[0]) * vx + (y - a[1]) * vy) / Math.max(.00001, vx * vx + vy * vy));
    const distance = Math.hypot(x - a[0] - t * vx, y - a[1] - t * vy);
    const weight = rectWeight(x, y, part.rect) * smooth(distance / Math.max(.01, part.rect[3] * .8)) * ({ low: .5, medium: 1, high: 1.45 }[part.strength]);
    if (key === 'dorsal') dorsal = weight; else lower = weight;
  }
  const norm = protection / Math.max(1, tail + dorsal + lower);
  return { tail: tail * norm, dorsal: dorsal * norm, lower: lower * norm, phase };
}
export function displacement(w: VertexWeight, time: number, fast = false): Point {
  const beat = time * (fast ? 7.5 : 4.1), amplitude = fast ? 1.25 : 1;
  return [amplitude * (.006 * w.tail * Math.sin(beat - w.phase) + .003 * w.dorsal * Math.sin(beat * .83 + 1.4)),
    amplitude * (.018 * w.tail * Math.sin(beat - w.phase) + .008 * w.dorsal * Math.sin(beat * .83 + 1.4) + .01 * w.lower * Math.sin(beat * .91 + 3.2))];
}
