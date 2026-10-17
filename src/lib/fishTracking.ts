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

// Time-based gates, followed by one display interpolation in Fish2D.
// Values are starting points for 0.4–1s input intervals, not calibrated probabilities.
export class FishTrackingFilter {
  x = .5; y = .5; angle = 0; flip = false;
  frameSize: number[] | null = null;
  lastReceived: number | null = null;
  lastPosition: number | null = null;
  lastPose: number | null = null;
  interval = 700;
  private frame: number | null = null;
  private stream: string | null = null;
  private target: string | number | null = null;
  private pending: { x: number; y: number; since: number; dx: number; dy: number } | null = null;
  private posePending: { angle: number; since: number } | null = null;
  private flipPending: { value: boolean; since: number } | null = null;
  private lost = false;
  private reacquiring = false;
  private lastRotation = 0;

  ingest(sample: FishTrackingSample, now: number) {
    // When the tank owner also opens a personal camera, do not alternate between
    // two coordinate spaces. Other devices see the same active personal stream.
    if (sample.source === 'physical' && this.stream?.startsWith('personal/') && this.lastReceived !== null && now - this.lastReceived < 4500) return false;
    const stream = `${sample.source ?? ''}/${sample.stream_id ?? ''}`;
    const restarted = stream !== this.stream || (this.lastReceived !== null && now - this.lastReceived > 5000);
    if (!restarted && sample.frame_id != null && this.frame != null && sample.frame_id <= this.frame) return false;
    const changed = restarted || (sample.track_id != null && sample.track_id !== this.target);
    if (changed) {
      this.frame = null; this.pending = null; this.posePending = null; this.flipPending = null;
      this.reacquiring = true; this.lastPose = null;
      this.frameSize = null;
    }
    if (validPoint(sample.frame_size) && sample.frame_size.every(v => v > 0)) this.frameSize = sample.frame_size;
    if (this.lastReceived !== null && !restarted) {
      this.interval = .8 * this.interval + .2 * Math.min(1500, now - this.lastReceived);
    }
    this.stream = stream;
    this.target = sample.track_id ?? this.target;
    this.frame = sample.frame_id ?? null;
    this.lastReceived = now;
    this.lost = !['tracked', 'confirmed', 'tracking'].includes(sample.state ?? 'tracked');
    if (this.lost) { this.pending = null; this.posePending = null; this.reacquiring = true; return true; }
    const p = sample.center_norm;
    const detectionOk = sample.conf == null || (Number.isFinite(sample.conf) && sample.conf > 0);
    if (validPoint(p) && p.every(v => v >= 0 && v <= 1) && detectionOk) {
      const jump = Math.hypot(p[0] - this.x, p[1] - this.y) > .22;
      const stale = this.lastPosition !== null && now - this.lastPosition > this.lossDelay();
      if (jump || this.reacquiring || stale || this.lastPosition === null) {
        const dx = this.pending ? p[0] - this.pending.x : 0, dy = this.pending ? p[1] - this.pending.y : 0;
        const distance = Math.hypot(dx, dy);
        const reversed = this.pending && distance > .08 &&
          dx * this.pending.dx + dy * this.pending.dy < -.35 * distance * Math.hypot(this.pending.dx, this.pending.dy);
        if (!this.pending || distance > .65 || reversed) {
          this.pending = { x: p[0], y: p[1], since: now, dx: 0, dy: 0 };
        } else {
          this.pending.x = p[0]; this.pending.y = p[1]; this.pending.dx = dx; this.pending.dy = dy;
          if (now - this.pending.since >= 900) {
            this.x = p[0]; this.y = p[1]; this.lastPosition = now;
            this.pending = null; this.reacquiring = false;
          }
        }
      } else {
        // A small dead band suppresses stationary detection jitter.
        if (Math.hypot(p[0] - this.x, p[1] - this.y) > .004) { this.x = p[0]; this.y = p[1]; }
        this.lastPosition = now; this.pending = null;
      }
    }
    // Old keypoints must never become a new pose when pose_conf=0 or absent.
    const head = sample.head ?? sample.keypoints?.head, tail = sample.tail ?? sample.keypoints?.tail;
    if (sample.pose_conf != null && sample.pose_conf > 0 && validPoint(head) && validPoint(tail)) {
      const dx = head[0] - tail[0], dy = head[1] - tail[1];
      const frame = sample.frame_size;
      const hasFrame = validPoint(frame) && frame.every(v => v > 0);
      // Legacy physical senders provide pixel keypoints but omit frame_size.
      // A pixel vector already preserves aspect ratio; its angle needs no frame
      // dimensions. Keep ambiguous 0–1 coordinates disabled without metadata.
      const pixelPoints = [head, tail].every(point => point.every(v => v >= 0)) &&
        (hasFrame ? [head, tail].every(point => point[0] <= frame[0] && point[1] <= frame[1]) :
          Math.max(...head, ...tail) > 1);
      if (pixelPoints && Math.hypot(dx, dy) > (hasFrame ? Math.max(2, Math.hypot(...frame) * .012) : 2)) {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (this.lastPose === null || Math.abs(deltaAngle(this.angle, angle)) > 55) {
          if (!this.posePending || Math.abs(deltaAngle(this.posePending.angle, angle)) > 35) this.posePending = { angle, since: now };
          else if (now - this.posePending.since >= 800) { this.angle = angle; this.lastPose = now; this.posePending = null; }
        } else { this.angle += deltaAngle(this.angle, angle); this.lastPose = now; this.posePending = null; }
        // Hysteresis around vertical headings avoids repeated left/right flips.
        // Observe the candidate heading during pose confirmation too, so the
        // same turn does not require two consecutive 800ms waiting periods.
        const cosine = Math.cos(angle * Math.PI / 180);
        const flip = cosine < -.22 ? true : cosine > .22 ? false : this.flip;
        if (flip !== this.flip) {
          if (this.flipPending?.value !== flip) this.flipPending = { value: flip, since: now };
          else if (now - this.flipPending.since >= 800 && this.lastPose === now && Math.abs(deltaAngle(this.angle, angle)) <= 35) { this.flip = flip; this.flipPending = null; }
        } else this.flipPending = null;
      } else this.posePending = null;
    } else { this.posePending = null; this.flipPending = null; }
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
    const angle = this.angle - (this.flip ? 180 : 0);
    this.lastRotation = Math.max(-65, Math.min(65, deltaAngle(0, angle)));
    return this.lastRotation;
  }
}
