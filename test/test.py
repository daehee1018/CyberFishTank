import cv2
import json
import csv
import time
import math
import socket
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict

import numpy as np
from ultralytics import YOLO

# =========================================================
# Config
# =========================================================
MODEL_PATH = "best.pt"   # 가능하면 fish 전용 학습 모델 권장
VIDEO_SOURCE = "http://192.168.31.14:8080/video"  # 휴대폰 IP cam / 또는 0
CONF_THR = 0.25
IMG_SIZE = 640

DETECT_EVERY = 2          # 2프레임에 1번 detect, 나머지는 tracking 중심
MAX_LOST = 25             # 몇 프레임까지 lost 유지할지
MIN_HITS = 2              # track 안정화 기준
MAX_MATCH_DIST = 120.0    # 중심 거리
MAX_HIST_DIST = 0.85      # appearance 거리
MAX_SIZE_RATIO = 2.2      # bbox 크기 급변 제한

USE_ROI_MASK = True       # 어항 영역만 처리
ROI_JSON_PATH = "tank_roi.json"

SAVE_DETS_JSONL = True
SAVE_TRACKS_JSONL = True
SAVE_CSV = True

OUT_DETS = "detections.jsonl"
OUT_TRACKS = "tracks.jsonl"
OUT_FEATURES = "track_summary.csv"

SEND_UDP = False
UDP_IP = "127.0.0.1"
UDP_PORT = 9999

WINDOW_NAME = "Aquarium Multi Fish Tracking"


# =========================================================
# Utility
# =========================================================
def center(box: np.ndarray) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return (float(x1 + x2) / 2.0, float(y1 + y2) / 2.0)

def box_wh(box: np.ndarray) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return float(max(1.0, x2 - x1)), float(max(1.0, y2 - y1))

def box_area(box: np.ndarray) -> float:
    w, h = box_wh(box)
    return w * h

def l2(a, b) -> float:
    return float(np.hypot(a[0] - b[0], a[1] - b[1]))

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

def point_in_box(x, y, box) -> bool:
    x1, y1, x2, y2 = box
    return x1 <= x <= x2 and y1 <= y <= y2

def normalize_center(box: np.ndarray, w: int, h: int) -> Tuple[float, float]:
    cx, cy = center(box)
    return cx / float(w), cy / float(h)

def size_ratio(a: np.ndarray, b: np.ndarray) -> float:
    area_a = box_area(a)
    area_b = box_area(b)
    mn = max(1.0, min(area_a, area_b))
    mx = max(area_a, area_b)
    return mx / mn

def safe_hist_blend(old_hist, new_hist, alpha=0.9):
    if old_hist is None:
        return new_hist
    if new_hist is None:
        return old_hist
    out = alpha * old_hist + (1.0 - alpha) * new_hist
    s = np.linalg.norm(out)
    if s > 1e-8:
        out = out / s
    return out


# =========================================================
# ROI / Mask
# =========================================================
roi_points = []
roi_done = False
clicked_point = None

def save_roi(points, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"points": points}, f, ensure_ascii=False, indent=2)

def load_roi(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        pts = data.get("points", [])
        if len(pts) >= 3:
            return [(int(x), int(y)) for x, y in pts]
    except Exception:
        return None
    return None

def make_roi_mask(shape, points):
    mask = np.zeros(shape[:2], dtype=np.uint8)
    if points is not None and len(points) >= 3:
        pts = np.array(points, dtype=np.int32)
        cv2.fillPoly(mask, [pts], 255)
    else:
        mask[:] = 255
    return mask

def apply_roi_mask(frame, mask):
    out = frame.copy()
    out[mask == 0] = 0
    return out


# =========================================================
# Mouse callback
# =========================================================
def mouse_callback(event, x, y, flags, param):
    global clicked_point, roi_points, roi_done

    mode = param["mode"]  # "roi" or "select"

    if event == cv2.EVENT_LBUTTONDOWN:
        if mode == "roi":
            if not roi_done:
                roi_points.append((x, y))
        elif mode == "select":
            clicked_point = (x, y)

    elif event == cv2.EVENT_RBUTTONDOWN:
        if mode == "roi" and len(roi_points) > 0:
            roi_points.pop()


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
# Simple Kalman Filter for bbox center/size
# state: [cx, cy, vx, vy, w, h]
# =========================================================
class SimpleKF:
    def __init__(self, box: np.ndarray):
        cx, cy = center(box)
        w, h = box_wh(box)

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
        w, h = box_wh(box)
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
        x1 = cx - w / 2.0
        y1 = cy - h / 2.0
        x2 = cx + w / 2.0
        y2 = cy + h / 2.0
        return np.array([x1, y1, x2, y2], dtype=np.float32)


# =========================================================
# Detection
# =========================================================
def yolo_detect_ultralytics(model, frame, conf=0.25, imgsz=640, cls_filter=None):
    results = model.predict(frame, conf=conf, imgsz=imgsz, verbose=False)
    r = results[0]
    dets = []

    if r.boxes is None or len(r.boxes) == 0:
        return dets

    xyxy = r.boxes.xyxy.detach().cpu().numpy()
    confs = r.boxes.conf.detach().cpu().numpy()
    clss = r.boxes.cls.detach().cpu().numpy().astype(int)

    for b, c, k in zip(xyxy, confs, clss):
        if cls_filter is not None and k not in cls_filter:
            continue
        dets.append({
            "bbox": np.array([float(x) for x in b.tolist()], dtype=np.float32),
            "conf": float(c),
            "cls": int(k),
        })
    return dets


# =========================================================
# Matching
# =========================================================
def match_score(track, det, frame) -> float:
    det_box = det["bbox"]
    pred_box = track.pred_box if track.pred_box is not None else track.box

    pred_c = center(pred_box)
    det_c = center(det_box)

    dist_c = l2(pred_c, det_c)
    iou_score = iou(pred_box, det_box)
    hdist = hist_dist(track.hist_feat, hsv_hist_feat(frame, det_box))
    sr = size_ratio(pred_box, det_box)

    # gating
    if dist_c > MAX_MATCH_DIST:
        return 1e9
    if hdist > MAX_HIST_DIST:
        return 1e9
    if sr > MAX_SIZE_RATIO:
        return 1e9

    # 낮을수록 좋음
    score = (
        dist_c * 1.0
        + hdist * 80.0
        + (1.0 - iou_score) * 40.0
        + abs(sr - 1.0) * 20.0
        - det["conf"] * 10.0
    )
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
        matches.append((ti, di, s))

    unmatched_tracks = [i for i in range(len(tracks)) if i not in used_t]
    unmatched_dets = [i for i in range(len(dets)) if i not in used_d]
    return matches, unmatched_tracks, unmatched_dets


# =========================================================
# Track class
# =========================================================
@dataclass
class Track:
    tid: int
    box: np.ndarray
    pred_box: Optional[np.ndarray] = None
    age: int = 0
    hits: int = 1
    lost: int = 0
    state: str = "tracked"   # tracked / lost / removed
    hist_feat: Optional[np.ndarray] = None
    total_distance: float = 0.0
    last_center: Optional[Tuple[float, float]] = None
    cls_id: int = -1
    last_conf: float = 0.0
    selected: bool = False
    kf: SimpleKF = None

    def __post_init__(self):
        if self.kf is None:
            self.kf = SimpleKF(self.box)
        if self.last_center is None:
            self.last_center = center(self.box)
        if self.pred_box is None:
            self.pred_box = self.box.copy()

    def predict(self, frame_w, frame_h):
        self.pred_box = clamp_xyxy(self.kf.predict(), frame_w, frame_h)
        return self.pred_box

    def update(self, det, frame, frame_w, frame_h):
        det_box = clamp_xyxy(det["bbox"], frame_w, frame_h)
        self.box = clamp_xyxy(self.kf.update(det_box), frame_w, frame_h)
        self.pred_box = self.box.copy()
        self.age += 1
        self.hits += 1
        self.lost = 0
        self.state = "tracked"
        self.cls_id = det["cls"]
        self.last_conf = det["conf"]

        new_c = center(self.box)
        if self.last_center is not None:
            self.total_distance += l2(self.last_center, new_c)
        self.last_center = new_c

        new_hist = hsv_hist_feat(frame, self.box)
        self.hist_feat = safe_hist_blend(self.hist_feat, new_hist, alpha=0.85)

    def mark_lost(self):
        self.age += 1
        self.lost += 1
        self.state = "lost" if self.lost <= MAX_LOST else "removed"

    def is_confirmed(self):
        return self.hits >= MIN_HITS


# =========================================================
# Tracker manager
# =========================================================
class MultiTracker:
    def __init__(self):
        self.tracks: List[Track] = []
        self.next_id = 1

    def predict_all(self, frame_w, frame_h):
        for t in self.tracks:
            if t.state != "removed":
                t.predict(frame_w, frame_h)

    def update(self, dets, frame):
        h, w = frame.shape[:2]

        # active tracks only
        active_tracks = [t for t in self.tracks if t.state != "removed"]

        matches, unmatched_tracks_idx, unmatched_dets_idx = greedy_match(active_tracks, dets, frame)

        # matched
        for ti, di, score in matches:
            t = active_tracks[ti]
            d = dets[di]
            t.update(d, frame, w, h)

        # unmatched tracks -> lost
        for ti in unmatched_tracks_idx:
            t = active_tracks[ti]
            t.mark_lost()
            if t.state != "removed":
                # 예측 위치만 유지
                t.box = t.pred_box.copy()

        # unmatched detections -> new track
        for di in unmatched_dets_idx:
            d = dets[di]
            box = clamp_xyxy(d["bbox"], w, h)
            hist = hsv_hist_feat(frame, box)
            nt = Track(
                tid=self.next_id,
                box=box,
                hist_feat=hist,
                cls_id=d["cls"],
                last_conf=d["conf"]
            )
            self.tracks.append(nt)
            self.next_id += 1

        # purge removed 오래된 것 정리
        self.tracks = [t for t in self.tracks if not (t.state == "removed" and t.lost > MAX_LOST + 10)]

    def visible_tracks(self):
        out = []
        for t in self.tracks:
            if t.state == "tracked":
                out.append(t)
            elif t.state == "lost" and t.is_confirmed():
                out.append(t)
        return out

    def choose_track_by_click(self, xy):
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
# Visualization
# =========================================================
def draw_polygon(vis, points, color=(0, 255, 255)):
    if points is None or len(points) == 0:
        return vis
    for p in points:
        cv2.circle(vis, p, 4, color, -1)
    if len(points) >= 2:
        cv2.polylines(vis, [np.array(points, dtype=np.int32)], False, color, 2)
    return vis

def draw_track(vis, t: Track):
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

    cv2.rectangle(vis, (x1, y1), (x2, y2), color, thickness)
    cv2.circle(vis, (int(cx), int(cy)), 4, (0, 0, 255), -1)

    label = f"ID {t.tid} | {t.state.upper()}"
    if t.selected:
        label = "[TARGET] " + label

    cv2.putText(
        vis, label, (x1, max(0, y1 - 10)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2
    )
    cv2.putText(
        vis, f"({int(cx)}, {int(cy)})",
        (x1, min(vis.shape[0] - 5, y2 + 18)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 2
    )

    return vis

def draw_info(vis, selected_tid, detect_now, fps):
    lines = [
        f"Selected target ID: {selected_tid if selected_tid is not None else 'None'}",
        f"Detect now: {detect_now}",
        f"FPS: {fps:.1f}",
        "Keys: q=quit, r=reset target, c=confirm ROI, x=clear ROI, s=save ROI",
    ]
    y = 25
    for line in lines:
        cv2.putText(vis, line, (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        y += 25
    return vis


# =========================================================
# Export / UDP
# =========================================================
def send_udp(sock, payload: dict):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sock.sendto(data, (UDP_IP, UDP_PORT))

def track_to_payload(t: Track, frame_id: int, w: int, h: int):
    nx, ny = normalize_center(t.box, w, h)
    bw, bh = box_wh(t.box)
    return {
        "frame_id": frame_id,
        "track_id": t.tid,
        "state": t.state,
        "selected": t.selected,
        "bbox": [float(x) for x in t.box.tolist()],
        "center_px": [float(center(t.box)[0]), float(center(t.box)[1])],
        "center_norm": [float(nx), float(ny)],
        "size_px": [float(bw), float(bh)],
        "conf": float(t.last_conf),
    }


# =========================================================
# Main
# =========================================================
def main():
    global roi_done, roi_points, clicked_point

    model = YOLO(MODEL_PATH)
    cap = cv2.VideoCapture(VIDEO_SOURCE)

    if not cap.isOpened():
        raise RuntimeError(f"카메라/영상 소스를 열 수 없음: {VIDEO_SOURCE}")

    ok, frame = cap.read()
    if not ok:
        raise RuntimeError("첫 프레임을 읽지 못함")

    h, w = frame.shape[:2]

    # ROI
    loaded_roi = load_roi(ROI_JSON_PATH) if USE_ROI_MASK else None
    if loaded_roi is not None:
        roi_points = loaded_roi
        roi_done = True

    cv2.namedWindow(WINDOW_NAME)

    # ---------- ROI setup ----------
    if USE_ROI_MASK and not roi_done:
        cv2.setMouseCallback(WINDOW_NAME, mouse_callback, {"mode": "roi"})

        while True:
            vis = frame.copy()
            vis = draw_polygon(vis, roi_points)
            cv2.putText(vis, "ROI mode: left click=add point, right click=undo, c=confirm", (20, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.imshow(WINDOW_NAME, vis)
            key = cv2.waitKey(30) & 0xFF

            if key == ord('c') and len(roi_points) >= 3:
                roi_done = True
                break
            elif key == ord('x'):
                roi_points = []
            elif key == ord('q'):
                cap.release()
                cv2.destroyAllWindows()
                return

        save_roi(roi_points, ROI_JSON_PATH)

    cv2.setMouseCallback(WINDOW_NAME, mouse_callback, {"mode": "select"})

    roi_mask = make_roi_mask(frame.shape, roi_points if (USE_ROI_MASK and roi_done) else None)

    tracker = MultiTracker()
    selected_tid = None
    frame_id = 0

    det_f = open(OUT_DETS, "w", encoding="utf-8") if SAVE_DETS_JSONL else None
    trk_f = open(OUT_TRACKS, "w", encoding="utf-8") if SAVE_TRACKS_JSONL else None

    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM) if SEND_UDP else None

    prev_time = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[WARN] 프레임 읽기 실패")
            break

        h, w = frame.shape[:2]
        masked = apply_roi_mask(frame, roi_mask) if USE_ROI_MASK else frame

        tracker.predict_all(w, h)

        detect_now = (frame_id % DETECT_EVERY == 0)

        dets = []
        if detect_now:
            dets = yolo_detect_ultralytics(
                model=model,
                frame=masked,
                conf=CONF_THR,
                imgsz=IMG_SIZE,
                cls_filter=None
            )

            # clamp
            for d in dets:
                d["bbox"] = clamp_xyxy(d["bbox"], w, h)

            if det_f is not None:
                det_out = {
                    "frame_id": frame_id,
                    "detections": [
                        {
                            "bbox": [float(x) for x in d["bbox"].tolist()],
                            "conf": float(d["conf"]),
                            "cls": int(d["cls"])
                        } for d in dets
                    ]
                }
                det_f.write(json.dumps(det_out, ensure_ascii=False) + "\n")

            tracker.update(dets, frame)
        else:
            # detect 안 하는 프레임은 lost 관리만 약하게 진행
            for t in tracker.tracks:
                if t.state == "tracked":
                    t.box = clamp_xyxy(t.pred_box, w, h)

        # 클릭으로 target 선택
        chosen_tid = tracker.choose_track_by_click(clicked_point)
        if chosen_tid is not None:
            selected_tid = chosen_tid
            clicked_point = None

        tracker.set_selected(selected_tid)

        # 선택된 target이 완전히 사라졌으면 선택 해제는 안 하고 유지
        # 앱 쪽에서 lost 상태도 표현 가능하게 둠

        vis = frame.copy()
        if USE_ROI_MASK and roi_done:
            cv2.polylines(vis, [np.array(roi_points, dtype=np.int32)], True, (255, 255, 0), 2)

        visible_tracks = tracker.visible_tracks()
        for t in visible_tracks:
            vis = draw_track(vis, t)

        # selected target payload / logging
        selected_payload = None
        for t in visible_tracks:
            if t.tid == selected_tid:
                selected_payload = track_to_payload(t, frame_id, w, h)
                break

        if trk_f is not None:
            out = {
                "frame_id": frame_id,
                "tracks": [track_to_payload(t, frame_id, w, h) for t in visible_tracks],
                "selected_target": selected_payload
            }
            trk_f.write(json.dumps(out, ensure_ascii=False) + "\n")

        if udp_sock is not None and selected_payload is not None:
            send_udp(udp_sock, selected_payload)

        # FPS
        now = time.time()
        fps = 1.0 / max(1e-6, (now - prev_time))
        prev_time = now

        vis = draw_info(vis, selected_tid, detect_now, fps)
        cv2.imshow(WINDOW_NAME, vis)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27:
            break
        elif key == ord('r'):
            selected_tid = None
            clicked_point = None
            print("[INFO] selected target reset")
        elif key == ord('x'):
            roi_points = []
            roi_done = False
            roi_mask = np.ones((h, w), dtype=np.uint8) * 255
            print("[INFO] ROI cleared")
        elif key == ord('s'):
            if len(roi_points) >= 3:
                save_roi(roi_points, ROI_JSON_PATH)
                print(f"[INFO] ROI saved to {ROI_JSON_PATH}")

        frame_id += 1

    cap.release()
    cv2.destroyAllWindows()

    if det_f is not None:
        det_f.close()
    if trk_f is not None:
        trk_f.close()
    if udp_sock is not None:
        udp_sock.close()

    if SAVE_CSV:
        with open(OUT_FEATURES, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["track_id", "hits", "last_state", "total_distance_px", "selected"]
            )
            writer.writeheader()
            for t in tracker.tracks:
                writer.writerow({
                    "track_id": t.tid,
                    "hits": t.hits,
                    "last_state": t.state,
                    "total_distance_px": t.total_distance,
                    "selected": t.selected
                })

    print("[DONE]")


if __name__ == "__main__":
    main()