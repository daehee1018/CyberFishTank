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


def iou(boxA, boxB) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0, xB - xA)
    inter_h = max(0, yB - yA)
    inter = inter_w * inter_h

    areaA = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    areaB = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])

    denom = areaA + areaB - inter
    if denom <= 0:
        return 0.0
    return inter / denom


def point_in_box(x, y, box) -> bool:
    x1, y1, x2, y2 = box
    return x1 <= x <= x2 and y1 <= y <= y2


# ---------- Data structure ----------
@dataclass
class Track:
    tid: int
    box: np.ndarray
    age: int = 0
    missed: int = 0


# ---------- YOLO detect ----------
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
            f"TRACKING ID {t.tid}",
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


def draw_candidates(frame, dets):
    for i, d in enumerate(dets):
        x1, y1, x2, y2 = [int(v) for v in d["bbox"]]
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 200, 0), 2)
        cv2.putText(
            frame,
            f"candidate {i}",
            (x1, max(0, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 200, 0),
            2
        )
    return frame


# ---------- Mouse state ----------
clicked_point = None

def mouse_callback(event, x, y, flags, param):
    global clicked_point
    if event == cv2.EVENT_LBUTTONDOWN:
        clicked_point = (x, y)


def choose_target_by_click(dets, click_xy):
    if click_xy is None:
        return None

    for d in dets:
        if point_in_box(click_xy[0], click_xy[1], d["bbox"]):
            return d
    return None


def choose_best_match(dets, frame, ref_feat, last_box, dist_thr=80, hist_thr=0.6):
    if len(dets) == 0:
        return None

    best_det = None
    best_score = 1e18

    last_c = center(last_box) if last_box is not None else None

    for d in dets:
        box = d["bbox"]
        feat = hsv_hist_feat(frame, box)
        if feat is None:
            continue

        hdist = hist_dist(ref_feat, feat) if ref_feat is not None else 0.0

        if last_c is not None:
            cdist = l2(center(box), last_c)
            iou_score = iou(box, last_box)
        else:
            cdist = 0.0
            iou_score = 0.0

        # 점수는 낮을수록 좋음
        score = hdist * 100 + cdist - iou_score * 30

        # 너무 멀고 너무 다르면 후보 제외
        if last_box is not None and cdist > dist_thr * 4 and hdist > hist_thr:
            continue

        if score < best_score:
            best_score = score
            best_det = d

    return best_det


def main():
    global clicked_point

    model_path = "yolov8n.pt"
    url = "http://192.168.31.14:8080/video"

    conf_thr = 0.3
    max_missed = 30
    cls_filter = None

    save_jsonl = True
    save_csv = True

    out_dets = "detections.jsonl"
    out_tracks = "tracks.jsonl"
    out_features = "features.csv"

    model = YOLO(model_path)
    cap = cv2.VideoCapture(url)

    if not cap.isOpened():
        raise RuntimeError(f"카메라 스트림을 열 수 없음: {url}")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)

    cv2.namedWindow("Realtime Detection + Tracking")
    cv2.setMouseCallback("Realtime Detection + Tracking", mouse_callback)

    current_id = 1
    ref_feat = None
    last_box = None
    missed = 0
    target_locked = False

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

        dets = yolo_detect_ultralytics(model, frame, conf=conf_thr, cls_filter=cls_filter)

        for d in dets:
            d["bbox"] = clamp_xyxy(d["bbox"], w, h)

        if det_f is not None:
            det_f.write(json.dumps({"frame_id": fid, "dets": dets}, ensure_ascii=False) + "\n")

        box = None
        real_detection_this_frame = False

        # ---------------- 아직 객체를 선택하지 않은 상태 ----------------
        if not target_locked:
            vis = frame.copy()
            vis = draw_candidates(vis, dets)

            cv2.putText(
                vis,
                "Click the object you want to track",
                (20, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (0, 255, 255),
                2
            )

            chosen = choose_target_by_click(dets, clicked_point)
            if chosen is not None:
                box = np.array(chosen["bbox"], dtype=np.float32)
                ref_feat = hsv_hist_feat(frame, chosen["bbox"])
                last_box = box
                missed = 0
                target_locked = True
                real_detection_this_frame = True
                print(f"[INFO] target selected: ID {current_id}")
                clicked_point = None

            cv2.imshow("Realtime Detection + Tracking", vis)

        # ---------------- 이미 선택한 객체만 추적 ----------------
        else:
            chosen = choose_best_match(
                dets=dets,
                frame=frame,
                ref_feat=ref_feat,
                last_box=last_box,
                dist_thr=80,
                hist_thr=0.7
            )

            if chosen is not None:
                box = np.array(chosen["bbox"], dtype=np.float32)
                feat = hsv_hist_feat(frame, chosen["bbox"])
                if feat is not None and ref_feat is not None:
                    ref_feat = 0.9 * ref_feat + 0.1 * feat
                elif feat is not None:
                    ref_feat = feat

                last_box = box
                missed = 0
                real_detection_this_frame = True
            else:
                missed += 1
                if missed <= max_missed and last_box is not None:
                    box = last_box
                else:
                    box = None

        tracks: List[Track] = []
        if box is not None and target_locked:
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

        for t in tracks:
            c = center(t.box)
            if t.tid in last_center_by_id:
                total_dist_by_id[t.tid] = total_dist_by_id.get(t.tid, 0.0) + l2(last_center_by_id[t.tid], c)
            last_center_by_id[t.tid] = c
            print(f"ID {t.tid} center: ({int(c[0])}, {int(c[1])})")

        if target_locked:
            vis = draw_tracks(frame.copy(), tracks)
            cv2.putText(
                vis,
                "Tracking selected object only",
                (20, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (0, 255, 255),
                2
            )
            cv2.imshow("Realtime Detection + Tracking", vis)

        key = cv2.waitKey(1) & 0xFF
        if key == 27:   # ESC
            break
        elif key == ord('r'):
            # 다시 선택 모드로 돌아가기
            target_locked = False
            ref_feat = None
            last_box = None
            missed = 0
            clicked_point = None
            print("[INFO] target reset")

        fid += 1

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