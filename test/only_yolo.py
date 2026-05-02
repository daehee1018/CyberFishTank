import os
import cv2
import json
import time
import socket
from dataclasses import dataclass
from typing import List, Tuple, Optional

import numpy as np
from ultralytics import YOLO


# =========================================================
# Config
# =========================================================
MODEL_PATH = r"C:\Users\jsh14\Desktop\s\runs\detect\fish_real\weights\best.pt"
model = YOLO(MODEL_PATH)

VIDEO_SOURCE = 0   # 웹캠이면 0, 휴대폰 IP cam이면 URL
#VIDEO_SOURCE = "http://192.168.31.14:8080/video"

CONF_THR = 0.25
IMG_SIZE = 1280

DETECT_EVERY = 1
MAX_LOST = 20
MIN_HITS = 2
MAX_MATCH_DIST = 180.0
MAX_HIST_DIST = 0.90
WINDOW_NAME = "Fish Detection + Tracking"

SEND_UDP = False
UDP_IP = "127.0.0.1"
UDP_PORT = 9999


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
    if denom <= 1e-6:
        return 0.0
    return float(inter / denom)

def normalize_center(box: np.ndarray, w: int, h: int):
    cx, cy = center(box)
    return cx / float(w), cy / float(h)

def point_in_box(x, y, box) -> bool:
    x1, y1, x2, y2 = box
    return x1 <= x <= x2 and y1 <= y <= y2


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

def hist_dist(a: np.ndarray, b: np.ndarray) -> float:
    if a is None or b is None:
        return 0.5
    return float(cv2.compareHist(a.astype(np.float32), b.astype(np.float32), cv2.HISTCMP_BHATTACHARYYA))


# =========================================================
# Simple Kalman Filter
# =========================================================
class SimpleKF:
    def __init__(self, box: np.ndarray):
        cx, cy = center(box)
        w = max(2.0, box[2] - box[0])
        h = max(2.0, box[3] - box[1])

        self.x = np.array([[cx], [cy], [0.0], [0.0], [w], [h]], dtype=np.float32)
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
        w = max(2.0, box[2] - box[0])
        h = max(2.0, box[3] - box[1])
        z = np.array([[cx], [cy], [w], [h]], dtype=np.float32)

        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)

        self.x = self.x + K @ y
        I = np.eye(self.P.shape[0], dtype=np.float32)
        self.P = (I - K @ self.H) @ self.P
        return self.get_box()

    def get_box(self):
        cx = float(self.x[0, 0])
        cy = float(self.x[1, 0])
        w = max(2.0, float(self.x[4, 0]))
        h = max(2.0, float(self.x[5, 0]))
        return np.array([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], dtype=np.float32)


# =========================================================
# Detection
# =========================================================
def load_model():
    if os.path.exists(MODEL_PATH):
        print(f"[INFO] trained model loaded: {MODEL_PATH}")
        return YOLO(MODEL_PATH)

    print(f"[WARN] trained model not found: {MODEL_PATH}")
    print(f"[INFO] fallback model loaded: {FALLBACK_MODEL}")
    return YOLO(FALLBACK_MODEL)

def detect_fish(model, frame):
    results = model.predict(frame, conf=CONF_THR, imgsz=IMG_SIZE, verbose=False)
    r = results[0]
    dets = []

    if r.boxes is None or len(r.boxes) == 0:
        return dets

    xyxy = r.boxes.xyxy.detach().cpu().numpy()
    confs = r.boxes.conf.detach().cpu().numpy()
    clss = r.boxes.cls.detach().cpu().numpy().astype(int)

    for b, c, k in zip(xyxy, confs, clss):
        # 학습 모델이면 fish class 0만 쓰는 걸 권장
        if os.path.exists(MODEL_PATH):
            if k != 0:
                continue
        dets.append({
            "bbox": np.array([float(x) for x in b.tolist()], dtype=np.float32),
            "conf": float(c),
            "cls": int(k),
        })

    return dets


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

    def mark_lost(self):
        self.age += 1
        self.lost += 1
        self.state = "lost" if self.lost <= MAX_LOST else "removed"

    def confirmed(self):
        return self.hits >= MIN_HITS


# =========================================================
# Matching
# =========================================================
def match_score(track: Track, det, frame):
    det_box = det["bbox"]
    pred_box = track.pred_box if track.pred_box is not None else track.box

    dist_c = l2(center(pred_box), center(det_box))
    iou_score = iou(pred_box, det_box)
    hdist = hist_dist(track.hist_feat, hsv_hist_feat(frame, det_box))

    if dist_c > MAX_MATCH_DIST:
        return 1e9
    if hdist > MAX_HIST_DIST:
        return 1e9

    score = dist_c + hdist * 80.0 + (1.0 - iou_score) * 40.0 - det["conf"] * 10.0
    return float(score)

def greedy_match(tracks, dets, frame):
    pairs = []
    for ti, t in enumerate(tracks):
        for di, d in enumerate(dets):
            s = match_score(t, d, frame)
            pairs.append((s, ti, di))

    pairs.sort(key=lambda x: x[0])

    used_t = set()
    used_d = set()
    matches = []

    for s, ti, di in pairs:
        if s >= 1e8:
            continue
        if ti in used_t or di in used_d:
            continue
        used_t.add(ti)
        used_d.add(di)
        matches.append((ti, di))

    unmatched_tracks = [i for i in range(len(tracks)) if i not in used_t]
    unmatched_dets = [i for i in range(len(dets)) if i not in used_d]
    return matches, unmatched_tracks, unmatched_dets


# =========================================================
# Tracker manager
# =========================================================
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
            hist = hsv_hist_feat(frame, box)
            nt = Track(
                tid=self.next_id,
                box=box,
                hist_feat=hist,
                last_conf=d["conf"]
            )
            self.tracks.append(nt)
            self.next_id += 1

        self.tracks = [t for t in self.tracks if not (t.state == "removed" and t.lost > MAX_LOST + 5)]

    def visible_tracks(self):
        out = []
        for t in self.tracks:
            if t.state == "tracked":
                out.append(t)
            elif t.state == "lost" and t.confirmed():
                out.append(t)
        return out

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


# =========================================================
# Mouse
# =========================================================
clicked_point = None

def mouse_callback(event, x, y, flags, param):
    global clicked_point
    if event == cv2.EVENT_LBUTTONDOWN:
        clicked_point = (x, y)


# =========================================================
# Draw
# =========================================================
def draw_track(frame, t: Track):
    x1, y1, x2, y2 = [int(v) for v in t.box]
    cx, cy = center(t.box)

    if t.selected and t.state == "tracked":
        color = (0, 255, 255)
        thickness = 3
    elif t.selected and t.state == "lost":
        color = (0, 165, 255)
        thickness = 2
    elif t.state == "tracked":
        color = (0, 255, 0)
        thickness = 2
    else:
        color = (0, 120, 255)
        thickness = 2

    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
    cv2.circle(frame, (int(cx), int(cy)), 4, (0, 0, 255), -1)

    label = f"ID {t.tid} | {t.state.upper()}"
    if t.selected:
        label = "[TARGET] " + label

    cv2.putText(frame, label, (x1, max(0, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    cv2.putText(frame, f"({int(cx)}, {int(cy)})",
                (x1, min(frame.shape[0] - 5, y2 + 18)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 2)
    return frame

def draw_info(frame, selected_tid, detect_now, fps):
    lines = [
        f"Selected target ID: {selected_tid if selected_tid is not None else 'None'}",
        f"Detect now: {detect_now}",
        f"FPS: {fps:.1f}",
        "Keys: q=quit, r=reset target"
    ]
    y = 25
    for line in lines:
        cv2.putText(frame, line, (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        y += 25
    return frame


# =========================================================
# UDP payload
# =========================================================
def send_udp(sock, payload: dict):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sock.sendto(data, (UDP_IP, UDP_PORT))

def make_payload(t: Track, frame_id: int, w: int, h: int):
    nx, ny = normalize_center(t.box, w, h)
    cx, cy = center(t.box)
    return {
        "frame_id": frame_id,
        "track_id": t.tid,
        "state": t.state,
        "selected": t.selected,
        "bbox": [float(x) for x in t.box.tolist()],
        "center_px": [float(cx), float(cy)],
        "center_norm": [float(nx), float(ny)],
        "conf": float(t.last_conf)
    }


# =========================================================
# Main
# =========================================================
def main():
    global clicked_point

    model = load_model()
    cap = cv2.VideoCapture(VIDEO_SOURCE, cv2.CAP_DSHOW)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("camera:",
        cap.get(cv2.CAP_PROP_FRAME_WIDTH),
        cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    tracker = MultiTracker()
    selected_tid = None
    frame_id = 0

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

        tracker.predict_all(w, h)

        detect_now = (frame_id % DETECT_EVERY == 0)
        if detect_now:
            dets = detect_fish(model, frame)
            for d in dets:
                d["bbox"] = clamp_xyxy(d["bbox"], w, h)
            tracker.update(dets, frame)
        else:
            for t in tracker.tracks:
                if t.state == "tracked":
                    t.box = clamp_xyxy(t.pred_box, w, h)

        chosen_tid = tracker.choose_by_click(clicked_point)
        if chosen_tid is not None:
            selected_tid = chosen_tid
            clicked_point = None

        tracker.set_selected(selected_tid)

        vis = frame.copy()
        visible_tracks = tracker.visible_tracks()
        for t in visible_tracks:
            vis = draw_track(vis, t)

        selected_payload = None
        for t in visible_tracks:
            if t.tid == selected_tid:
                selected_payload = make_payload(t, frame_id, w, h)
                break

        if udp_sock is not None and selected_payload is not None:
            send_udp(udp_sock, selected_payload)

        now = time.time()
        fps = 1.0 / max(1e-6, now - prev_time)
        prev_time = now

        vis = draw_info(vis, selected_tid, detect_now, fps)
        cv2.imshow(WINDOW_NAME, vis)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27:
            break
        elif key == ord('r'):
            selected_tid = None
            clicked_point = None
            print("[INFO] target reset")

        frame_id += 1

    cap.release()
    cv2.destroyAllWindows()
    if udp_sock is not None:
        udp_sock.close()

    print("[DONE]")


if __name__ == "__main__":
    main()