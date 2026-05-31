import argparse
import numpy as np
from ultralytics import YOLO


def scalar(x):
    try:
        return float(x)
    except Exception:
        return float(np.asarray(x).mean())


def eval_detect(model_path, data_yaml):
    model = YOLO(model_path)
    metrics = model.val(data=data_yaml, split="val", verbose=True)

    print("\n===== DETECTION =====")
    print(f"mAP50-95 : {scalar(metrics.box.map):.4f}")
    print(f"Recall   : {scalar(metrics.box.r):.4f}")


def eval_pose(model_path, data_yaml):
    model = YOLO(model_path)
    metrics = model.val(data=data_yaml, split="val", verbose=True)

    print("\n===== POSE =====")
    print(f"OKS mAP : {scalar(metrics.pose.map):.4f}")
    print(f"AR/Recall: {scalar(metrics.pose.r):.4f}")
def eval_track(gt_csv, pred_csv, iou_thr=0.5):
    import pandas as pd

    gt = pd.read_csv(gt_csv)
    pred = pd.read_csv(pred_csv)

    def iou(a, b):
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b

        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)

        if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
            return 0.0

        inter = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
        area_a = (ax2 - ax1) * (ay2 - ay1)
        area_b = (bx2 - bx1) * (by2 - by1)

        return inter / (area_a + area_b - inter + 1e-6)

    gt_frames = sorted(gt["frame_id"].unique())

    matched = 0
    misses = 0
    false_positive = 0

    for frame in gt_frames:
        g = gt[gt["frame_id"] == frame]
        p = pred[pred["frame_id"] == frame]

        if len(g) == 0:
            continue

        gt_box = g.iloc[0][["x1", "y1", "x2", "y2"]].tolist()

        if len(p) == 0:
            misses += 1
            continue

        pred_box = p.iloc[0][["x1", "y1", "x2", "y2"]].tolist()

        score = iou(gt_box, pred_box)

        if score >= iou_thr:
            matched += 1
        else:
            misses += 1
            false_positive += 1

    total_gt = len(gt_frames)

    idf1 = matched / max(total_gt, 1)
    mota = 1 - ((misses + false_positive) / max(total_gt, 1))

    print("\n===== TRACKING =====")
    print(f"IDF1 : {idf1:.4f}")
    print(f"MOTA : {mota:.4f}")
    print(f"Matched: {matched}/{total_gt}")
    import pandas as pd
    import motmetrics as mm

    gt = pd.read_csv(gt_csv)
    pred = pd.read_csv(pred_csv)

    acc = mm.MOTAccumulator(auto_id=True)

    frames = sorted(gt["frame_id"].unique())

    for frame in frames:
        gt_f = gt[gt["frame_id"] == frame]
        pr_f = pred[pred["frame_id"] == frame]

        gt_ids = gt_f["gt_id"].tolist()
        pr_ids = pr_f["track_id"].tolist()

        gt_boxes = gt_f[["x1", "y1", "x2", "y2"]].values
        pr_boxes = pr_f[["x1", "y1", "x2", "y2"]].values

        if len(gt_boxes) == 0 or len(pr_boxes) == 0:
            acc.update(gt_ids, pr_ids, [])
            continue

        dists = mm.distances.iou_matrix(
            gt_boxes,
            pr_boxes,
            max_iou=0.5
        )

        acc.update(gt_ids, pr_ids, dists)

    mh = mm.metrics.create()
    summary = mh.compute(acc, metrics=["idf1", "mota"], name="fish")

    print("\n===== TRACKING =====")
    print(summary)

def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="cmd", required=True)

    p1 = subparsers.add_parser("detect")
    p1.add_argument("--model", required=True)
    p1.add_argument("--data", required=True)

    p2 = subparsers.add_parser("pose")
    p2.add_argument("--model", required=True)
    p2.add_argument("--data", required=True)

    p3 = subparsers.add_parser("track")
    p3.add_argument("--gt", required=True)
    p3.add_argument("--pred", required=True)
    args = parser.parse_args()

    if args.cmd == "detect":
        eval_detect(args.model, args.data)
    elif args.cmd == "pose":
        eval_pose(args.model, args.data)
    elif args.cmd == "track":
        eval_track(args.gt, args.pred)


if __name__ == "__main__":
    main()