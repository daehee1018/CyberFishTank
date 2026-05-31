import os
import cv2
import json
import time
import socket
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict, Any

import numpy as np
from ultralytics import YOLO


# =========================================================
# Config
# =========================================================
# 기존 Detection 모델: tracking / ID 유지용
DETECT_MODEL_PATH = r"C:\Users\jsh14\Desktop\s\runs\detect\fish_real_v2\weights\best.pt"
DETECT_FALLBACK_MODEL = "yolov8n.pt"

# 새 YOLO Pose 모델: head/dorsal/tail/belly 추정용
POSE_MODEL_PATH = r"C:\Users\jsh14\Desktop\CyberFishTank\runs\pose\runs\fish_pose-6\weights\best.pt"
POSE_FALLBACK_MODEL = None

VIDEO_SOURCE = 0
# VIDEO_SOURCE = "http://192.168.31.14:8080/video"

# tracking 안정성을 위해 detection threshold는 낮게 둔다.
# 너무 높으면 순간 blur/반사 때 box가 사라지고 ID switch가 늘어남.
CONF_THR = 0.15
POSE_CONF_THR = 0.25
IMG_SIZE = 1280
POSE_IMG_SIZE = 640

DETECT_EVERY = 3

# pose는 tracking에 관여하지 않음. selected target의 자세 분석용으로만 주기적으로 실행.
# FPS 저하가 있으면 5~10으로 올리기.
POSE_EVERY = 3
USE_POSE = True

# lost를 너무 짧게 잡으면 detector miss 때 바로 새 ID가 생김.
MAX_LOST = 30
MIN_HITS = 1

# detector bbox가 흔들려도 기존 ID에 다시 붙도록 완화
MAX_MATCH_DIST = 350.0
MAX_HIST_DIST = 1.5

# pose box와 tracking box 매칭 기준
MIN_POSE_IOU = 0.01

# 같은 물고기에 중복 track이 생기는 것을 막는 기준
DUP_IOU_THR = 0.30
DUP_CENTER_DIST = 120.0
WINDOW_NAME = "Fish Tracking + Pose + App Payload"

SEND_UDP = False
UDP_IP = "127.0.0.1"
UDP_PORT = 9999

# Web app으로 selected target payload를 HTTP POST 전송
SEND_HTTP = True
HTTP_URL = "http://localhost:80/posi"
HTTP_TIMEOUT_SEC = 0.2

LOW_ACTIVITY_WINDOW_SEC = 10.0
LOW_ACTIVITY_DIST_PX = 20.0
FAST_SPEED_PX_S = 500.0

PRINT_PAYLOAD = True
PRINT_EVERY_N_FRAMES = 10

# cm 환산값이 있으면 입력. 예: 0.03이면 1px=0.03cm. 모르면 None 유지.
PIXEL_TO_CM = None


# =========================================================
# Utils
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


def point_in_box(x, y, box) -> bool:
    x1, y1, x2, y2 = box
    return x1 <= x <= x2 and y1 <= y <= y2


def get_direction(dx: float, dy: float, min_move: float = 3.0) -> str:
    if abs(dx) < min_move and abs(dy) < min_move:
        return "stop"
    horiz = "right" if dx > min_move else "left" if dx < -min_move else ""
    vert = "down" if dy > min_move else "up" if dy < -min_move else ""
    if horiz and vert:
        return f"{horiz}_{vert}"
    return horiz or vert or "stop"


# =========================================================
# Appearance
# =========================================================
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


# =========================================================
# Simple Kalman Filter
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


# =========================================================
# Models / Detection / Pose
# =========================================================
def load_yolo_model(path: Optional[str], fallback: Optional[str], name: str):
    if path and os.path.isfile(path):
        print(f"[INFO] {name} model loaded: {path}")
        return YOLO(path)
    if path and os.path.isdir(path):
        guess = os.path.join(path, "weights", "best.pt")
        if os.path.isfile(guess):
            print(f"[INFO] {name} model loaded: {guess}")
            return YOLO(guess)
    if fallback is not None:
        print(f"[WARN] {name} model not found: {path}")
        print(f"[INFO] {name} fallback model loaded: {fallback}")
        return YOLO(fallback)
    raise FileNotFoundError(f"{name} model not found: {path}")


def load_models():
    return (
        load_yolo_model(DETECT_MODEL_PATH, DETECT_FALLBACK_MODEL, "Detection"),
        load_yolo_model(POSE_MODEL_PATH, POSE_FALLBACK_MODEL, "Pose"),
    )


def detect_fish(model, frame):
    results = model.predict(frame, conf=CONF_THR, imgsz=IMG_SIZE, iou=0.4, max_det=1, verbose=False)
    r = results[0]
    dets = []
    if r.boxes is None or len(r.boxes) == 0:
        return dets
    xyxy = r.boxes.xyxy.detach().cpu().numpy()
    confs = r.boxes.conf.detach().cpu().numpy()
    clss = r.boxes.cls.detach().cpu().numpy().astype(int)
    for b, c, k in zip(xyxy, confs, clss):
        if os.path.isfile(DETECT_MODEL_PATH) and k != 0:
            continue
        dets.append({"bbox": np.array(b, dtype=np.float32), "conf": float(c), "cls": int(k)})
    return dets


def infer_pose_candidates(pose_model, frame):
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


def select_pose_for_track(track_box: np.ndarray, pose_candidates: List[Dict[str, Any]]):
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


def pose_direction(head: Optional[np.ndarray], tail: Optional[np.ndarray]) -> str:
    if head is None or tail is None:
        return "unknown"
    return get_direction(float(head[0] - tail[0]), float(head[1] - tail[1]), min_move=1.0)


def pose_length_px(head: Optional[np.ndarray], tail: Optional[np.ndarray]) -> Optional[float]:
    if head is None or tail is None:
        return None
    return float(np.hypot(head[0] - tail[0], head[1] - tail[1]))


def is_flipped(dorsal: Optional[np.ndarray], belly: Optional[np.ndarray]) -> Optional[bool]:
    if dorsal is None or belly is None:
        return None
    return bool(float(dorsal[1]) > float(belly[1]))


# =========================================================
# Track
# =========================================================
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
    body_length_cm: Optional[float] = None

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
            self.body_length_cm = None
            return
        self.head = pose["head"]
        self.dorsal = pose["dorsal"]
        self.tail = pose["tail"]
        self.belly = pose["belly"]
        self.pose_conf = float(pose["conf"])
        self.pose_direction = pose_direction(self.head, self.tail)
        self.flipped = is_flipped(self.dorsal, self.belly)
        self.body_length_px = pose_length_px(self.head, self.tail)
        self.body_length_cm = None if (self.body_length_px is None or PIXEL_TO_CM is None) else self.body_length_px * PIXEL_TO_CM

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
            "center_norm": [float(cx / w), float(cy / h)],
            "state": self.state,
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


# =========================================================
# Behavior / Matching / Tracker
# =========================================================
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
    """
    새 detection이 기존 track과 충분히 겹치거나 가까우면 새 ID를 만들지 않고
    기존 track으로 복구한다. Pose와 무관한 tracking 안정화 로직.
    """
    best_t = None
    best_score = 1e9

    for t in tracks:
        if t.state == "removed":
            continue

        overlap = iou(box, t.box)
        dist = l2(center(box), center(t.box))

        # 같은 물고기로 볼 수 있으면 후보
        if overlap >= DUP_IOU_THR or dist <= DUP_CENTER_DIST:
            # IoU는 클수록 좋고, 거리는 작을수록 좋음
            score = dist - overlap * 100.0 + t.lost * 2.0
            if score < best_score:
                best_score = score
                best_t = t

    return best_t


class MultiTracker:
    def __init__(self):
        self.tracks: List[Track] = []
        self.next_id = 1

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

            # 새 ID를 만들기 전에 기존 track과 같은 물체인지 먼저 확인
            recovery_t = find_duplicate_or_recovery_track(self.tracks, box)
            if recovery_t is not None:
                recovery_t.update({"bbox": box, "conf": d["conf"]}, frame, w, h)
                continue

            self.tracks.append(
                Track(
                    tid=self.next_id,
                    box=box,
                    hist_feat=hsv_hist_feat(frame, box),
                    last_conf=d["conf"]
                )
            )
            self.next_id += 1

        self.tracks = [t for t in self.tracks if not (t.state == "removed" and t.lost > MAX_LOST + 5)]

    def visible_tracks(self):
        return [t for t in self.tracks if t.state == "tracked" or (t.state == "lost" and t.confirmed())]

    def tracked_tracks(self):
        return [t for t in self.tracks if t.state == "tracked"]

    def choose_by_click(self, xy):
        if xy is None:
            return None
        for t in reversed(self.visible_tracks()):
            if point_in_box(xy[0], xy[1], t.box):
                return t.tid
        return None

    def set_selected(self, selected_tid):
        for t in self.tracks:
            t.selected = (t.tid == selected_tid)

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
            new_tid = tracked[-1].tid
            print(f"[INFO] target lost/removed -> reassigned to ID {new_tid}")
            return new_tid
        visible = self.visible_tracks()
        if visible:
            new_tid = visible[-1].tid
            print(f"[INFO] target lost/removed -> reassigned to ID {new_tid}")
            return new_tid
        return None


# =========================================================
# Mouse / Draw / Payload
# =========================================================
clicked_point = None


def mouse_callback(event, x, y, flags, param):
    global clicked_point
    if event == cv2.EVENT_LBUTTONDOWN:
        clicked_point = (x, y)


def draw_pose(frame, t: Track):
    pts = {
        "H": t.head,
        "D": t.dorsal,
        "T": t.tail,
        "B": t.belly,
    }
    colors = {"H": (0, 255, 0), "D": (0, 255, 255), "T": (255, 0, 255), "B": (255, 0, 0)}
    for name, p in pts.items():
        if p is None:
            continue
        x, y = int(p[0]), int(p[1])
        cv2.circle(frame, (x, y), 5, colors[name], -1)
        cv2.putText(frame, name, (x + 5, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colors[name], 2)
    if t.head is not None and t.tail is not None:
        cv2.arrowedLine(frame, (int(t.tail[0]), int(t.tail[1])), (int(t.head[0]), int(t.head[1])), (255, 255, 0), 2, tipLength=0.25)
    return frame


def draw_track(frame, t: Track):
    x1, y1, x2, y2 = [int(v) for v in t.box]
    cx, cy = center(t.box)
    if t.selected and t.state == "tracked":
        color, thickness = (0, 255, 255), 3
    elif t.selected and t.state == "lost":
        color, thickness = (0, 165, 255), 2
    elif t.state == "tracked":
        color, thickness = (0, 255, 0), 2
    else:
        color, thickness = (0, 120, 255), 2
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
    cv2.circle(frame, (int(cx), int(cy)), 4, (0, 0, 255), -1)
    label = f"ID {t.tid} | {t.state.upper()}"
    if t.selected:
        label = "[TARGET] " + label
    cv2.putText(frame, label, (x1, max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    cv2.putText(frame, f"move:{t.direction} pose:{t.pose_direction}", (x1, min(frame.shape[0] - 5, y2 + 18)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 2)
    if t.selected:
        length_txt = "None" if t.body_length_px is None else f"{t.body_length_px:.1f}px"
        flip_txt = "None" if t.flipped is None else str(t.flipped)
        cv2.putText(frame, f"flip:{flip_txt} len:{length_txt} abnormal:{t.abnormal_reason}", (x1, min(frame.shape[0] - 5, y2 + 40)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255) if t.abnormal else (255, 255, 255), 2)
        frame = draw_pose(frame, t)
    return frame


def draw_info(frame, selected_tid, detect_now, pose_now, fps):
    lines = [
        f"Selected target ID: {selected_tid if selected_tid is not None else 'None'}",
        f"Detect now: {detect_now} | Pose now: {pose_now}",
        f"FPS: {fps:.1f}",
        "Keys: q=quit, r=reset target"
    ]
    y = 25
    for line in lines:
        cv2.putText(frame, line, (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        y += 25
    return frame


def send_udp(sock, payload: dict):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sock.sendto(data, (UDP_IP, UDP_PORT))


def send_http_post(payload: dict):
    """
    selected target payload를 localhost:80/posisson으로 POST 전송한다.
    서버가 잠깐 응답하지 않아도 tracking loop가 크게 멈추지 않도록 timeout을 짧게 둔다.
    """
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        HTTP_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as res:
            # 응답 body는 사용하지 않음. 2xx 응답이면 성공으로 간주.
            _ = res.status
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        # 서버가 꺼져 있거나 연결이 안 되어도 영상/추적은 계속 진행
        if PRINT_PAYLOAD:
            print(f"[WARN] HTTP POST failed: {e}")


def _pt_or_none(p):
    return None if p is None else [float(p[0]), float(p[1])]


def make_payload(t: Track, frame_id: int, w: int, h: int):
    nx, ny = normalize_center(t.box, w, h)
    cx, cy = center(t.box)
    return {
        "frame_id": int(frame_id),
        "timestamp": time.time(),
        "track_id": int(t.tid),
        "state": t.state,
        "selected": bool(t.selected),
        "bbox": [float(x) for x in t.box.tolist()],
        "center_px": [float(cx), float(cy)],
        "center_norm": [float(nx), float(ny)],
        "move_direction": t.direction,
        "pose_direction": t.pose_direction,
        "velocity_px_s": float(t.velocity_px_s),
        "distance_px_total": float(t.distance_total),
        "distance_px_10s": float(t.distance_recent(10.0)),
        "abnormal": bool(t.abnormal),
        "abnormal_reason": t.abnormal_reason,
        "conf": float(t.last_conf),
        "pose_conf": float(t.pose_conf),
        "keypoints": {
            "head": _pt_or_none(t.head),
            "dorsal": _pt_or_none(t.dorsal),
            "tail": _pt_or_none(t.tail),
            "belly": _pt_or_none(t.belly),
        },
        "flipped": t.flipped,
        "body_length_px": t.body_length_px,
        "body_length_cm": t.body_length_cm,
    }


# =========================================================
# Main
# =========================================================
def main():
    global clicked_point
    detect_model, pose_model = load_models()
    cap = cv2.VideoCapture(VIDEO_SOURCE, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    print("camera:", cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    tracker = MultiTracker()
    selected_tid = None
    frame_id = 0
    last_pose_candidates = []

    cv2.namedWindow(WINDOW_NAME)
    cv2.setMouseCallback(WINDOW_NAME, mouse_callback)
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM) if SEND_UDP else None
    prev_time = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[WARN] frame read failed")
            break

        h, w = frame.shape[:2]
        timestamp = time.time()
        tracker.predict_all(w, h)

        detect_now = (frame_id % DETECT_EVERY == 0)
        if detect_now:
            dets = detect_fish(detect_model, frame)
            for d in dets:
                d["bbox"] = clamp_xyxy(d["bbox"], w, h)
            tracker.update(dets, frame)
        else:
            for t in tracker.tracks:
                if t.state == "tracked":
                    t.box = clamp_xyxy(t.pred_box, w, h)

        pose_now = USE_POSE and (frame_id % POSE_EVERY == 0)
        if pose_now:
            last_pose_candidates = infer_pose_candidates(pose_model, frame)
            for p in last_pose_candidates:
                p["bbox"] = clamp_xyxy(p["bbox"], w, h)

        chosen_tid = tracker.choose_by_click(clicked_point)
        if chosen_tid is not None:
            selected_tid = chosen_tid
            clicked_point = None
            print(f"[INFO] target selected: ID {selected_tid}")

        selected_tid = tracker.auto_select_target(selected_tid)
        tracker.set_selected(selected_tid)
        visible_tracks = tracker.visible_tracks()

        selected_payload = None
        for t in visible_tracks:
            if t.tid == selected_tid:
                t.update_motion(frame_id, timestamp, w, h)
                pose = select_pose_for_track(t.box, last_pose_candidates)
                t.update_pose(pose)
                detect_abnormal_behavior(t)
                selected_payload = make_payload(t, frame_id, w, h)
                break

        if udp_sock is not None and selected_payload is not None:
            send_udp(udp_sock, selected_payload)
        if SEND_HTTP and selected_payload is not None:
            send_http_post(selected_payload)
        if PRINT_PAYLOAD and selected_payload is not None and frame_id % PRINT_EVERY_N_FRAMES == 0:
            print(json.dumps(selected_payload, ensure_ascii=False))

        now = time.time()
        fps = 1.0 / max(1e-6, now - prev_time)
        prev_time = now

        vis = frame.copy()

        # 화면은 tracked만 표시해서 lost track이 여러 개 쌓여 보이지 않게 함.
        # selected target이 lost 상태일 때만 예외적으로 표시.
        display_tracks = tracker.tracked_tracks()
        selected_track = tracker.get_track_by_id(selected_tid)
        if selected_track is not None and selected_track.state == "lost":
            if selected_track not in display_tracks:
                display_tracks.append(selected_track)

        for t in display_tracks:
            vis = draw_track(vis, t)

        vis = draw_info(vis, selected_tid, detect_now, pose_now, fps)
        cv2.imshow(WINDOW_NAME, vis)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27:
            break
        elif key == ord('r'):
            selected_tid = None
            clicked_point = None
            tracker.set_selected(None)
            print("[INFO] target reset")
        frame_id += 1

    cap.release()
    cv2.destroyAllWindows()
    if udp_sock is not None:
        udp_sock.close()
    print("[DONE]")


if __name__ == "__main__":
    main()
