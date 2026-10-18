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

export const createSwimMotion = () => ({ phase: 0, activity: 0 });
export function advanceSwimMotion(motion: ReturnType<typeof createSwimMotion>, activity: number, dt: number) {
  dt = Math.max(0, Math.min(.1, dt));
  const target = clamp(activity);
  motion.activity += (target - motion.activity) * (1 - Math.exp(-dt / (target > motion.activity ? .28 : .45)));
  // Detection jitter should not look like active swimming. Idle fins breathe
  // slowly; only observed movement increases the stroke frequency.
  const effort = smooth((motion.activity - .025) / .65);
  motion.phase += dt * (1.8 + effort * 5.7);
}
function rectWeight(x: number, y: number, [rx, ry, w, h]: Rect) {
  // Feather outside the selection: pinning its border traps the fin outline
  // while the interior stretches. A small halo keeps the connected mesh smooth.
  const feather = Math.min(.035, Math.max(.012, Math.min(w, h) * .16));
  const outside = Math.max(rx - x, x - rx - w, ry - y, y - ry - h, 0);
  return 1 - smooth(outside / feather);
}
export interface VertexWeight {
  tail: number; dorsal: number; lower: number; phase: number;
  dorsalPhase: number; lowerPhase: number; direction: number;
}
export function vertexWeight(x: number, y: number, rig: FishRig): VertexWeight {
  // Protect the entire body including its border; fade protection just outside it.
  const [bx, by, bw, bh] = rig.body.rect;
  const outside = Math.max(bx - x, x - bx - bw, by - y, y - by - bh, 0);
  const protection = smooth(outside / .035);
  let tail = 0, dorsal = 0, lower = 0, phase = 0, dorsalPhase = 0, lowerPhase = 0;
  const direction = rig.facing === 'right' ? 1 : -1;
  const aspect = rig.sourceSize[0] / rig.sourceSize[1];
  if (rig.tail) {
    const part = rig.tail;
    const distance = Math.hypot(x - part.root[0], (y - part.root[1]) / aspect);
    const reach = Math.max(part.rect[2], part.rect[3] / aspect);
    const free = smooth(distance / Math.max(.01, reach * .75));
    tail = rectWeight(x, y, part.rect) * free * ({ low: .5, medium: 1, high: 1.45 }[part.strength]);
    // Delay travels away from the body, rather than radiating in circles.
    phase = clamp((part.root[0] - x) * direction / Math.max(.01, part.rect[2])) * 2.2;
  }
  for (const key of ['dorsal', 'lower'] as const) {
    const part = rig[key];
    if (!part) continue;
    const [a, b] = part.rootLine;
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = clamp(((x - a[0]) * vx + (y - a[1]) * vy) / Math.max(.00001, vx * vx + vy * vy));
    const distance = Math.hypot(x - a[0] - t * vx, y - a[1] - t * vy);
    const free = clamp(distance / Math.max(.01, part.rect[3] * .8));
    const weight = rectWeight(x, y, part.rect) * smooth(free) * ({ low: .5, medium: 1, high: 1.45 }[part.strength]);
    const lag = free * 1.8 + t * .65;
    if (key === 'dorsal') { dorsal = weight; dorsalPhase = lag; }
    else { lower = weight; lowerPhase = lag; }
  }
  const norm = protection / Math.max(1, tail + dorsal + lower);
  return { tail: tail * norm, dorsal: dorsal * norm, lower: lower * norm, phase, dorsalPhase, lowerPhase, direction };
}
export function displacement(w: VertexWeight, time: number, fast = false, activity = 0): Point {
  const beat = time * (fast ? 7.5 : 4.1);
  const effort = fast ? 1 : smooth((activity - .025) / .65);
  const amplitude = .2 + effort * .95;
  const tail = beat - w.phase;
  const dorsal = beat * .83 - w.dorsalPhase + 1.4;
  const lower = beat * .91 - w.lowerPhase + 3.2;
  // A small second harmonic and delayed fin tips avoid moving each region
  // like a rigid paddle. Keep vertical stretch modest for broad betta fins.
  return [w.direction * amplitude * (.003 * w.tail * Math.cos(tail * 2) + .002 * w.dorsal * Math.sin(dorsal) + .0015 * w.lower * Math.sin(lower)),
    amplitude * (.014 * w.tail * (.88 * Math.sin(tail) + .12 * Math.sin(tail * 2 + .7)) + .005 * w.dorsal * Math.sin(dorsal) + .006 * w.lower * Math.sin(lower))];
}

// Used by both keyboard and pointer moves, including clamped boundary moves.
export function moveRigPart(rig: FishRig, key: RigPart, x: number, y: number): FishRig {
  const part = rig[key];
  if (!part) return rig;
  const [px, py, w, h] = part.rect;
  const nx = Math.max(0, Math.min(1 - w, x)), ny = Math.max(0, Math.min(1 - h, y));
  const move = ([ax, ay]: Point): Point => [clamp(ax + nx - px), clamp(ay + ny - py)];
  return { ...rig, [key]: { ...part, rect: [nx, ny, w, h],
    ...('root' in part ? { root: move(part.root) } : {}),
    ...('rootLine' in part ? { rootLine: part.rootLine.map(move) } : {}),
  } } as FishRig;
}
