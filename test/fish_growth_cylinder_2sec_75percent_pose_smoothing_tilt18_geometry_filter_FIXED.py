import os
import cv2
import json
import time
import socket
import csv
import urllib.request
import urllib.error
from datetime import datetime
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict, Any

import numpy as np
from ultralytics import YOLO


# =========================================================
# Config
# =========================================================
# 새로 fine-tuning한 Detection 모델
DETECT_MODEL_PATH = r"C:\Users\jsh14\Desktop\s\runs\detect\fish_real_v3_cylinder\weights\best.pt"

DETECT_FALLBACK_MODEL = "yolov8n.pt"

# 새로 fine-tuning한 YOLO Pose 모델
POSE_MODEL_PATH = r"C:\Users\jsh14\Desktop\s\runs\pose\fish_pose_v3_cylinder\weights\best.pt"

POSE_FALLBACK_MODEL = None

VIDEO_SOURCE = 0
# VIDEO_SOURCE = "http://192.168.31.14:8080/video"

# 캡처 해상도. 카메라 각도/위치를 못 바꾸는 상황에서 물고기가 화면에서 차지하는
# 픽셀 수(len:, h(depth): 값)를 키우는 가장 손쉬운 방법 - 화각은 그대로 두고
# 캡처 해상도만 올리면 같은 화면 비율 안에서 픽셀 밀도가 올라간다.
# 웹캠이 요청한 해상도를 지원 안 하면 드라이버가 자동으로 지원 가능한 값으로
# 낮춰서 잡는다. 실제로 몇으로 잡혔는지는 아래 main()의 콘솔 출력으로 확인.
CAM_WIDTH = 1920
CAM_HEIGHT = 1080

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

# 예전 코드에서 사용하던 pose keypoint EMA smoothing.
# 0.7 = 이전 좌표 70%, 새 예측 30% 반영.
POSE_SMOOTH_ALPHA = 0.7

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
WINDOW_NAME = "Fish Tracking + Pose + Growth"

SEND_UDP = False
UDP_IP = "127.0.0.1"
UDP_PORT = 9999

# Web app으로 selected target payload를 HTTP POST 전송
SEND_HTTP = True
HTTP_URL = "http://localhost:80/posi"
HTTP_TIMEOUT_SEC = 0.2

# 웹앱 호환 좌표계: 원본 전송 코드는 1280x720 카메라를 사용했다.
# 성장 측정은 1920x1080으로 유지하고, 전송 payload의 픽셀 좌표만 1280x720으로 환산한다.
WEB_PAYLOAD_WIDTH = 1280
WEB_PAYLOAD_HEIGHT = 720
HTTP_OK_PRINT_EVERY = 300

LOW_ACTIVITY_WINDOW_SEC = 10.0
LOW_ACTIVITY_DIST_PX = 20.0
FAST_SPEED_PX_S = 500.0

PRINT_PAYLOAD = True
PRINT_EVERY_N_FRAMES = 10

# cm 환산값이 있으면 입력. 예: 0.03이면 1px=0.03cm. 모르면 None 유지.
# TODO: 어항에 넣은 기준 마커로 실측해서 채우기.
PIXEL_TO_CM = None


# =========================================================
# Growth Recording Config
# =========================================================
# 생장 기록 저장 폴더
# TODO: 실제 PC 경로에 맞게 수정.
GROWTH_LOG_DIR = r"C:\Users\jsh14\Desktop\s\growth_logs"

# 같은 측정 이벤트 안에서는 5초마다 샘플을 남긴다.
SAVE_GROWTH_EVERY_SEC = 5.0

# Cylinder inside/front labeled data collection
CYLINDER_LABEL_LOG = os.path.join(GROWTH_LOG_DIR, "cylinder_inside_front_samples.csv")
CYLINDER_LABEL_SAVE_EVERY_SEC = 1.0

# 좋은 측정 상태가 이 시간 이상 끊겼다가 다시 만족되면 새 측정 이벤트로 본다.
# 같은 ROI 통과를 수십 개의 독립 측정으로 과대계상하지 않기 위한 기준.
GROWTH_EVENT_BREAK_SEC = 20.0

# 하루 대표값의 신뢰도는 raw sample 수보다 서로 독립적인 측정 이벤트 수를 우선한다.
QUALITY_EVENT_LOW_MAX = 3
QUALITY_EVENT_HIGH_MIN = 8

# 생장 기록에 사용할 최소 pose confidence
MIN_POSE_CONF_FOR_GROWTH = 0.35

# 너무 작거나 큰 길이값은 오검출로 보고 제외
MIN_GROWTH_LENGTH_PX = 20.0
MAX_GROWTH_LENGTH_PX = 1000.0

# -----------------------------------------------------------------
# 1차 필터: 큰 안전 ROI + 실제 원통 측정 구역 + 정방향(left/right) 옆모습
# -----------------------------------------------------------------
# SAFE_GROWTH_ROI:
#   화면 가장자리/상단 경계에 걸친 애매한 프레임을 먼저 제외하는 안전 구역이다.
# CYLINDER_MEASURE_ROI:
#   화면 중앙 위쪽의 실제 투명 원통 내부에 맞춘 측정 구역이다.
#   물고기의 bbox 전체 + head + tail이 모두 이 안에 들어왔을 때만 성장 길이를 저장한다.
#   따라서 원통 앞/뒤에 단순히 겹쳐 보이는 경우까지 완벽히 구분하는 것은 아니지만,
#   물고기가 실제 원통 안을 통과하는 상황을 최대한 엄격하게 선별한다.
#
# 현재 카메라 화면에서 원통 내부에 맞춘 시작값. 필요하면 캡처를 보고 미세조정한다.
SAFE_GROWTH_ROI = (450, 80, 1500, 420)
CYLINDER_MEASURE_ROI = (800, 190, 1000, 300)

# -------------------------------------------------------------
# 실제 원통 내부 자동 판별(기존 라벨 데이터 기반 보수적 시작값)
# -------------------------------------------------------------
# 화면상 원통 ROI에 들어온 것만으로는 앞을 스쳐가는 경우가 섞일 수 있으므로,
# bbox 높이와 중심 이동속도가 충분히 작고 그 상태가 일정 시간 연속 유지될 때만
# 실제 원통 내부로 확정한다.
CYLINDER_INSIDE_MAX_BBOX_H_PX = 120.0
CYLINDER_INSIDE_MAX_SPEED_PX_S = 30.0
CYLINDER_INSIDE_CONFIRM_SEC = 2.0
# 연속 2초 100% 통과 대신, 최근 2초 동안 후보 조건을 만족한 프레임 비율로 확정한다.
# 속도/bbox/ROI/pose 조건 자체는 그대로 유지하고 순간적인 tracking/pose 흔들림만 허용.
CYLINDER_INSIDE_REQUIRED_RATIO = 0.75
# 한두 프레임 pose 흔들림 때문에 즉시 해제되지 않도록 짧은 유예시간을 둔다.
CYLINDER_INSIDE_FAIL_GRACE_SEC = 0.35

# 이전 버전/로그와의 호환을 위해 이름도 유지한다.
MEASUREMENT_GATE = CYLINDER_MEASURE_ROI

# 이전 코드/로그 호환용 이름. 실제 안전 ROI는 SAFE_GROWTH_ROI를 사용한다.
GROWTH_ROI = SAFE_GROWTH_ROI

# head-tail 선이 수평에서 이 각도 이내일 때만 "정방향 옆모습"으로 인정.
# left/right는 둘 다 허용한다. 30도였던 기존값보다 엄격하게 15도로 시작.
MAX_SIDE_TILT_DEG = 18.0

# head와 tail의 x 차이가 너무 작으면 left/right 방향 자체가 불안정하므로 제외.
MIN_HORIZONTAL_SPAN_PX = 40.0

# Pose geometry sanity filter: 원통 굴절/반사로 H/T, D/B가 몸 중앙에 붕괴하는 프레임 제외
# 보정용이 아니라 저장/후보 판정에서 명백한 pose glitch만 reject하는 용도.
MIN_LENGTH_TO_BBOX_W_RATIO = 0.50
MIN_BODY_HEIGHT_PX_FOR_GROWTH = 5.0

# -----------------------------------------------------------------
# depth proxy 필터 제거
# -----------------------------------------------------------------
# dorsal-belly body_height_px는 자세/pose 흔들림이 커서 depth 판정 기준으로 쓰지 않는다.
# 값 자체는 디버깅과 향후 분석을 위해 CSV/payload에 그대로 남긴다.
# 즉, body_height_px로 길이를 보정하거나 샘플을 reject하지 않는다.

# -----------------------------------------------------------------
# 2차 필터: 이벤트 안정성 + 하루 단위 robust outlier 제거
# -----------------------------------------------------------------
# 이벤트에 샘플이 충분할 때, 이벤트 내부 MAD/median 비율이 이 값보다 크면
# 같은 통과 중 pose/자세가 불안정했다고 보고 그 이벤트를 하루 대표값에서 제외한다.
EVENT_STABILITY_MIN_SAMPLES = 3
MAX_EVENT_REL_MAD = 0.04   # 4%

# 하루에 이벤트가 충분히 있을 때 event median의 극단값을 MAD 기반으로 제거한다.
# robust z = 0.6745 * |x - median| / MAD
DAILY_OUTLIER_MIN_EVENTS = 5
DAILY_OUTLIER_ROBUST_Z = 3.5

# 화면에 ROI 표시
DRAW_GROWTH_ROI = True

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


def body_height_px_from_keypoints(dorsal: Optional[np.ndarray], belly: Optional[np.ndarray]) -> Optional[float]:
    """
    dorsal-belly 사이의 세로 픽셀 거리. depth proxy로 사용.
    body_length_px와 마찬가지로 카메라에 가까울수록 커지고 멀수록 작아지므로,
    이 값이 일정 범위 안에 있다는 건 "그 프레임이 대략 같은 depth에서 찍혔다"는 뜻.
    """
    if dorsal is None or belly is None:
        return None
    return float(abs(dorsal[1] - belly[1]))


def smooth_point(old: Optional[np.ndarray], new: Optional[np.ndarray], alpha: float = POSE_SMOOTH_ALPHA) -> Optional[np.ndarray]:
    """
    Exponential moving average smoothing for pose keypoints.
    예전 코드와 동일하게 이전 좌표 70%, 새 예측 30%를 반영한다.
    """
    if new is None:
        return old
    new = np.array(new, dtype=np.float32)
    if old is None:
        return new
    old = np.array(old, dtype=np.float32)
    return (alpha * old + (1.0 - alpha) * new).astype(np.float32)


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
    body_height_px: Optional[float] = None  # depth proxy: dorsal-belly 세로 픽셀 거리

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
            self.body_height_px = None
            return
        # 예전 코드와 동일한 keypoint smoothing: 프레임별 pose 튐 완화
        self.head = smooth_point(self.head, pose["head"])
        self.dorsal = smooth_point(self.dorsal, pose["dorsal"])
        self.tail = smooth_point(self.tail, pose["tail"])
        self.belly = smooth_point(self.belly, pose["belly"])
        self.pose_conf = float(pose["conf"])
        self.pose_direction = pose_direction(self.head, self.tail)
        self.flipped = is_flipped(self.dorsal, self.belly)
        self.body_length_px = pose_length_px(self.head, self.tail)
        self.body_length_cm = None if (self.body_length_px is None or PIXEL_TO_CM is None) else self.body_length_px * PIXEL_TO_CM
        self.body_height_px = body_height_px_from_keypoints(self.dorsal, self.belly)

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
# Growth Recording
# =========================================================
def is_in_growth_roi(t: Track) -> bool:
    """
    성장 측정 ROI 조건.

    1) 큰 SAFE_GROWTH_ROI에서는 bbox 전체 + head + tail이 모두 안에 있어야 한다.
    2) 실제 원통 구역(CYLINDER_MEASURE_ROI)에서는 bbox 전체를 요구하지 않고,
       head + tail + bbox 중심점이 모두 안에 있으면 통과한다.

    지느러미 때문에 bbox가 크게 잡혀 원통 안의 물고기가 불필요하게 탈락하는 것을 줄인다.
    """
    if t.head is None or t.tail is None:
        return False

    bx1, by1, bx2, by2 = [float(v) for v in t.box]
    hx, hy = float(t.head[0]), float(t.head[1])
    tx, ty = float(t.tail[0]), float(t.tail[1])
    cx, cy = center(t.box)

    sx1, sy1, sx2, sy2 = [float(v) for v in SAFE_GROWTH_ROI]
    safe_ok = (
        sx1 <= bx1 and sy1 <= by1 and bx2 <= sx2 and by2 <= sy2
        and sx1 <= hx <= sx2 and sy1 <= hy <= sy2
        and sx1 <= tx <= sx2 and sy1 <= ty <= sy2
    )

    gx1, gy1, gx2, gy2 = [float(v) for v in CYLINDER_MEASURE_ROI]
    cylinder_ok = (
        gx1 <= hx <= gx2 and gy1 <= hy <= gy2
        and gx1 <= tx <= gx2 and gy1 <= ty <= gy2
        and gx1 <= cx <= gx2 and gy1 <= cy <= gy2
    )

    return bool(safe_ok and cylinder_ok)


def growth_facing_direction(t: Track) -> str:
    """생장 측정용 좌/우 방향. y방향 성분은 tilt 조건에서 별도로 검사한다."""
    if t.head is None or t.tail is None:
        return "unknown"
    dx_signed = float(t.head[0] - t.tail[0])
    if abs(dx_signed) < MIN_HORIZONTAL_SPAN_PX:
        return "unknown"
    return "right" if dx_signed > 0 else "left"


def is_good_growth_pose(t: Track) -> Tuple[bool, str]:
    """
    생장 기록 1차 필터.

    1) tracking 상태가 tracked
    2) pose confidence 충분
    3) head/tail keypoint 존재
    4) flipped 아님
    5) head-tail 길이가 정상 범위
    6) head-tail의 수평 span이 충분해서 left/right 방향이 명확함
    7) head-tail 기울기가 MAX_SIDE_TILT_DEG 이내인 정방향 옆모습

    body_height_px는 들쭉날쭉한 depth proxy이므로 여기서는 필터로 사용하지 않는다.
    """
    if t.state != "tracked":
        return False, "not_tracked"

    if t.head is None or t.tail is None:
        return False, "no_head_tail"

    if t.body_length_px is None:
        return False, "no_length"

    if t.pose_conf < MIN_POSE_CONF_FOR_GROWTH:
        return False, "low_pose_conf"

    if t.flipped is True:
        return False, "flipped"

    if not (MIN_GROWTH_LENGTH_PX <= float(t.body_length_px) <= MAX_GROWTH_LENGTH_PX):
        return False, "length_out_of_range"

    # 명백한 pose 붕괴 방지: H-T 길이가 bbox 폭에 비해 지나치게 짧으면 제외.
    bbox_w = max(1e-6, float(t.box[2] - t.box[0]))
    length_bbox_ratio = float(t.body_length_px) / bbox_w
    if length_bbox_ratio < MIN_LENGTH_TO_BBOX_W_RATIO:
        return False, "bad_pose_geometry_length"

    # D/B가 거의 같은 위치로 붕괴한 극단적 pose도 제외.
    # body_height는 depth 보정에는 사용하지 않고, catastrophic pose failure 감지에만 사용한다.
    body_h = body_height_px_from_keypoints(t.dorsal, t.belly)
    if body_h is not None and body_h < MIN_BODY_HEIGHT_PX_FOR_GROWTH:
        return False, "bad_pose_geometry_height"

    dx_signed = float(t.head[0] - t.tail[0])
    dx = abs(dx_signed)
    dy = abs(float(t.head[1] - t.tail[1]))

    if dx < MIN_HORIZONTAL_SPAN_PX:
        return False, "not_left_right"

    facing = growth_facing_direction(t)
    if facing not in ("left", "right"):
        return False, "not_left_right"

    tilt_deg = float(np.degrees(np.arctan2(dy, max(dx, 1e-6))))
    if tilt_deg > MAX_SIDE_TILT_DEG:
        return False, "not_straight_side_view"

    return True, f"ok_{facing}"


def cylinder_inside_candidate(t: Track) -> Tuple[bool, str]:
    """
    원통 내부 확정 전 1차 후보 조건.

    - 기존 원통 ROI + pose 성장조건을 만족
    - bbox 높이가 120px 이하
    - 중심 이동속도가 30px/s 이하

    실제 저장은 이 조건이 CYLINDER_INSIDE_CONFIRM_SEC 동안 연속 유지된 뒤에만 허용한다.
    """
    if not is_in_growth_roi(t):
        return False, "outside_growth_roi"

    good_pose, reason = is_good_growth_pose(t)
    if not good_pose:
        return False, reason

    bx1, by1, bx2, by2 = [float(v) for v in t.box]
    bbox_h = by2 - by1
    if bbox_h > CYLINDER_INSIDE_MAX_BBOX_H_PX:
        return False, "cylinder_bbox_h_too_large"

    speed = float(getattr(t, "velocity_px_s", 0.0) or 0.0)
    if speed > CYLINDER_INSIDE_MAX_SPEED_PX_S:
        return False, "cylinder_moving_too_fast"

    return True, "inside_candidate"


def can_save_growth_sample(t: Track) -> Tuple[bool, str]:
    """ROI 조건과 포즈 조건을 모두 만족하는지 확인."""
    if not is_in_growth_roi(t):
        return False, "outside_growth_roi"

    good_pose, reason = is_good_growth_pose(t)
    if not good_pose:
        return False, reason

    return True, "ok"


def save_growth_sample(t: Track, frame_id: int, w: int, h: int, event_id: int, reason: str = "ok"):
    """
    조건을 만족한 프레임의 길이 샘플을 날짜별 CSV에 저장.
    하루 대표값은 summarize_daily_growth()에서 median으로 계산.
    """
    os.makedirs(GROWTH_LOG_DIR, exist_ok=True)

    today = datetime.now().strftime("%Y-%m-%d")
    path = os.path.join(GROWTH_LOG_DIR, f"growth_samples_{today}.csv")
    file_exists = os.path.isfile(path)

    x1, y1, x2, y2 = [float(v) for v in t.box]
    bbox_w = x2 - x1
    bbox_h = y2 - y1
    bbox_area = bbox_w * bbox_h

    cx, cy = center(t.box)
    dx = None
    dy = None
    tilt_deg = None
    facing = growth_facing_direction(t)
    if t.head is not None and t.tail is not None:
        dx = abs(float(t.head[0] - t.tail[0]))
        dy = abs(float(t.head[1] - t.tail[1]))
        tilt_deg = float(np.degrees(np.arctan2(dy, max(dx, 1e-6))))

    with open(path, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)

        if not file_exists:
            writer.writerow([
                "datetime",
                "date",
                "frame_id",
                "track_id",
                "event_id",
                "body_length_px",
                "body_length_cm",
                "body_height_px",
                "pose_conf",
                "bbox_x1",
                "bbox_y1",
                "bbox_x2",
                "bbox_y2",
                "bbox_w",
                "bbox_h",
                "bbox_area",
                "center_x",
                "center_y",
                "frame_w",
                "frame_h",
                "head_x",
                "head_y",
                "tail_x",
                "tail_y",
                "head_tail_dx",
                "head_tail_dy",
                "side_tilt_deg",
                "facing",
                "flipped",
                "growth_roi",
                "save_reason"
            ])

        writer.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            today,
            int(frame_id),
            int(t.tid),
            int(event_id),
            None if t.body_length_px is None else float(t.body_length_px),
            None if t.body_length_cm is None else float(t.body_length_cm),
            None if t.body_height_px is None else float(t.body_height_px),
            float(t.pose_conf),
            x1,
            y1,
            x2,
            y2,
            bbox_w,
            bbox_h,
            bbox_area,
            float(cx),
            float(cy),
            int(w),
            int(h),
            None if t.head is None else float(t.head[0]),
            None if t.head is None else float(t.head[1]),
            None if t.tail is None else float(t.tail[0]),
            None if t.tail is None else float(t.tail[1]),
            dx,
            dy,
            tilt_deg,
            facing,
            t.flipped,
            str({"safe_roi": SAFE_GROWTH_ROI, "cylinder_roi": CYLINDER_MEASURE_ROI}),
            reason
        ])


def summarize_daily_growth(date_str: Optional[str] = None, test_mode: bool = False):
    """
    하루 대표값 계산 순서

    1) 같은 ROI 통과에서 나온 raw sample을 event_id별로 묶는다.
    2) 이벤트 안에서 샘플이 3개 이상이면 상대 MAD를 계산해 불안정한 이벤트를 제외한다.
    3) 남은 이벤트마다 median 길이 하나를 만든다.
    4) 하루에 이벤트가 5개 이상이면 event median들 중 MAD 기반 극단값을 제거한다.
    5) 최종적으로 남은 event median들의 median을 그날 대표 길이로 사용한다.

    핵심: depth를 직접 추정하는 대신, 큰 안전 ROI + 작은 중앙 gate + 정방향 pose로 1차 표준화하고
    같은 통과의 흔들림/하루 극단값을 2차 robust filtering으로 줄인다.
    """
    target_date = date_str if date_str is not None else datetime.now().strftime("%Y-%m-%d")
    sample_path = os.path.join(GROWTH_LOG_DIR, f"growth_samples_{target_date}.csv")
    # 실제 날짜별 공식 요약과 s키 테스트 요약을 분리한다.
    # 테스트 요약은 공식 daily_growth_summary.csv를 건드리지 않으므로
    # 하루 중간에 여러 번 눌러도 자정/종료 시 최종 요약에 영향이 없다.
    if test_mode:
        summary_path = os.path.join(GROWTH_LOG_DIR, "growth_test_summary.csv")
    else:
        summary_path = os.path.join(GROWTH_LOG_DIR, "daily_growth_summary_v2.csv")

    if not os.path.isfile(sample_path):
        if test_mode:
            print(f"[GROWTH TEST] 아직 오늘 저장된 측정 샘플이 없습니다: {sample_path}")
        return

    event_lengths: Dict[str, List[float]] = {}
    event_lengths_cm: Dict[str, List[float]] = {}
    all_lengths: List[float] = []
    all_lengths_cm: List[float] = []

    with open(sample_path, "r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row_idx, row in enumerate(reader):
            try:
                event_id = row.get("event_id")
                event_key = str(event_id) if event_id not in [None, ""] else f"legacy_{row_idx}"

                if row.get("body_length_px") not in [None, ""]:
                    v = float(row["body_length_px"])
                    all_lengths.append(v)
                    event_lengths.setdefault(event_key, []).append(v)

                if row.get("body_length_cm") not in [None, ""]:
                    v_cm = float(row["body_length_cm"])
                    all_lengths_cm.append(v_cm)
                    event_lengths_cm.setdefault(event_key, []).append(v_cm)
            except ValueError:
                continue

    if len(all_lengths) == 0:
        if test_mode:
            print("[GROWTH TEST] 오늘 CSV는 있지만 유효한 body_length_px 샘플이 없습니다.")
        return

    # -----------------------------
    # 2차-A: 이벤트 내부 안정성 검사
    # -----------------------------
    accepted_events = []
    rejected_unstable_events = []

    for event_key, values in event_lengths.items():
        if not values:
            continue
        med = float(np.median(values))
        mad = median_absolute_deviation(values)
        rel_mad = 0.0 if med <= 1e-6 else float(mad / med)

        if len(values) >= EVENT_STABILITY_MIN_SAMPLES and rel_mad > MAX_EVENT_REL_MAD:
            rejected_unstable_events.append(event_key)
            continue

        accepted_events.append((event_key, med, len(values), rel_mad))

    # 너무 엄격한 필터 때문에 하루 전체가 사라지는 것은 피한다.
    # 전부 reject된 경우에는 원래 event median을 사용하되 quality를 LOW로 강등한다.
    fallback_used = False
    if len(accepted_events) == 0:
        fallback_used = True
        accepted_events = [
            (event_key, float(np.median(values)), len(values), 0.0)
            for event_key, values in event_lengths.items() if len(values) > 0
        ]

    event_medians_px = [x[1] for x in accepted_events]

    # -----------------------------
    # 2차-B: 하루 event median 극단값 제거
    # -----------------------------
    filtered_event_medians_px = list(event_medians_px)
    n_daily_outliers = 0

    if len(event_medians_px) >= DAILY_OUTLIER_MIN_EVENTS:
        day_med = float(np.median(event_medians_px))
        day_mad = median_absolute_deviation(event_medians_px)

        if day_mad > 1e-6:
            kept = []
            for v in event_medians_px:
                robust_z = 0.6745 * abs(v - day_med) / day_mad
                if robust_z <= DAILY_OUTLIER_ROBUST_Z:
                    kept.append(v)
            # 최소 3개는 남을 때만 outlier 제거 결과를 채택한다.
            if len(kept) >= 3:
                n_daily_outliers = len(event_medians_px) - len(kept)
                filtered_event_medians_px = kept

    if len(filtered_event_medians_px) == 0:
        return

    # 공식 하루 대표값
    daily_median_px = float(np.median(filtered_event_medians_px))
    event_mean_px = float(np.mean(filtered_event_medians_px))
    event_std_px = float(np.std(filtered_event_medians_px))
    event_mad_px = median_absolute_deviation(filtered_event_medians_px)

    # raw 통계는 검증용으로 계속 보존
    raw_median_px = float(np.median(all_lengths))
    raw_mad_px = median_absolute_deviation(all_lengths)

    n_samples = int(len(all_lengths))
    n_events_raw = int(len(event_lengths))
    n_events_stable = int(len(event_medians_px))
    n_events_used = int(len(filtered_event_medians_px))

    quality_flag = quality_flag_for_events(n_events_used, event_mad_px, daily_median_px)
    if fallback_used:
        quality_flag = "LOW"

    # cm 값은 현재 PIXEL_TO_CM이 단순 고정 스케일일 때만 의미가 있으므로,
    # 최종 px 대표값에 같은 비율을 적용한다. None이면 그대로 None.
    daily_median_cm = None if PIXEL_TO_CM is None else float(daily_median_px * PIXEL_TO_CM)
    event_mad_cm = None if PIXEL_TO_CM is None else float(event_mad_px * PIXEL_TO_CM)

    # s키 테스트: 현재까지의 데이터를 즉시 같은 방식으로 계산하되
    # 공식 daily_growth_summary.csv에는 기록하지 않는다.
    if test_mode:
        event_medians_text = ", ".join(f"{v:.1f}" for v in event_medians_px) if event_medians_px else "없음"
        used_medians_text = ", ".join(f"{v:.1f}" for v in filtered_event_medians_px) if filtered_event_medians_px else "없음"
        print("\n========== GROWTH TEST SUMMARY ==========")
        print(f"date              : {target_date}")
        print(f"raw samples       : {n_samples}")
        print(f"events raw/stable : {n_events_raw}/{n_events_stable}")
        print(f"event medians(px) : [{event_medians_text}]")
        print(f"used medians(px)  : [{used_medians_text}]")
        print(f"daily median(px)  : {daily_median_px:.2f}")
        if daily_median_cm is not None:
            print(f"daily median(cm)  : {daily_median_cm:.3f}")
        print(f"event MAD(px)     : {event_mad_px:.2f}")
        print(f"unstable rejected : {len(rejected_unstable_events)}")
        print(f"daily outliers    : {n_daily_outliers}")
        print(f"quality           : {quality_flag}")
        print("=========================================\n")

        file_exists = os.path.isfile(summary_path)
        with open(summary_path, "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow([
                    "timestamp", "date", "daily_median_body_length_px",
                    "daily_median_body_length_cm", "event_mad_body_length_px",
                    "n_events_raw", "n_events_stable", "n_events_used",
                    "n_samples", "rejected_unstable_events",
                    "rejected_daily_outliers", "quality_flag", "sample_file"
                ])
            writer.writerow([
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                target_date, daily_median_px, daily_median_cm, event_mad_px,
                n_events_raw, n_events_stable, n_events_used, n_samples,
                len(rejected_unstable_events), n_daily_outliers, quality_flag, sample_path
            ])
        print(f"[GROWTH TEST] 테스트 요약 저장: {summary_path}")
        return

    existing_dates = set()
    if os.path.isfile(summary_path):
        with open(summary_path, "r", newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing_dates.add(row.get("date"))

    if target_date in existing_dates:
        print(f"[GROWTH] daily summary already exists for {target_date}: {summary_path}")
        return

    file_exists = os.path.isfile(summary_path)
    with open(summary_path, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow([
                "date",
                "daily_median_body_length_px",
                "event_mean_body_length_px",
                "event_std_body_length_px",
                "event_mad_body_length_px",
                "raw_median_body_length_px",
                "raw_mad_body_length_px",
                "daily_median_body_length_cm",
                "event_mad_body_length_cm",
                "n_events_raw",
                "n_events_stable",
                "n_events_used",
                "n_samples",
                "rejected_unstable_events",
                "rejected_daily_outliers",
                "quality_flag",
                "sample_file"
            ])

        writer.writerow([
            target_date,
            daily_median_px,
            event_mean_px,
            event_std_px,
            event_mad_px,
            raw_median_px,
            raw_mad_px,
            daily_median_cm,
            event_mad_cm,
            n_events_raw,
            n_events_stable,
            n_events_used,
            n_samples,
            len(rejected_unstable_events),
            n_daily_outliers,
            quality_flag,
            sample_path
        ])

    print(f"[GROWTH] daily summary saved: {summary_path}")
    print(
        f"[GROWTH] {target_date} median={daily_median_px:.2f}px, "
        f"MAD={event_mad_px:.2f}px, events(raw/stable/used)="
        f"{n_events_raw}/{n_events_stable}/{n_events_used}, "
        f"outliers={n_daily_outliers}, quality={quality_flag}"
    )



def summarize_hourly_growth(hour_key: Optional[str] = None):
    """
    1시간 단위 검증용 요약.

    중요한 점: 매 정각에 프레임 1장을 찍는 방식이 아니라, 프로그램은 계속 실행하면서
    ROI + 정방향 pose 조건을 통과한 샘플을 계속 모은다. 그 뒤 같은 시각대의 이벤트들을
    event median -> 불안정 이벤트 제거 -> 시간대 outlier 제거 -> hourly median 순으로 요약한다.

    hour_key 형식: "YYYY-MM-DD HH" (예: "2026-09-01 23")
    결과는 hourly_growth_summary.csv에 시간대별 한 줄로 저장되며, 같은 시간대를 다시
    계산하면 기존 행을 교체한다.
    """
    if hour_key is None:
        hour_key = datetime.now().strftime("%Y-%m-%d %H")

    target_date = hour_key[:10]
    sample_path = os.path.join(GROWTH_LOG_DIR, f"growth_samples_{target_date}.csv")
    summary_path = os.path.join(GROWTH_LOG_DIR, "hourly_growth_summary_v2.csv")

    fieldnames = [
        "hour", "date", "hour_of_day",
        "hourly_median_body_length_px", "hourly_median_body_length_cm",
        "event_mad_body_length_px",
        "n_events_raw", "n_events_stable", "n_events_used", "n_samples",
        "rejected_unstable_events", "rejected_hourly_outliers",
        "quality_flag", "sample_file"
    ]

    def upsert_row(row):
        rows = []
        if os.path.isfile(summary_path):
            with open(summary_path, "r", newline="", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                rows = [r for r in reader if r.get("hour") != hour_key]
        rows.append({k: row.get(k, "") for k in fieldnames})
        rows.sort(key=lambda r: r.get("hour", ""))
        with open(summary_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    if not os.path.isfile(sample_path):
        upsert_row({
            "hour": hour_key,
            "date": target_date,
            "hour_of_day": hour_key[-2:],
            "n_events_raw": 0,
            "n_events_stable": 0,
            "n_events_used": 0,
            "n_samples": 0,
            "rejected_unstable_events": 0,
            "rejected_hourly_outliers": 0,
            "quality_flag": "NO_DATA",
            "sample_file": sample_path,
        })
        print(f"[GROWTH HOURLY] {hour_key}: NO_DATA")
        return

    event_lengths: Dict[str, List[float]] = {}
    n_samples = 0

    with open(sample_path, "r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row_idx, row in enumerate(reader):
            ts = row.get("datetime", "") or row.get("timestamp", "")
            if not ts.startswith(hour_key):
                continue
            try:
                if row.get("body_length_px") in [None, ""]:
                    continue
                v = float(row["body_length_px"])
                event_id = row.get("event_id")
                event_key = str(event_id) if event_id not in [None, ""] else f"legacy_{row_idx}"
                event_lengths.setdefault(event_key, []).append(v)
                n_samples += 1
            except ValueError:
                continue

    if n_samples == 0:
        upsert_row({
            "hour": hour_key,
            "date": target_date,
            "hour_of_day": hour_key[-2:],
            "n_events_raw": 0,
            "n_events_stable": 0,
            "n_events_used": 0,
            "n_samples": 0,
            "rejected_unstable_events": 0,
            "rejected_hourly_outliers": 0,
            "quality_flag": "NO_DATA",
            "sample_file": sample_path,
        })
        print(f"[GROWTH HOURLY] {hour_key}: NO_DATA")
        return

    accepted_events = []
    rejected_unstable = 0
    for event_key, values in event_lengths.items():
        med = float(np.median(values))
        mad = median_absolute_deviation(values)
        rel_mad = 0.0 if med <= 1e-6 else float(mad / med)
        if len(values) >= EVENT_STABILITY_MIN_SAMPLES and rel_mad > MAX_EVENT_REL_MAD:
            rejected_unstable += 1
            continue
        accepted_events.append((event_key, med, len(values), rel_mad))

    fallback_used = False
    if len(accepted_events) == 0:
        fallback_used = True
        accepted_events = [
            (event_key, float(np.median(values)), len(values), 0.0)
            for event_key, values in event_lengths.items() if values
        ]

    event_medians = [x[1] for x in accepted_events]
    used_medians = list(event_medians)
    n_hourly_outliers = 0

    # 하루 필터와 같은 robust 기준을 시간대에도 적용한다.
    if len(event_medians) >= DAILY_OUTLIER_MIN_EVENTS:
        hour_med = float(np.median(event_medians))
        hour_mad = median_absolute_deviation(event_medians)
        if hour_mad > 1e-6:
            kept = []
            for v in event_medians:
                robust_z = 0.6745 * abs(v - hour_med) / hour_mad
                if robust_z <= DAILY_OUTLIER_ROBUST_Z:
                    kept.append(v)
            if len(kept) >= 3:
                n_hourly_outliers = len(event_medians) - len(kept)
                used_medians = kept

    if not used_medians:
        print(f"[GROWTH HOURLY] {hour_key}: no usable events")
        return

    hourly_median_px = float(np.median(used_medians))
    event_mad_px = median_absolute_deviation(used_medians)
    hourly_median_cm = None if PIXEL_TO_CM is None else float(hourly_median_px * PIXEL_TO_CM)
    quality_flag = quality_flag_for_events(len(used_medians), event_mad_px, hourly_median_px)
    if fallback_used:
        quality_flag = "LOW"

    upsert_row({
        "hour": hour_key,
        "date": target_date,
        "hour_of_day": hour_key[-2:],
        "hourly_median_body_length_px": hourly_median_px,
        "hourly_median_body_length_cm": "" if hourly_median_cm is None else hourly_median_cm,
        "event_mad_body_length_px": event_mad_px,
        "n_events_raw": len(event_lengths),
        "n_events_stable": len(event_medians),
        "n_events_used": len(used_medians),
        "n_samples": n_samples,
        "rejected_unstable_events": rejected_unstable,
        "rejected_hourly_outliers": n_hourly_outliers,
        "quality_flag": quality_flag,
        "sample_file": sample_path,
    })

    print(
        f"[GROWTH HOURLY] {hour_key}: median={hourly_median_px:.2f}px, "
        f"events={len(used_medians)}, samples={n_samples}, MAD={event_mad_px:.2f}px, "
        f"quality={quality_flag}"
    )

def median_absolute_deviation(values: List[float]) -> float:
    """
    MAD = median(|x_i - median(x)|)
    std보다 outlier에 덜 민감함. median을 중심 통계량으로 쓰는
    이 파이프라인 전체와 궁합이 맞아서 std 대신/추가로 같이 저장한다.
    """
    if len(values) == 0:
        return 0.0
    med = float(np.median(values))
    return float(np.median([abs(v - med) for v in values]))


def quality_flag_for_n(n_samples: int) -> str:
    """
    표본 개수(n)만으로 하루 median의 신뢰도를 대략 분류.
    n이 작으면 median이 우연히 안정적으로 보여도(값들이 서로 비슷해도)
    표본 자체가 부족해서 그날의 대표값으로 믿기 어려움.
    """
    if n_samples < QUALITY_N_LOW_MAX:
        return "LOW"
    if n_samples < QUALITY_N_HIGH_MIN:
        return "MEDIUM"
    return "HIGH"


def quality_flag_for_events(n_events: int, event_mad_px: float, median_px: float) -> str:
    """
    하루 신뢰도는 raw sample 수가 아니라 독립 측정 이벤트 수를 우선한다.
    같은 방문에서 샘플 100개보다 서로 다른 시간대의 방문 5번이 더 의미 있기 때문.
    이벤트 사이 변동이 너무 크면 한 단계 낮춘다.
    """
    if n_events < QUALITY_EVENT_LOW_MAX:
        base = "LOW"
    elif n_events < QUALITY_EVENT_HIGH_MIN:
        base = "MEDIUM"
    else:
        base = "HIGH"

    # 상대 MAD가 5% 초과면 그날은 depth/pose 흔들림이 큰 것으로 보고 한 단계 강등.
    rel_mad = 0.0 if median_px <= 1e-6 else float(event_mad_px / median_px)
    if rel_mad > 0.05:
        if base == "HIGH":
            return "MEDIUM"
        if base == "MEDIUM":
            return "LOW"
    return base


def draw_growth_roi(frame):
    """화면에 큰 안전 ROI와 작은 실제 측정 gate를 함께 표시."""
    if not DRAW_GROWTH_ROI:
        return frame

    # 큰 안전 ROI: bbox + head + tail이 모두 이 안에 있어야 함
    x1, y1, x2, y2 = [int(v) for v in SAFE_GROWTH_ROI]
    cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 255), 2)
    cv2.putText(
        frame, "SAFE ROI", (x1, max(0, y1 - 8)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 2
    )

    # 실제 원통 측정 구역: head + tail + bbox 중심점이 이 안에 들어오면 저장 후보
    gx1, gy1, gx2, gy2 = [int(v) for v in CYLINDER_MEASURE_ROI]
    cv2.rectangle(frame, (gx1, gy1), (gx2, gy2), (0, 255, 255), 2)
    cv2.putText(
        frame, "CYLINDER ROI", (gx1, max(0, gy1 - 8)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
    )
    return frame


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


def draw_track(frame, t: Track, resolution_ok: bool = True):
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
        height_txt = "None" if t.body_height_px is None else f"{t.body_height_px:.1f}px"
        flip_txt = "None" if t.flipped is None else str(t.flipped)
        dx_dy_txt = "dx:None dy:None tilt:None"
        if t.head is not None and t.tail is not None:
            dx_val = abs(float(t.head[0] - t.tail[0]))
            dy_val = abs(float(t.head[1] - t.tail[1]))
            tilt_val = float(np.degrees(np.arctan2(dy_val, max(dx_val, 1e-6))))
            dx_dy_txt = f"dx:{dx_val:.1f}px dy:{dy_val:.1f}px tilt:{tilt_val:.1f}deg"
        cv2.putText(frame, f"flip:{flip_txt} len:{length_txt} h(depth):{height_txt}", (x1, min(frame.shape[0] - 5, y2 + 40)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255) if t.abnormal else (255, 255, 255), 2)
        cv2.putText(frame, f"{dx_dy_txt} abnormal:{t.abnormal_reason}", (x1, min(frame.shape[0] - 5, y2 + 62)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255) if t.abnormal else (255, 255, 255), 2)
        growth_ok, growth_reason = cylinder_inside_candidate(t)
        if not resolution_ok:
            growth_ok = False
            growth_reason = "bad_resolution"
        growth_txt = "CYLINDER:CANDIDATE" if growth_ok else f"CYLINDER:NO({growth_reason})"
        cv2.putText(frame, growth_txt, (x1, min(frame.shape[0] - 5, y2 + 84)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0) if growth_ok else (0, 165, 255), 2)
        frame = draw_pose(frame, t)
    return frame


def count_saved_samples_for_date(target_date: str) -> int:
    """Return number of saved raw growth samples for the given date."""
    path = os.path.join(GROWTH_LOG_DIR, f"growth_samples_{target_date}.csv")
    if not os.path.exists(path):
        return 0
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            return max(0, sum(1 for _ in f) - 1)
    except Exception as e:
        print(f"[GROWTH SAVE CHECK] failed to count samples: {e}")
        return 0


def draw_info(frame, selected_tid, detect_now, pose_now, fps, current_date, saved_today_count=0, growth_event_id=0, cylinder_inside_status="OUTSIDE"):
    lines = [
        f"Selected target ID: {selected_tid if selected_tid is not None else 'None'}",
        f"Detect now: {detect_now} | Pose now: {pose_now}",
        f"FPS: {fps:.1f}",
        f"Date: {current_date}",
        f"SAVED TODAY: {saved_today_count}",
        f"EVENTS TODAY: {growth_event_id}",
        f"CYLINDER AUTO: {cylinder_inside_status}",
        "Keys: q=quit, r=reset target, s=test summary"
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
    원본과 동일하게 selected target payload를 localhost:80/posi로 HTTP POST 전송한다.
    반환값만 추가하여 전송 성공 여부를 화면/터미널에서 확인할 수 있게 한다.
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
            status = int(res.status)
            return True, status, None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        if PRINT_PAYLOAD:
            print(f"[WARN] HTTP POST failed: {e}")
        return False, None, str(e)


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
        "body_height_px": t.body_height_px,
    }


def make_web_compatible_payload(payload: dict, source_w: int, source_h: int) -> dict:
    """1920x1080 측정값은 내부에 유지하고, 웹 전송 좌표만 원본 1280x720 기준으로 환산."""
    if source_w <= 0 or source_h <= 0:
        return payload
    sx = WEB_PAYLOAD_WIDTH / float(source_w)
    sy = WEB_PAYLOAD_HEIGHT / float(source_h)
    sl = (sx + sy) / 2.0
    p = dict(payload)
    bbox = payload.get("bbox")
    if bbox is not None and len(bbox) == 4:
        p["bbox"] = [bbox[0]*sx, bbox[1]*sy, bbox[2]*sx, bbox[3]*sy]
    cp = payload.get("center_px")
    if cp is not None and len(cp) == 2:
        p["center_px"] = [cp[0]*sx, cp[1]*sy]
    kps = payload.get("keypoints")
    if isinstance(kps, dict):
        p["keypoints"] = {
            name: (None if pt is None else [pt[0]*sx, pt[1]*sy])
            for name, pt in kps.items()
        }
    for key in ("velocity_px_s", "distance_px_total", "distance_px_10s", "body_length_px", "body_height_px"):
        value = payload.get(key)
        if value is not None:
            p[key] = float(value) * sl
    p["source_frame_size"] = [int(source_w), int(source_h)]
    p["payload_coord_size"] = [WEB_PAYLOAD_WIDTH, WEB_PAYLOAD_HEIGHT]
    return p


# =========================================================
# Main
# =========================================================


def save_cylinder_label_sample(t, frame_id, w, h, label, now_wall, last_save_state):
    """Save labeled INSIDE/FRONT samples for learning a cylinder-membership filter."""
    if t is None or t.head is None or t.tail is None:
        return last_save_state
    if now_wall - last_save_state.get(label, 0.0) < CYLINDER_LABEL_SAVE_EVERY_SEC:
        return last_save_state

    x1, y1, x2, y2 = [float(v) for v in t.box]
    bw, bh = x2 - x1, y2 - y1
    cx, cy = center(t.box)
    head = t.head
    tail = t.tail
    dorsal = t.dorsal
    belly = t.belly
    length = t.body_length_px
    body_h = None
    if dorsal is not None and belly is not None:
        body_h = abs(float(dorsal[1]) - float(belly[1]))
    tilt = None
    if head is not None and tail is not None:
        dx = float(head[0] - tail[0]); dy = float(head[1] - tail[1])
        tilt = float(np.degrees(np.arctan2(abs(dy), max(1e-6, abs(dx)))))

    row = {
        "datetime": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now_wall)),
        "timestamp": float(now_wall),
        "label": label,
        "frame_id": int(frame_id),
        "track_id": int(t.tid),
        "body_length_px": None if length is None else float(length),
        "body_height_px": body_h,
        "pose_conf": float(t.pose_conf),
        "bbox_x1": x1, "bbox_y1": y1, "bbox_x2": x2, "bbox_y2": y2,
        "bbox_w": float(bw), "bbox_h": float(bh), "bbox_area": float(max(0.0,bw)*max(0.0,bh)),
        "center_x": float(cx), "center_y": float(cy),
        "frame_w": int(w), "frame_h": int(h),
        "head_x": float(head[0]), "head_y": float(head[1]),
        "tail_x": float(tail[0]), "tail_y": float(tail[1]),
        "head_tail_dx": float(head[0]-tail[0]), "head_tail_dy": float(head[1]-tail[1]),
        "side_tilt_deg": tilt,
        "facing": "right" if float(head[0]) > float(tail[0]) else "left",
        "flipped": t.flipped,
    }

    os.makedirs(GROWTH_LOG_DIR, exist_ok=True)
    import csv
    exists = os.path.isfile(CYLINDER_LABEL_LOG)
    with open(CYLINDER_LABEL_LOG, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not exists or os.path.getsize(CYLINDER_LABEL_LOG) == 0:
            writer.writeheader()
        writer.writerow(row)
    last_save_state[label] = now_wall
    print(f"[CYLINDER {label}] saved -> {CYLINDER_LABEL_LOG}")
    return last_save_state

def main():
    global clicked_point
    detect_model, pose_model = load_models()
    cap = cv2.VideoCapture(VIDEO_SOURCE, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAM_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAM_HEIGHT)

    # 성장 측정은 픽셀 길이를 사용하므로 실제 입력 프레임 해상도가 항상 같아야 한다.
    # 일부 Windows/OpenCV 카메라 드라이버는 스트림이 시작되기 전 CAP_PROP 값을 0x0으로
    # 돌려주기도 하므로 cap.get()이 아니라 첫 실제 프레임의 shape로 검증한다.
    first_ok, first_frame = cap.read()
    if not first_ok or first_frame is None:
        print("[ERROR] 첫 카메라 프레임을 읽지 못했습니다. 프로그램을 종료합니다.")
        cap.release()
        return

    actual_h, actual_w = first_frame.shape[:2]
    resolution_ok = (actual_w == CAM_WIDTH and actual_h == CAM_HEIGHT)
    print(f"[INFO] camera requested: {CAM_WIDTH}x{CAM_HEIGHT}, actual frame: {actual_w}x{actual_h}")
    if resolution_ok:
        print("[GROWTH RESOLUTION] OK - 성장 측정/저장 허용")
    else:
        print(
            f"[GROWTH RESOLUTION BLOCK] 실제 프레임이 {actual_w}x{actual_h}입니다. "
            f"요청한 {CAM_WIDTH}x{CAM_HEIGHT}와 달라 성장 측정 저장을 차단합니다. "
            "영상/디텍션/전송은 계속 실행됩니다."
        )

    tracker = MultiTracker()
    selected_tid = None
    frame_id = 0
    last_pose_candidates = []

    cv2.namedWindow(WINDOW_NAME)
    cv2.setMouseCallback(WINDOW_NAME, mouse_callback)
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM) if SEND_UDP else None
    prev_time = time.time()
    cylinder_label_mode = None  # None / "INSIDE" / "FRONT"
    cylinder_label_last_save = {"INSIDE": 0.0, "FRONT": 0.0}
    cylinder_label_counts = {"INSIDE": 0, "FRONT": 0}
    print(f"[CYLINDER LABEL] CSV save path: {CYLINDER_LABEL_LOG}")
    http_ok_count = 0
    http_last_status = "HTTP: waiting" if SEND_HTTP else "HTTP: disabled"
    last_growth_save_time = 0.0
    last_growth_good_time = None
    growth_event_id = 0

    # 원통 내부 자동확정 상태
    cylinder_inside_candidate_since = None  # 이전 로그/상태 호환용
    cylinder_inside_last_good = None
    cylinder_inside_confirmed = False
    cylinder_inside_status = "OUTSIDE"
    # (timestamp, candidate_ok) 최근 2초 판정 이력
    cylinder_candidate_history = []

    # ---- 자정 롤오버 처리용 ----
    # 프로그램을 여러 날 켜놓을 것이므로, 루프 안에서 날짜가 바뀌는 순간을 감지해서
    # 방금 끝난 날짜의 daily summary를 그때그때 저장한다.
    current_date = datetime.now().strftime("%Y-%m-%d")
    saved_today_count = count_saved_samples_for_date(current_date)
    print(f"[GROWTH SAVE CHECK] {current_date} existing saved samples: {saved_today_count}")
    # 시간대별 검증용. 프로그램은 계속 측정하고, 매 정각 직전 1시간을 자동 요약한다.
    current_hour = datetime.now().strftime("%Y-%m-%d %H")

    pending_first_frame = first_frame
    while True:
        if pending_first_frame is not None:
            frame = pending_first_frame
            pending_first_frame = None
            ok = True
        else:
            ok, frame = cap.read()
        if not ok or frame is None:
            print("[WARN] frame read failed")
            break

        h, w = frame.shape[:2]

        # 실행 중 드라이버가 해상도를 바꾸는 경우도 즉시 감지한다.
        frame_resolution_ok = (w == CAM_WIDTH and h == CAM_HEIGHT)
        if frame_resolution_ok != resolution_ok:
            resolution_ok = frame_resolution_ok
            if resolution_ok:
                print(f"[GROWTH RESOLUTION] restored to {w}x{h} - 성장 측정/저장 재개")
            else:
                print(
                    f"[GROWTH RESOLUTION BLOCK] frame changed to {w}x{h}; "
                    f"expected {CAM_WIDTH}x{CAM_HEIGHT}. 성장 측정/저장 차단."
                )
        timestamp = time.time()
        tracker.predict_all(w, h)

        # 시간 변경 감지: 정각을 넘기면 방금 끝난 1시간을 자동 요약한다.
        now_hour = datetime.now().strftime("%Y-%m-%d %H")
        if now_hour != current_hour:
            summarize_hourly_growth(current_hour)
            current_hour = now_hour

        # 날짜 변경 감지: 자정을 넘기면 어제 날짜를 요약하고 오늘 날짜로 갱신.
        now_date = datetime.now().strftime("%Y-%m-%d")
        if now_date != current_date:
            print(f"[GROWTH] date changed: {current_date} -> {now_date}, summarizing previous day")
            summarize_daily_growth(current_date)
            current_date = now_date
            last_growth_save_time = 0.0
            last_growth_good_time = None
            cylinder_inside_candidate_since = None
            cylinder_inside_last_good = None
            cylinder_inside_confirmed = False
            cylinder_inside_status = "OUTSIDE"
            cylinder_candidate_history = []
            growth_event_id = 0
            saved_today_count = count_saved_samples_for_date(current_date)

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

                # ---------------------------------------------------------
                # 실제 원통 내부 자동 확정
                # ---------------------------------------------------------
                now_growth = time.time()
                candidate_ok, candidate_reason = cylinder_inside_candidate(t)
                if not resolution_ok:
                    candidate_ok = False
                    candidate_reason = f"bad_resolution_{w}x{h}"

                # ---------------------------------------------------------
                # 최근 2초 중 75% 이상 후보 조건 통과 -> 실제 원통 내부 확정
                # 기존 speed <= 30, bbox_h <= 120, ROI, pose/tilt 조건은 그대로 유지한다.
                # 단 한 프레임 실패로 타이머를 0으로 만들지 않는 것이 핵심이다.
                # ---------------------------------------------------------
                cylinder_candidate_history.append((now_growth, bool(candidate_ok)))
                window_start = now_growth - CYLINDER_INSIDE_CONFIRM_SEC
                cylinder_candidate_history = [
                    (ts_hist, ok_hist)
                    for ts_hist, ok_hist in cylinder_candidate_history
                    if ts_hist >= window_start
                ]

                if candidate_ok:
                    cylinder_inside_last_good = now_growth

                if cylinder_candidate_history:
                    observed_sec = now_growth - cylinder_candidate_history[0][0]
                    pass_count = sum(1 for _, ok_hist in cylinder_candidate_history if ok_hist)
                    pass_ratio = pass_count / float(len(cylinder_candidate_history))
                else:
                    observed_sec = 0.0
                    pass_ratio = 0.0

                # 최근 창이 충분히 쌓인 뒤에만 확정한다.
                window_ready = observed_sec >= (CYLINDER_INSIDE_CONFIRM_SEC * 0.95)
                ratio_ok = window_ready and pass_ratio >= CYLINDER_INSIDE_REQUIRED_RATIO

                if ratio_ok:
                    if not cylinder_inside_confirmed:
                        print(
                            f"[CYLINDER INSIDE] CONFIRMED | recent "
                            f"{pass_ratio*100:.0f}%/{CYLINDER_INSIDE_CONFIRM_SEC:.1f}s | "
                            f"bbox_h={float(t.box[3]-t.box[1]):.1f}px | "
                            f"speed={float(t.velocity_px_s):.1f}px/s"
                        )
                    cylinder_inside_confirmed = True
                    cylinder_inside_status = f"INSIDE {pass_ratio*100:.0f}%"
                else:
                    # 확정 전에는 최근 2초 누적 비율을 보여준다.
                    if not cylinder_inside_confirmed:
                        if observed_sec < (CYLINDER_INSIDE_CONFIRM_SEC * 0.95):
                            cylinder_inside_status = (
                                f"CHECK {pass_ratio*100:.0f}% "
                                f"({observed_sec:.1f}/{CYLINDER_INSIDE_CONFIRM_SEC:.1f}s)"
                            )
                        else:
                            cylinder_inside_status = (
                                f"CHECK {pass_ratio*100:.0f}% "
                                f"(need {CYLINDER_INSIDE_REQUIRED_RATIO*100:.0f}%)"
                            )
                    else:
                        # 이미 INSIDE였던 경우에는 기존 0.35초 grace를 유지한다.
                        if (
                            cylinder_inside_last_good is not None
                            and (now_growth - cylinder_inside_last_good) <= CYLINDER_INSIDE_FAIL_GRACE_SEC
                        ):
                            cylinder_inside_status = f"INSIDE(grace) {pass_ratio*100:.0f}%"
                        else:
                            print(
                                f"[CYLINDER INSIDE] LOST: {candidate_reason} | "
                                f"recent={pass_ratio*100:.0f}%"
                            )
                            cylinder_inside_confirmed = False
                            cylinder_inside_status = (
                                f"CHECK {pass_ratio*100:.0f}% "
                                f"(need {CYLINDER_INSIDE_REQUIRED_RATIO*100:.0f}%)"
                            )

                # INSIDE 확정 상태는 grace 동안 유지할 수 있지만,
                # 실제 성장 샘플은 "현재 프레임"도 candidate 조건을 만족할 때만 저장한다.
                # 이렇게 해야 pose가 순간적으로 None/불량이 된 grace 프레임이 저장되지 않는다.
                growth_ok = bool(cylinder_inside_confirmed and resolution_ok and candidate_ok)
                growth_reason = "ok_cylinder_inside_confirmed" if growth_ok else candidate_reason

                if growth_ok:
                    # 좋은 측정 상태가 일정 시간 이상 끊겼다가 다시 들어오면 새 "독립 측정 이벤트".
                    if last_growth_good_time is None or (now_growth - last_growth_good_time) >= GROWTH_EVENT_BREAK_SEC:
                        growth_event_id += 1
                        print(f"[GROWTH] new measurement event: {growth_event_id}")
                    last_growth_good_time = now_growth

                    if now_growth - last_growth_save_time >= SAVE_GROWTH_EVERY_SEC:
                        save_growth_sample(t, frame_id, w, h, growth_event_id, growth_reason)
                        last_growth_save_time = now_growth
                        saved_today_count += 1
                        length_txt = "None" if t.body_length_px is None else f"{t.body_length_px:.1f}px"
                        height_txt = "None" if t.body_height_px is None else f"{t.body_height_px:.1f}px"
                        print(
                            f"[GROWTH SAVE] #{saved_today_count} | len={length_txt} | "
                            f"h(depth)={height_txt} | event={growth_event_id} | ID={t.tid}"
                        )

                break

        # INSIDE / FRONT 라벨 수집: 성장 저장 조건과 별개로, 사용자가 선택한 라벨을 1초마다 저장
        if cylinder_label_mode is not None:
            label_track = tracker.get_track_by_id(selected_tid) if selected_tid is not None else None
            before = cylinder_label_last_save.get(cylinder_label_mode, 0.0)
            cylinder_label_last_save = save_cylinder_label_sample(
                label_track, frame_id, w, h, cylinder_label_mode, time.time(), cylinder_label_last_save
            )
            after = cylinder_label_last_save.get(cylinder_label_mode, 0.0)
            if after > before:
                cylinder_label_counts[cylinder_label_mode] += 1

        transport_payload = None
        if selected_payload is not None:
            transport_payload = make_web_compatible_payload(selected_payload, w, h)

        if udp_sock is not None and transport_payload is not None:
            send_udp(udp_sock, transport_payload)
        if SEND_HTTP and transport_payload is not None:
            http_ok, http_status, http_error = send_http_post(transport_payload)
            if http_ok:
                http_ok_count += 1
                http_last_status = f"HTTP: OK {http_status} | sent {http_ok_count}"
                if http_ok_count == 1 or http_ok_count % HTTP_OK_PRINT_EVERY == 0:
                    print(f"[HTTP OK] {HTTP_URL} status={http_status} sent={http_ok_count} coord={WEB_PAYLOAD_WIDTH}x{WEB_PAYLOAD_HEIGHT} source={w}x{h}")
            else:
                http_last_status = "HTTP: FAIL"
        if PRINT_PAYLOAD and transport_payload is not None and frame_id % PRINT_EVERY_N_FRAMES == 0:
            print(json.dumps(transport_payload, ensure_ascii=False))

        now = time.time()
        fps = 1.0 / max(1e-6, now - prev_time)
        prev_time = now

        vis = frame.copy()
        vis = draw_growth_roi(vis)

        # 화면은 tracked만 표시해서 lost track이 여러 개 쌓여 보이지 않게 함.
        # selected target이 lost 상태일 때만 예외적으로 표시.
        display_tracks = tracker.tracked_tracks()
        selected_track = tracker.get_track_by_id(selected_tid)
        if selected_track is not None and selected_track.state == "lost":
            if selected_track not in display_tracks:
                display_tracks.append(selected_track)

        for t in display_tracks:
            vis = draw_track(vis, t)

        vis = draw_info(
            vis, selected_tid, detect_now, pose_now, fps, current_date,
            saved_today_count, growth_event_id, cylinder_inside_status
        )
        cv2.putText(
            vis, http_last_status, (20, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
            (0, 255, 0) if "OK" in http_last_status else (0, 0, 255), 2
        )
        mode_txt = cylinder_label_mode if cylinder_label_mode is not None else "OFF"
        cv2.putText(vis, f"CYLINDER LABEL: {mode_txt}", (20, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,255), 2)
        cv2.putText(vis, f"INSIDE:{cylinder_label_counts['INSIDE']}  FRONT:{cylinder_label_counts['FRONT']}", (20, 178), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255,255,255), 2)
        cv2.putText(vis, "Keys: i=INSIDE  f=FRONT  o=OFF", (20, 206), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2)
        cv2.imshow(WINDOW_NAME, vis)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27:
            break
        elif key == ord('r'):
            selected_tid = None
            clicked_point = None
            tracker.set_selected(None)
            print("[INFO] target reset")
        elif key == ord('i'):
            cylinder_label_mode = "INSIDE"
            print("[CYLINDER LABEL] INSIDE mode")
        elif key == ord('f'):
            cylinder_label_mode = "FRONT"
            print("[CYLINDER LABEL] FRONT mode")
        elif key == ord('o'):
            cylinder_label_mode = None
            print("[CYLINDER LABEL] OFF")
        elif key == ord('s'):
            print("[GROWTH TEST] 현재까지의 측정값으로 즉시 요약합니다...")
            summarize_daily_growth(current_date, test_mode=True)
            # s키를 누르면 현재 진행 중인 시간대도 중간 점검용으로 갱신한다.
            summarize_hourly_growth(current_hour)
        frame_id += 1

    # 종료 시 현재 진행 중이던 시간대와 날짜분도 저장한다.
    summarize_hourly_growth(current_hour)
    summarize_daily_growth(current_date)

    cap.release()
    cv2.destroyAllWindows()
    if udp_sock is not None:
        udp_sock.close()
    print("[DONE]")


if __name__ == "__main__":
    main()