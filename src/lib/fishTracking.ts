export interface FishTrackingSample {
  owner_user_id?: number;
  type?: string;
  center_norm?: number[] | null;
  head?: number[] | null;
  tail?: number[] | null;
  keypoints?: { head?: number[] | null; tail?: number[] | null; dorsal?: number[] | null; belly?: number[] | null };
  move_direction?: string;
  pose_direction?: string;
  state?: string;
  abnormal?: boolean;
  abnormal_reason?: string | null;
  flipped?: boolean;
  conf?: number | null;
  pose_conf?: number | null;
  frame_size?: number[] | null;
  bbox?: number[] | null;
  velocity_px_s?: number | null;
  frame_id?: number | null;
  timestamp_ms?: number | null;
  track_id?: number | string | null;
  stream_id?: string | null;
  source?: string;
  receivedAt?: number;
}
export type TrackingStatus = 'waiting' | 'tracking' | 'pose' | 'lost' | 'disconnected' | 'acquiring';
export const TRACKING_LABELS: Record<TrackingStatus, string> = {
  waiting: '추적 대기', tracking: '추적 중', pose: '자세 확인 중', lost: '추적 일시 중단',
  disconnected: '연결 확인 필요', acquiring: '대상 확인 중',
};
const validPoint = (p?: number[] | null): p is number[] => !!p && p.length === 2 && p.every(Number.isFinite);
const deltaAngle = (a: number, b: number) => ((b - a + 540) % 360) - 180;

// Match the full-frame object-fit: contain camera view without stretching paths.
export function mapTrackingPoint(x: number, y: number, frame: number[] | null, width: number, height: number) {
  if (!frame || width <= 0 || height <= 0) return [x, y];
  const scale = Math.min(width / frame[0], height / frame[1]);
  const w = frame[0] * scale, h = frame[1] * scale;
  return [((width - w) / 2 + x * w) / width, ((height - h) / 2 + y * h) / height];
}

// Pixel poses only: normalized/unknown keypoints never silently change units.
export function trackingPose(sample: FishTrackingSample) {
  const head = sample.head ?? sample.keypoints?.head, tail = sample.tail ?? sample.keypoints?.tail;
  if (!Number.isFinite(sample.pose_conf) || (sample.pose_conf ?? 0) < .25 || !validPoint(head) || !validPoint(tail)) return null;
  const frame = sample.frame_size;
  const hasFrame = validPoint(frame) && frame.every(v => v > 0);
  const pixels = [head, tail].every(p => p.every(v => v >= 0)) &&
    (hasFrame ? [head, tail].every(p => p[0] <= frame[0] && p[1] <= frame[1]) : Math.max(...head, ...tail) > 1);
  const length = Math.hypot(head[0] - tail[0], head[1] - tail[1]);
  if (!pixels || length <= (hasFrame ? Math.max(2, Math.hypot(...frame) * .012) : 2)) return null;
  return { angle: Math.atan2(head[1] - tail[1], head[0] - tail[0]) * 180 / Math.PI, length };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
const alpha = (dt: number, cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export type DepthStatus = 'collecting' | 'active' | 'holding' | 'unavailable';
export const DEPTH_LABELS: Record<DepthStatus, string> = { collecting: '기준 수집', active: '적용', holding: '유지', unavailable: '사용 불가' };

// Presentation-only relative depth. Never used for growth, activity or health.
export class FishDepthFilter {
  scale = 1;
  state: DepthStatus = 'unavailable';
  reason = '박스·영상 크기 없음';
  rawHeight: number | null = null;
  height: number | null = null;
  baseline: number | null = null;
  private heights: { h: number; at: number }[] = [];
  private candidate: { h: number; since: number; count: number } | null = null;
  private last: number | null = null;
  private pose: { angle: number; length: number; h: number } | null = null;
  private turnUntil = 0;
  reset() {
    this.scale = 1; this.state = 'unavailable'; this.reason = '새 기준 필요';
    this.rawHeight = null; this.height = null; this.baseline = null;
    this.heights = []; this.candidate = null; this.last = null; this.pose = null; this.turnUntil = 0;
  }
  hold(reason: string) { this.state = this.baseline === null ? 'unavailable' : 'holding'; this.reason = reason; }
  ingest(sample: FishTrackingSample, now: number, positionOk: boolean, turning: boolean) {
    const previous = this.last;
    const dt = clamp((now - (previous ?? now)) / 1000, .01, 1);
    this.last = now;
    if (!positionOk) { this.hold('위치·탐지 확인 중'); return; }
    const frame = sample.frame_size, box = sample.bbox;
    if (!validPoint(frame) || !frame.every(v => v > 0) || !box || box.length !== 4 || !box.every(Number.isFinite)) {
      this.hold('박스·영상 크기 없음'); return;
    }
    const [x1, y1, x2, y2] = box, [fw, fh] = frame;
    this.rawHeight = (y2 - y1) / fh;
    if (x2 <= x1 || y2 <= y1 || x1 <= fw * .008 || y1 <= fh * .008 || x2 >= fw * .992 || y2 >= fh * .992) {
      this.hold('박스 잘림·경계'); return;
    }
    const pose = trackingPose(sample), h = this.rawHeight;
    const tilted = pose && Math.abs(Math.sin(pose.angle * Math.PI / 180)) > .64;
    const rapidTurn = pose && this.pose && Math.abs(deltaAngle(this.pose.angle, pose.angle)) > 28;
    if (rapidTurn || turning) this.turnUntil = now + 650;
    const mismatch = pose && this.pose && Math.abs(Math.log((h / this.pose.h) / (pose.length / this.pose.length))) > .18;
    if (pose && !mismatch) this.pose = { ...pose, h };
    if (tilted || now < this.turnUntil || mismatch) {
      this.hold(mismatch ? '높이·몸통 길이 불일치' : '기울임·방향 전환'); return;
    }
    const windowMs = pose ? 1800 : 2600;
    this.heights = this.heights.filter(v => now - v.at <= windowMs);
    const recent = this.heights.length ? median(this.heights.map(v => v.h)) : h;
    if (Math.abs(Math.log(h / recent)) > .12) {
      if (!this.candidate || Math.abs(Math.log(h / this.candidate.h)) > .055) this.candidate = { h, since: now, count: 1 };
      else { this.candidate.h = h; this.candidate.count++; }
      if (this.candidate.count < 3 || now - this.candidate.since < (pose ? 700 : 1400)) { this.hold('높이 급변 확인 중'); return; }
      this.heights = []; this.candidate = null;
    } else this.candidate = null;
    this.heights.push({ h, at: now });
    const stableHeight = median(this.heights.map(v => v.h));
    if (this.baseline === null) {
      this.state = 'collecting'; this.reason = '안정된 높이 수집 중';
      const span = this.heights.at(-1)!.at - this.heights[0].at;
      if (this.heights.length < (pose ? 4 : 6) || span < (pose ? 1200 : 2200)) return;
      if (Math.max(...this.heights.map(v => v.h)) / Math.min(...this.heights.map(v => v.h)) > 1.08) return;
      this.baseline = stableHeight; this.height = stableHeight;
    }
    // A rate limit followed by a single slow depth filter prevents size pulses.
    const oldHeight = this.height ?? stableHeight;
    const limited = clamp(stableHeight, oldHeight * Math.exp(-.12 * dt), oldHeight * Math.exp(.12 * dt));
    this.height = oldHeight + (limited - oldHeight) * (1 - Math.exp(-dt / .65));
    const range = pose ? .1 : .04;
    const target = clamp(1 + (this.height / this.baseline - 1) * (pose ? .5 : .3), 1 - range, 1 + range);
    this.scale += clamp(target - this.scale, -.045 * dt, .045 * dt);
    this.state = 'active'; this.reason = pose ? '안정된 높이·자세' : '자세 없음 · 보수적 적용';
  }
}

// Vector One Euro: common cutoff and aspect-aware speed for both axes.
// Starting values for normalized full-frame samples; replay tuning is required.
export class FishTrackingFilter {
  x = .5; y = .5; angle = 0; flip = false; speed = 0;
  readonly depth = new FishDepthFilter();
  frameSize: number[] | null = null;
  lastReceived: number | null = null;
  lastPosition: number | null = null;
  lastPose: number | null = null;
  interval = 700;
  private frame: number | null = null;
  private stream: string | null = null;
  private target: string | number | null = null;
  private timestamp: number | null = null;
  private raw = { x: .5, y: .5 };
  private derivative = { x: 0, y: 0 };
  private pending: { x: number; y: number; since: number; dx: number; dy: number } | null = null;
  private posePending: { angle: number; since: number } | null = null;
  private flipPending: { value: boolean; since: number } | null = null;
  private lost = false;
  private reacquiring = false;
  private lastRotation = 0;

  private distance(dx: number, dy: number) {
    const aspect = this.frameSize ? this.frameSize[0] / this.frameSize[1] : 1;
    return Math.hypot(dx * aspect, dy) / Math.hypot(aspect, 1);
  }
  ingest(sample: FishTrackingSample, now: number) {
    if (!Number.isFinite(now) || (this.lastReceived !== null && now < this.lastReceived)) return false;
    if (sample.source === 'physical' && this.stream?.startsWith('personal/') && this.lastReceived !== null && now - this.lastReceived < 4500) return false;
    const stream = `${sample.source ?? ''}/${sample.stream_id ?? ''}`;
    const restarted = stream !== this.stream || (this.lastReceived !== null && now - this.lastReceived > 5000);
    const changed = restarted || (sample.track_id != null && sample.track_id !== this.target);
    const frameId = Number.isFinite(sample.frame_id) ? sample.frame_id! : null;
    const timestamp = Number.isFinite(sample.timestamp_ms) ? sample.timestamp_ms! : null;
    if (!changed && ((frameId !== null && this.frame !== null && frameId <= this.frame) ||
      (frameId === null && timestamp !== null && this.timestamp !== null && timestamp <= this.timestamp))) return false;
    const receiveDt = this.lastReceived === null ? .5 : (now - this.lastReceived) / 1000;
    const sampleDt = timestamp !== null && this.timestamp !== null ? (timestamp - this.timestamp) / 1000 : receiveDt;
    const dt = clamp(!changed && sampleDt > 0 && sampleDt <= 2.5 ? sampleDt : receiveDt, .01, 2);
    if (changed) {
      this.frame = null; this.pending = null; this.posePending = null; this.flipPending = null;
      this.reacquiring = true; this.lastPose = null; this.frameSize = null;
      this.derivative = { x: 0, y: 0 }; this.speed = 0; this.depth.reset(); this.target = null;
    }
    if (validPoint(sample.frame_size) && sample.frame_size.every(v => v > 0)) {
      if (this.frameSize && sample.frame_size.some((v, i) => v !== this.frameSize![i])) this.depth.reset();
      this.frameSize = [...sample.frame_size];
    }
    if (this.lastReceived !== null && !restarted) this.interval = .8 * this.interval + .2 * clamp(now - this.lastReceived, 1, 1500);
    this.stream = stream; this.target = sample.track_id ?? this.target;
    this.frame = frameId; this.timestamp = timestamp; this.lastReceived = now;
    if (this.lastPosition !== null && now - this.lastPosition > 5000 && this.depth.baseline !== null) this.depth.reset();
    this.lost = !['tracked', 'confirmed', 'tracking'].includes(sample.state ?? 'tracked');
    if (this.lost) {
      this.pending = null; this.posePending = null; this.flipPending = null; this.reacquiring = true; this.speed = 0;
      this.depth.hold('추적 일시 중단'); return true;
    }
    const p = sample.center_norm;
    const detectionOk = sample.conf == null || (Number.isFinite(sample.conf) && sample.conf >= .25);
    let positionOk = false;
    if (validPoint(p) && p.every(v => v >= 0 && v <= 1) && detectionOk) {
      const jump = this.distance(p[0] - this.x, p[1] - this.y) > Math.min(.4, .14 + dt * .22 + this.distance(this.derivative.x, this.derivative.y) * dt * 1.2);
      const stale = this.lastPosition !== null && now - this.lastPosition > this.lossDelay();
      if (jump || this.reacquiring || stale || this.lastPosition === null) {
        const dx = this.pending ? p[0] - this.pending.x : 0, dy = this.pending ? p[1] - this.pending.y : 0;
        const distance = this.distance(dx, dy);
        const reversed = this.pending && distance > .08 && dx * this.pending.dx + dy * this.pending.dy < -.35 * Math.hypot(dx, dy) * Math.hypot(this.pending.dx, this.pending.dy);
        if (!this.pending || distance > .65 || reversed) this.pending = { x: p[0], y: p[1], since: now, dx: 0, dy: 0 };
        else {
          this.pending.x = p[0]; this.pending.y = p[1]; this.pending.dx = dx; this.pending.dy = dy;
          if (now - this.pending.since >= clamp(this.interval * .65, 280, 650)) {
            this.x = p[0]; this.y = p[1]; this.raw = { x: p[0], y: p[1] };
            this.derivative = { x: dx / dt, y: dy / dt }; this.pending = null; this.reacquiring = false; positionOk = true;
          }
        }
      } else {
        const da = alpha(dt, 1);
        this.derivative.x += ((p[0] - this.raw.x) / dt - this.derivative.x) * da;
        this.derivative.y += ((p[1] - this.raw.y) / dt - this.derivative.y) * da;
        const speed = this.distance(this.derivative.x, this.derivative.y);
        const blend = alpha(dt, .65 + 4 * speed);
        this.x += (p[0] - this.x) * blend; this.y += (p[1] - this.y) * blend;
        this.speed += (clamp(speed / .24, 0, 1) - this.speed) * (1 - Math.exp(-dt / .6));
        this.raw = { x: p[0], y: p[1] }; this.pending = null; positionOk = true;
      }
      if (positionOk) this.lastPosition = now;
    }
    const pose = trackingPose(sample);
    if (pose && detectionOk) {
      const { angle } = pose;
      const large = Math.abs(deltaAngle(this.angle, angle)) > 55;
      if (this.lastPose === null || large) {
        if (!this.posePending || Math.abs(deltaAngle(this.posePending.angle, angle)) > 35) this.posePending = { angle, since: now };
        else if (now - this.posePending.since >= clamp(this.interval * .7, 280, 650)) { this.angle += deltaAngle(this.angle, angle); this.lastPose = now; this.posePending = null; }
      } else { this.angle += deltaAngle(this.angle, angle); this.lastPose = now; this.posePending = null; }
      const cosine = Math.cos(angle * Math.PI / 180);
      const flip = cosine < -.22 ? true : cosine > .22 ? false : this.flip;
      if (flip !== this.flip) {
        if (this.flipPending?.value !== flip) this.flipPending = { value: flip, since: now };
        else if (now - this.flipPending.since >= clamp(this.interval * .9, 380, 800) && this.lastPose === now && Math.abs(deltaAngle(this.angle, angle)) <= 35) { this.flip = flip; this.flipPending = null; }
      } else this.flipPending = null;
    } else { this.posePending = null; this.flipPending = null; }
    this.depth.ingest(sample, now, positionOk, this.flipPending !== null || this.posePending !== null);
    return true;
  }
  lossDelay() { return Math.max(2600, this.interval * 3.5); }
  status(now: number, connected = true): TrackingStatus {
    if (!connected) return 'disconnected';
    if (this.lastReceived === null) return 'waiting';
    if (now - this.lastReceived > Math.max(4500, this.interval * 6)) return 'disconnected';
    if (this.lost || (this.lastPosition !== null && now - this.lastPosition > this.lossDelay())) return 'lost';
    if (this.lastPosition === null || this.reacquiring) return 'acquiring';
    if (this.lastPose === null || now - this.lastPose > this.lossDelay()) return 'pose';
    return 'tracking';
  }
  rotation() {
    const cosine = Math.cos(this.angle * Math.PI / 180);
    if ((!this.flip && cosine < -.22) || (this.flip && cosine > .22)) return this.lastRotation;
    this.lastRotation = clamp(deltaAngle(0, this.angle - (this.flip ? 180 : 0)), -65, 65);
    return this.lastRotation;
  }
}
