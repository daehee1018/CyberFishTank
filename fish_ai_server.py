"""
계정별 웹캠 물고기 추적/자세 추론 서버.

test/server_cylinder.py (로컬 데스크톱용, 웹캠 1개 고정)의 탐지/추적/자세 로직을
그대로 가져오되:
  - cv2.imshow / cv2.VideoCapture 제거 (프레임을 브라우저에서 HTTP로 받음)
  - tracker 상태를 전역 1개가 아니라 user_id별로 분리 (동시 여러 계정 지원)

Node.js(server.cjs)가 /api/camera/frame에서 이 서버의 /infer로 프레임을 넘기고,
결과를 yolo_data에 user_id와 함께 저장한다.
"""

import base64
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from ultralytics import YOLO

DETECT_MODEL_PATH = "models/fish_detect.pt"
POSE_MODEL_PATH = "models/fish_pose.pt"

CONF_THR = 0.15
POSE_CONF_THR = 0.25
IMG_SIZE = 1280
POSE_IMG_SIZE = 640

MAX_LOST = 30
MIN_HITS = 1
MAX_MATCH_DIST = 350.0
MAX_HIST_DIST = 1.5
MIN_POSE_IOU = 0.01
DUP_IOU_THR = 0.30
DUP_CENTER_DIST = 120.0

LOW_ACTIVITY_WINDOW_SEC = 10.0
LOW_ACTIVITY_DIST_PX = 20.0
FAST_SPEED_PX_S = 500.0

# 유저별로 오래 프레임이 안 오면(브라우저 탭 닫음 등) tracker를 정리한다.
SESSION_IDLE_TIMEOUT_SEC = 300.0


# =========================================================
# Utils (test/server_cylinder.py와 동일)
# =========================================================
def center(box: np.ndarray) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return (float(x1 + x2) / 2.0, float(y1 + y2) / 2.0)


def clamp_xyxy(box, w, h):
    x1, y1, x2, y2 = box
    x1 = float(np.clip(x1, 0, w - 1))
    y1 = float(np.clip(y1, 0, h - 1))
    x2 = float(np.clip(x2, 0, w - 1))
    y2 = float(np.clip(y2, 0, h - 1))
    if x2 < x1:
        x1, x2 = x2, x1
    if y2 < y1:
        y1, y2 = y2, y1
    return np.array([x1, y1, x2, y2], dtype=np.float32)


def l2(a, b) -> float:
    return float(np.hypot(a[0] - b[0], a[1] - b[1]))


def iou(boxA, boxB) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter = inter_w * inter_h
    areaA = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    areaB = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
    denom = areaA + areaB - inter
    return 0.0 if denom <= 1e-6 else float(inter / denom)


def normalize_center(box: np.ndarray, w: int, h: int):
    cx, cy = center(box)
    return cx / float(w), cy / float(h)


def get_direction(dx: float, dy: float, min_move: float = 3.0) -> str:
    if abs(dx) < min_move and abs(dy) < min_move:
        return "stop"
    horiz = "right" if dx > min_move else "left" if dx < -min_move else ""
    vert = "down" if dy > min_move else "up" if dy < -min_move else ""
    if horiz and vert:
        return f"{horiz}_{vert}"
    return horiz or vert or "stop"


def crop_box(frame, box) -> Optional[np.ndarray]:
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(frame.shape[1] - 1, x2), min(frame.shape[0] - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2]


def hsv_hist_feat(frame, box, h_bins=24, s_bins=24) -> Optional[np.ndarray]:
    roi = crop_box(frame, box)
    if roi is None or roi.size == 0:
        return None
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [h_bins, s_bins], [0, 180, 0, 256])
    hist = cv2.normalize(hist, hist).flatten()
    n = np.linalg.norm(hist)
    if n > 1e-8:
        hist = hist / n
    return hist.astype(np.float32)


def hist_dist(a: Optional[np.ndarray], b: Optional[np.ndarray]) -> float:
    if a is None or b is None:
        return 0.5
    return float(cv2.compareHist(a.astype(np.float32), b.astype(np.float32), cv2.HISTCMP_BHATTACHARYYA))


def pose_direction(head, tail) -> str:
    if head is None or tail is None:
        return "unknown"
    return get_direction(float(head[0] - tail[0]), float(head[1] - tail[1]), min_move=1.0)


def pose_length_px(head, tail) -> Optional[float]:
    if head is None or tail is None:
        return None
    return float(np.hypot(head[0] - tail[0], head[1] - tail[1]))


def is_flipped(dorsal, belly) -> Optional[bool]:
    if dorsal is None or belly is None:
        return None
    return bool(float(dorsal[1]) > float(belly[1]))


# =========================================================
# Kalman filter / Track / MultiTracker (원본과 동일)
# =========================================================
class SimpleKF:
    def __init__(self, box: np.ndarray):
        cx, cy = center(box)
        bw = max(2.0, box[2] - box[0])
        bh = max(2.0, box[3] - box[1])
        self.x = np.array([[cx], [cy], [0.0], [0.0], [bw], [bh]], dtype=np.float32)
        self.F = np.array([
            [1, 0, 1, 0, 0, 0],
            [0, 1, 0, 1, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 1],
        ], dtype=np.float32)
        self.H = np.array([
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 1],
        ], dtype=np.float32)
        self.P = np.eye(6, dtype=np.float32) * 50.0
        self.Q = np.eye(6, dtype=np.float32) * 1.0
        self.R = np.eye(4, dtype=np.float32) * 10.0

    def predict(self):
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return self.get_box()

    def update(self, box: np.ndarray):
        cx, cy = center(box)
        bw = max(2.0, box[2] - box[0])
        bh = max(2.0, box[3] - box[1])
        z = np.array([[cx], [cy], [bw], [bh]], dtype=np.float32)
        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        self.P = (np.eye(6, dtype=np.float32) - K @ self.H) @ self.P
        return self.get_box()

    def get_box(self):
        cx = float(self.x[0, 0])
        cy = float(self.x[1, 0])
        bw = max(2.0, float(self.x[4, 0]))
        bh = max(2.0, float(self.x[5, 0]))
        return np.array([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], dtype=np.float32)


@dataclass
class Track:
    tid: int
    box: np.ndarray
    hist_feat: Optional[np.ndarray] = None
    pred_box: Optional[np.ndarray] = None
    age: int = 1
    hits: int = 1
    lost: int = 0
    state: str = "tracked"
    kf: Optional[SimpleKF] = None
    selected: bool = False
    last_conf: float = 0.0

    head: Optional[np.ndarray] = None
    dorsal: Optional[np.ndarray] = None
    tail: Optional[np.ndarray] = None
    belly: Optional[np.ndarray] = None
    pose_conf: float = 0.0
    pose_direction: str = "unknown"
    flipped: Optional[bool] = None
    body_length_px: Optional[float] = None

    history: List[Dict[str, Any]] = field(default_factory=list)
    distance_total: float = 0.0
    velocity_px_s: float = 0.0
    direction: str = "stop"
    abnormal: bool = False
    abnormal_reason: str = "normal"

    def __post_init__(self):
        if self.kf is None:
            self.kf = SimpleKF(self.box)
        if self.pred_box is None:
            self.pred_box = self.box.copy()

    def predict(self, w, h):
        self.pred_box = clamp_xyxy(self.kf.predict(), w, h)
        return self.pred_box

    def update(self, det, frame, w, h):
        det_box = clamp_xyxy(det["bbox"], w, h)
        self.box = clamp_xyxy(self.kf.update(det_box), w, h)
        self.pred_box = self.box.copy()
        self.age += 1
        self.hits += 1
        self.lost = 0
        self.state = "tracked"
        self.last_conf = det["conf"]
        new_hist = hsv_hist_feat(frame, self.box)
        if self.hist_feat is None:
            self.hist_feat = new_hist
        elif new_hist is not None:
            self.hist_feat = 0.85 * self.hist_feat + 0.15 * new_hist

    def update_pose(self, pose: Optional[Dict[str, Any]]):
        if pose is None:
            self.pose_conf = 0.0
            self.pose_direction = "unknown"
            self.flipped = None
            self.body_length_px = None
            return
        self.head = pose["head"]
        self.dorsal = pose["dorsal"]
        self.tail = pose["tail"]
        self.belly = pose["belly"]
        self.pose_conf = float(pose["conf"])
        self.pose_direction = pose_direction(self.head, self.tail)
        self.flipped = is_flipped(self.dorsal, self.belly)
        self.body_length_px = pose_length_px(self.head, self.tail)

    def mark_lost(self):
        self.age += 1
        self.lost += 1
        self.state = "lost" if self.lost <= MAX_LOST else "removed"

    def confirmed(self):
        return self.hits >= MIN_HITS

    def update_motion(self, frame_id: int, timestamp: float, w: int, h: int):
        cx, cy = center(self.box)
        if len(self.history) > 0:
            prev = self.history[-1]
            px, py = prev["center_px"]
            dt = max(1e-6, timestamp - prev["time"])
            dx, dy = cx - px, cy - py
            dist = float(np.hypot(dx, dy))
            self.distance_total += dist
            self.velocity_px_s = dist / dt
            self.direction = get_direction(dx, dy)
        self.history.append({
            "frame_id": int(frame_id),
            "time": float(timestamp),
            "center_px": [float(cx), float(cy)],
        })
        self.history = [p for p in self.history if timestamp - p["time"] <= LOW_ACTIVITY_WINDOW_SEC]

    def distance_recent(self, seconds: float = 10.0) -> float:
        if len(self.history) < 2:
            return 0.0
        now = self.history[-1]["time"]
        pts = [p for p in self.history if now - p["time"] <= seconds]
        total = 0.0
        for i in range(1, len(pts)):
            x1, y1 = pts[i - 1]["center_px"]
            x2, y2 = pts[i]["center_px"]
            total += float(np.hypot(x2 - x1, y2 - y1))
        return total


def detect_abnormal_behavior(t: Track):
    recent_dist = t.distance_recent(LOW_ACTIVITY_WINDOW_SEC)
    if t.state == "lost":
        t.abnormal = True
        t.abnormal_reason = "target_lost"
    elif t.flipped is True:
        t.abnormal = True
        t.abnormal_reason = "flipped_pose"
    elif t.velocity_px_s > FAST_SPEED_PX_S:
        t.abnormal = True
        t.abnormal_reason = "sudden_fast_movement"
    elif len(t.history) >= 5 and recent_dist < LOW_ACTIVITY_DIST_PX:
        t.abnormal = True
        t.abnormal_reason = "low_activity"
    else:
        t.abnormal = False
        t.abnormal_reason = "normal"


def match_score(track: Track, det, frame):
    det_box = det["bbox"]
    pred_box = track.pred_box if track.pred_box is not None else track.box
    dist_c = l2(center(pred_box), center(det_box))
    iou_score = iou(pred_box, det_box)
    hdist = hist_dist(track.hist_feat, hsv_hist_feat(frame, det_box))
    if dist_c > MAX_MATCH_DIST or hdist > MAX_HIST_DIST:
        return 1e9
    return float(dist_c + hdist * 80.0 + (1.0 - iou_score) * 40.0 - det["conf"] * 10.0)


def greedy_match(tracks, dets, frame):
    pairs = [(match_score(t, d, frame), ti, di) for ti, t in enumerate(tracks) for di, d in enumerate(dets)]
    pairs.sort(key=lambda x: x[0])
    used_t, used_d, matches = set(), set(), []
    for s, ti, di in pairs:
        if s >= 1e8 or ti in used_t or di in used_d:
            continue
        used_t.add(ti)
        used_d.add(di)
        matches.append((ti, di))
    return matches, [i for i in range(len(tracks)) if i not in used_t], [i for i in range(len(dets)) if i not in used_d]


def find_duplicate_or_recovery_track(tracks: List["Track"], box: np.ndarray) -> Optional["Track"]:
    best_t = None
    best_score = 1e9
    for t in tracks:
        if t.state == "removed":
            continue
        overlap = iou(box, t.box)
        dist = l2(center(box), center(t.box))
        if overlap >= DUP_IOU_THR or dist <= DUP_CENTER_DIST:
            score = dist - overlap * 100.0 + t.lost * 2.0
            if score < best_score:
                best_score = score
                best_t = t
    return best_t


class MultiTracker:
    def __init__(self):
        self.tracks: List[Track] = []
        self.next_id = 1
        self.last_seen = time.time()

    def predict_all(self, w, h):
        for t in self.tracks:
            if t.state != "removed":
                t.predict(w, h)

    def update(self, dets, frame):
        h, w = frame.shape[:2]
        active_tracks = [t for t in self.tracks if t.state != "removed"]
        matches, unmatched_tracks_idx, unmatched_dets_idx = greedy_match(active_tracks, dets, frame)
        for ti, di in matches:
            active_tracks[ti].update(dets[di], frame, w, h)
        for ti in unmatched_tracks_idx:
            t = active_tracks[ti]
            t.mark_lost()
            if t.state != "removed":
                t.box = t.pred_box.copy()
        for di in unmatched_dets_idx:
            d = dets[di]
            box = clamp_xyxy(d["bbox"], w, h)
            recovery_t = find_duplicate_or_recovery_track(self.tracks, box)
            if recovery_t is not None:
                recovery_t.update({"bbox": box, "conf": d["conf"]}, frame, w, h)
                continue
            self.tracks.append(Track(tid=self.next_id, box=box, hist_feat=hsv_hist_feat(frame, box), last_conf=d["conf"]))
            self.next_id += 1
        self.tracks = [t for t in self.tracks if not (t.state == "removed" and t.lost > MAX_LOST + 5)]

    def visible_tracks(self):
        return [t for t in self.tracks if t.state == "tracked" or (t.state == "lost" and t.confirmed())]

    def tracked_tracks(self):
        return [t for t in self.tracks if t.state == "tracked"]

    def get_track_by_id(self, tid):
        for t in self.tracks:
            if t.tid == tid:
                return t
        return None

    def auto_select_target(self, selected_tid):
        if selected_tid is None:
            tracked = self.tracked_tracks()
            return tracked[-1].tid if tracked else None
        current = self.get_track_by_id(selected_tid)
        if current is not None and current.state in ["tracked", "lost"]:
            return selected_tid
        tracked = self.tracked_tracks()
        if tracked:
            return tracked[-1].tid
        visible = self.visible_tracks()
        if visible:
            return visible[-1].tid
        return None


# =========================================================
# 모델 로드 (프로세스당 1번)
# =========================================================
print("[INFO] loading detection model:", DETECT_MODEL_PATH)
detect_model = YOLO(DETECT_MODEL_PATH)
print("[INFO] loading pose model:", POSE_MODEL_PATH)
pose_model = YOLO(POSE_MODEL_PATH)


def detect_fish(frame):
    results = detect_model.predict(frame, conf=CONF_THR, imgsz=IMG_SIZE, iou=0.4, max_det=1, verbose=False)
    r = results[0]
    dets = []
    if r.boxes is None or len(r.boxes) == 0:
        return dets
    xyxy = r.boxes.xyxy.detach().cpu().numpy()
    confs = r.boxes.conf.detach().cpu().numpy()
    for b, c in zip(xyxy, confs):
        dets.append({"bbox": np.array(b, dtype=np.float32), "conf": float(c)})
    return dets


def infer_pose_candidates(frame):
    results = pose_model.predict(frame, conf=POSE_CONF_THR, imgsz=POSE_IMG_SIZE, iou=0.4, max_det=10, verbose=False)
    r = results[0]
    poses = []
    if r.boxes is None or len(r.boxes) == 0 or r.keypoints is None:
        return poses
    boxes = r.boxes.xyxy.detach().cpu().numpy()
    confs = r.boxes.conf.detach().cpu().numpy()
    kxy = r.keypoints.xy.detach().cpu().numpy()
    for box, conf, kp in zip(boxes, confs, kxy):
        if kp.shape[0] < 4:
            continue
        poses.append({
            "bbox": np.array(box, dtype=np.float32),
            "conf": float(conf),
            "head": np.array(kp[0], dtype=np.float32),
            "dorsal": np.array(kp[1], dtype=np.float32),
            "tail": np.array(kp[2], dtype=np.float32),
            "belly": np.array(kp[3], dtype=np.float32),
        })
    return poses


def select_pose_for_track(track_box, pose_candidates):
    best_pose = None
    best_iou = -1.0
    for p in pose_candidates:
        v = iou(track_box, p["bbox"])
        if v > best_iou:
            best_iou = v
            best_pose = p
    if best_pose is None or best_iou < MIN_POSE_IOU:
        return None
    return best_pose


def pt_or_none(p):
    return None if p is None else [float(p[0]), float(p[1])]


def make_payload(t: Track, frame_id: int, w: int, h: int):
    nx, ny = normalize_center(t.box, w, h)
    cx, cy = center(t.box)
    return {
        "frame_id": int(frame_id),
        "timestamp": time.time(),
        "track_id": int(t.tid),
        "state": t.state,
        "bbox": [float(x) for x in t.box.tolist()],
        "center_px": [float(cx), float(cy)],
        "center_norm": [float(nx), float(ny)],
        "move_direction": t.direction,
        "pose_direction": t.pose_direction,
        "velocity_px_s": float(t.velocity_px_s),
        "distance_px_total": float(t.distance_total),
        "abnormal": bool(t.abnormal),
        "abnormal_reason": t.abnormal_reason,
        "conf": float(t.last_conf),
        "pose_conf": float(t.pose_conf),
        "keypoints": {
            "head": pt_or_none(t.head),
            "dorsal": pt_or_none(t.dorsal),
            "tail": pt_or_none(t.tail),
            "belly": pt_or_none(t.belly),
        },
        "flipped": t.flipped,
        "body_length_px": t.body_length_px,
    }


# =========================================================
# 유저별 세션 상태
# =========================================================
class UserSession:
    def __init__(self):
        self.tracker = MultiTracker()
        self.selected_tid: Optional[int] = None
        self.frame_id = 0
        self.last_seen = time.time()


sessions: Dict[str, UserSession] = {}


def get_session(user_id: str) -> UserSession:
    now = time.time()
    # 너무 오래 방치된 세션은 정리 (메모리 누수 방지)
    stale = [uid for uid, s in sessions.items() if now - s.last_seen > SESSION_IDLE_TIMEOUT_SEC]
    for uid in stale:
        del sessions[uid]

    session = sessions.get(user_id)
    if session is None:
        session = UserSession()
        sessions[user_id] = session
    session.last_seen = now
    return session


# =========================================================
# FastAPI
# =========================================================
app = FastAPI()


class FrameRequest(BaseModel):
    user_id: str
    image: str  # base64 JPEG (data URL prefix 있어도/없어도 됨)


@app.get("/health")
def health():
    return {"status": "ok", "active_sessions": len(sessions)}


@app.post("/infer")
def infer(req: FrameRequest):
    b64 = req.image.split(",")[-1]
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return {"success": False, "error": "invalid_image"}

    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"success": False, "error": "decode_failed"}

    h, w = frame.shape[:2]
    session = get_session(req.user_id)
    session.frame_id += 1
    timestamp = time.time()

    session.tracker.predict_all(w, h)

    dets = detect_fish(frame)
    for d in dets:
        d["bbox"] = clamp_xyxy(d["bbox"], w, h)
    session.tracker.update(dets, frame)

    pose_candidates = infer_pose_candidates(frame)
    for p in pose_candidates:
        p["bbox"] = clamp_xyxy(p["bbox"], w, h)

    session.selected_tid = session.tracker.auto_select_target(session.selected_tid)

    payload = None
    for t in session.tracker.visible_tracks():
        if t.tid == session.selected_tid:
            t.update_motion(session.frame_id, timestamp, w, h)
            pose = select_pose_for_track(t.box, pose_candidates)
            t.update_pose(pose)
            detect_abnormal_behavior(t)
            payload = make_payload(t, session.frame_id, w, h)
            break

    return {"success": True, "fish": payload}
