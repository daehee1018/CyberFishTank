import argparse
import json
import csv
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional

import cv2
import numpy as np


# ---------- Tracker utils ----------
def iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    x1, y1 = max(ax1, bx1), max(ay1, by1)
    x2, y2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, x2 - x1), max(0, y2 - y1)
    inter = iw * ih
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter
    return float(inter / union) if union > 0 else 0.0


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


# ---------- Appearance (color) feature for "species" change ----------
def crop_box(frame, box) -> Optional[np.ndarray]:
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(frame.shape[1] - 1, x2), min(frame.shape[0] - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2]


def hsv_hist_feat(frame, box, h_bins=30, s_bins=32) -> Optional[np.ndarray]:
    """
    HSV (H,S) histogram feature. Good when color changes are strong.
    Returns normalized 1D vector.
    """
    roi = crop_box(frame, box)
    if roi is None:
        return None

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [h_bins, s_bins], [0, 180, 0, 256])
    hist = cv2.normalize(hist, hist).flatten()
    return hist


def hist_dist(a: np.ndarray, b: np.ndarray) -> float:
    """
    Bhattacharyya distance: 0 = identical, larger = more different.
    """
    return float(
        cv2.compareHist(a.astype(np.float32), b.astype(np.float32), cv2.HISTCMP_BHATTACHARYYA)
    )


# ---------- Data structures ----------
@dataclass
class Track:
    tid: int
    box: np.ndarray
    age: int = 0
    missed: int = 0


# ---------- YOLO adapter (Ultralytics) ----------
def yolo_detect_ultralytics(model, frame, conf=0.3, cls_filter=None):
    """
    Returns dets in unified format:
      dets = [{"bbox":[x1,y1,x2,y2], "conf":float, "cls":int}, ...]
    """
    results = model.predict(frame, conf=conf, verbose=False)
    r = results[0]
    dets = []
    if r.boxes is None:
        return dets

    xyxy = r.boxes.xyxy.detach().cpu().numpy()
    confs = r.boxes.conf.detach().cpu().numpy()
    clss = r.boxes.cls.detach().cpu().numpy().astype(int)

    for b, c, k in zip(xyxy, confs, clss):
        if cls_filter is not None and k not in cls_filter:
            continue
        dets.append({"bbox": [float(x) for x in b.tolist()], "conf": float(c), "cls": int(k)})
    return dets


# ---------- Visualization ----------
def draw_tracks(frame, tracks: List[Track]):
    for t in tracks:
        x1, y1, x2, y2 = t.box.astype(int).tolist()
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            frame,
            f"ID {t.tid}",
            (x1, max(0, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
        )
    return frame


# ---------- Main pipeline ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--model", default="yolov8n.pt", help="Ultralytics YOLO model path or name")
    ap.add_argument("--conf", type=float, default=0.3)
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--out_video", default="tracked.mp4")
    ap.add_argument("--out_dets", default="detections.jsonl")
    ap.add_argument("--out_tracks", default="tracks.jsonl")
    ap.add_argument("--out_features", default="features.csv")

    # tracking / robustness knobs
    ap.add_argument("--max_missed", type=int, default=60, help="hold last box for this many missed frames")

    # species (color) change knobs
    ap.add_argument("--species_dist_thr", type=float, default=0.35,
                    help="Bhattacharyya distance threshold for species change (bigger = more strict)")
    ap.add_argument("--species_patience", type=int, default=8,
                    help="need this many consecutive frames above threshold to confirm change")

    args = ap.parse_args()

    from ultralytics import YOLO
    model = YOLO(args.model)

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {args.video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    writer = None
    if args.render:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(args.out_video, fourcc, fps, (w, h))

    # ---- Single-fish state (ID per species segment) ----
    current_id = 1
    ref_feat = None               # reference appearance feature for current species
    change_count = 0              # consecutive frames suggesting species change

    # box hold (for short detector dropouts)
    last_box = None
    missed = 0

    # stats
    last_center_by_id = {}
    total_dist_by_id = {}

    det_f = open(args.out_dets, "w", encoding="utf-8")
    trk_f = open(args.out_tracks, "w", encoding="utf-8")

    fid = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        # 1) Detection
        dets = yolo_detect_ultralytics(model, frame, conf=args.conf, cls_filter=None)

        # clamp to frame bounds
        for d in dets:
            d["bbox"] = clamp_xyxy(d["bbox"], w, h)

        # save raw detections
        det_f.write(json.dumps({"frame_id": fid, "dets": dets}, ensure_ascii=False) + "\n")

        # 1-fish mode: 여러 박스가 나오면 conf 최대 1개만
        if len(dets) > 1:
            dets = [max(dets, key=lambda d: d["conf"])]

        # 2) Determine current box (with hold on missed)
        box = None
        if len(dets) == 1:
            box = np.array(dets[0]["bbox"], dtype=np.float32)
            last_box = box
            missed = 0
        else:
            missed += 1
            if missed <= args.max_missed and last_box is not None:
                box = last_box
            else:
                box = None

        # 3) Species change detection (only when we have a real detection this frame)
        #    We use only frames where det exists (not held boxes) to avoid drift.
        if len(dets) == 1:
            feat = hsv_hist_feat(frame, dets[0]["bbox"])
            if feat is not None:
                if ref_feat is None:
                    ref_feat = feat
                else:
                    d = hist_dist(ref_feat, feat)

                    # consecutive evidence
                    if d > args.species_dist_thr:
                        change_count += 1
                    else:
                        change_count = 0

                    # confirm species change
                    if change_count >= args.species_patience:
                        old_id = current_id
                        current_id += 1
                        ref_feat = feat
                        change_count = 0
                        # optional: reset "hold" so we don't smear previous box
                        # last_box = box
                        print(f"[INFO] species change at frame {fid}: ID {old_id} -> {current_id}")

        # 4) Build tracks output (single track with current_id)
        tracks: List[Track] = []
        if box is not None:
            tracks = [Track(tid=current_id, box=box, age=fid, missed=missed)]

        trk_out = {
            "frame_id": fid,
            "tracks": [{"track_id": t.tid, "bbox": [float(x) for x in t.box.tolist()]} for t in tracks],
        }
        trk_f.write(json.dumps(trk_out, ensure_ascii=False) + "\n")

        # 5) Stats (distance)
        for t in tracks:
            c = center(t.box)
            if t.tid in last_center_by_id:
                total_dist_by_id[t.tid] = total_dist_by_id.get(t.tid, 0.0) + l2(last_center_by_id[t.tid], c)
            last_center_by_id[t.tid] = c

        # 6) Render
        if writer is not None:
            vis = draw_tracks(frame.copy(), tracks)
            writer.write(vis)

        fid += 1
        if fid % 200 == 0:
            print(f"[INFO] processed {fid} frames")

    det_f.close()
    trk_f.close()
    cap.release()
    if writer is not None:
        writer.release()

    # write simple features (pandas 없이)
    with open(args.out_features, "w", newline="", encoding="utf-8") as f:
        writer_csv = csv.DictWriter(f, fieldnames=["track_id", "total_distance_px"])
        writer_csv.writeheader()
        for tid, dist in total_dist_by_id.items():
            writer_csv.writerow({"track_id": tid, "total_distance_px": dist})

    print("[DONE]")
    print("detections:", args.out_dets)
    print("tracks    :", args.out_tracks)
    if args.render:
        print("video     :", args.out_video)
    print("features  :", args.out_features)


if __name__ == "__main__":
    main()