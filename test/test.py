'''import cv2
from ultralytics import YOLO

# YOLOv8 모델 로드
model = YOLO("yolov8n.pt")

# 휴대폰 카메라 스트림 주소
url = "http://192.168.31.14:8080/video"

cap = cv2.VideoCapture(url)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Object Detection
    results = model(frame)

    for r in results:
        boxes = r.boxes

        for box in boxes:
            # 좌표 추출
            x1, y1, x2, y2 = box.xyxy[0]

            x1 = int(x1)
            y1 = int(y1)
            x2 = int(x2)
            y2 = int(y2)

            # 중심 좌표
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)

            print(f"Object center: ({cx}, {cy})")

            # 화면 표시
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2)
            cv2.circle(frame, (cx, cy), 5, (0,0,255), -1)

    cv2.imshow("Object Detection", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()'''
import cv2
import json
import csv
from dataclasses import dataclass
from typing import List, Tuple, Optional

import numpy as np
from ultralytics import YOLO


# ---------- Utils ----------
def center(box) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


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
    return [x1, y1, x2, y2]


# ---------- Appearance feature ----------
def crop_box(frame, box) -> Optional[np.ndarray]:
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(frame.shape[1] - 1, x2), min(frame.shape[0] - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2]


def hsv_hist_feat(frame, box, h_bins=30, s_bins=32) -> Optional[np.ndarray]:
    roi = crop_box(frame, box)
    if roi is None:
        return None

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [h_bins, s_bins], [0, 180, 0, 256])
    hist = cv2.normalize(hist, hist).flatten()
    return hist


def hist_dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(
        cv2.compareHist(a.astype(np.float32), b.astype(np.float32), cv2.HISTCMP_BHATTACHARYYA)
    )


# ---------- Data structure ----------
@dataclass
class Track:
    tid: int
    box: np.ndarray
    age: int = 0
    missed: int = 0

# ---------- YOLO detect ----------
'''def yolo_detect_ultralytics(model, frame, conf=0.3, cls_filter=None):
    results = model.predict(frame, conf=conf, verbose=False)'''
def yolo_detect_ultralytics(model, frame, conf=0.3, cls_filter=None):
    results = model.predict(frame, conf=conf, imgsz=416, verbose=False)
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
            "bbox": [float(x) for x in b.tolist()],
            "conf": float(c),
            "cls": int(k)
        })
    return dets


# ---------- Draw ----------
def draw_tracks(frame, tracks: List[Track]):
    for t in tracks:
        x1, y1, x2, y2 = t.box.astype(int).tolist()
        cx, cy = center(t.box)

        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.circle(frame, (int(cx), int(cy)), 5, (0, 0, 255), -1)

        cv2.putText(
            frame,
            f"ID {t.tid}",
            (x1, max(0, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            f"({int(cx)}, {int(cy)})",
            (x1, y2 + 20 if y2 + 20 < frame.shape[0] else y2 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 0),
            2
        )

    return frame


def main():
    # ---------------- Settings ----------------
    model_path = "yolov8n.pt"
    url = "http://192.168.31.14:8080/video"   # 휴대폰 카메라 주소

    conf_thr = 0.3
    max_missed = 30

    species_dist_thr = 0.35
    species_patience = 8

    save_jsonl = True
    save_csv = True

    out_dets = "detections.jsonl"
    out_tracks = "tracks.jsonl"
    out_features = "features.csv"

    # 필요 시 특정 클래스만 보고 싶으면 넣기
    # 예: 사람만 = [0]
    cls_filter = None

    # ---------------- Load ----------------
    model = YOLO(model_path)
    cap = cv2.VideoCapture(url)

    if not cap.isOpened():
        raise RuntimeError(f"카메라 스트림을 열 수 없음: {url}")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)

    # ---- Single object state ----
    current_id = 1
    ref_feat = None
    change_count = 0

    last_box = None
    missed = 0

    last_center_by_id = {}
    total_dist_by_id = {}

    det_f = open(out_dets, "w", encoding="utf-8") if save_jsonl else None
    trk_f = open(out_tracks, "w", encoding="utf-8") if save_jsonl else None

    fid = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[WARN] 프레임을 읽지 못함")
            break

        '''# 1) Detection
        dets = yolo_detect_ultralytics(model, frame, conf=conf_thr, cls_filter=cls_filter)
        '''
        if fid % 3 == 0:
            dets = yolo_detect_ultralytics(model, frame, conf=conf_thr, cls_filter=cls_filter)
        else:
            dets = []
        for d in dets:
            d["bbox"] = clamp_xyxy(d["bbox"], w, h)

        if det_f is not None:
            det_f.write(json.dumps({"frame_id": fid, "dets": dets}, ensure_ascii=False) + "\n")

        # 2) 단일 객체 모드: confidence 가장 높은 1개만 사용
        if len(dets) > 1:
            dets = [max(dets, key=lambda d: d["conf"])]

        # 3) 현재 박스 결정
        box = None
        real_detection_this_frame = False

        if len(dets) == 1:
            box = np.array(dets[0]["bbox"], dtype=np.float32)
            last_box = box
            missed = 0
            real_detection_this_frame = True
        else:
            missed += 1
            if missed <= max_missed and last_box is not None:
                box = last_box
            else:
                box = None

        # 4) species(외형) 변화 감지
        if real_detection_this_frame:
            feat = hsv_hist_feat(frame, dets[0]["bbox"])
            if feat is not None:
                if ref_feat is None:
                    ref_feat = feat
                else:
                    d = hist_dist(ref_feat, feat)

                    if d > species_dist_thr:
                        change_count += 1
                    else:
                        change_count = 0

                    if change_count >= species_patience:
                        old_id = current_id
                        current_id += 1
                        ref_feat = feat
                        change_count = 0
                        print(f"[INFO] species change at frame {fid}: ID {old_id} -> {current_id}")

        # 5) Track 생성
        tracks: List[Track] = []
        if box is not None:
            tracks = [Track(tid=current_id, box=box, age=fid, missed=missed)]

        if trk_f is not None:
            trk_out = {
                "frame_id": fid,
                "tracks": [
                    {"track_id": t.tid, "bbox": [float(x) for x in t.box.tolist()]}
                    for t in tracks
                ],
            }
            trk_f.write(json.dumps(trk_out, ensure_ascii=False) + "\n")

        # 6) 거리 누적
        for t in tracks:
            c = center(t.box)
            if t.tid in last_center_by_id:
                total_dist_by_id[t.tid] = total_dist_by_id.get(t.tid, 0.0) + l2(last_center_by_id[t.tid], c)
            last_center_by_id[t.tid] = c

            print(f"ID {t.tid} center: ({int(c[0])}, {int(c[1])})")

        # 7) 화면 표시
        vis = draw_tracks(frame.copy(), tracks)
        cv2.imshow("Realtime Detection + Tracking", vis)

        key = cv2.waitKey(1) & 0xFF
        if key == 27:   # ESC
            break

        fid += 1

    # 종료
    cap.release()
    cv2.destroyAllWindows()

    if det_f is not None:
        det_f.close()
    if trk_f is not None:
        trk_f.close()

    if save_csv:
        with open(out_features, "w", newline="", encoding="utf-8") as f:
            writer_csv = csv.DictWriter(f, fieldnames=["track_id", "total_distance_px"])
            writer_csv.writeheader()
            for tid, dist in total_dist_by_id.items():
                writer_csv.writerow({"track_id": tid, "total_distance_px": dist})

    print("[DONE]")


if __name__ == "__main__":
    main()