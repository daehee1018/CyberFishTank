import json
import shutil
import argparse
from pathlib import Path


KEYPOINT_ORDER = ["head", "dorsal", "tail", "belly"]


def norm_bbox(points, w, h):
    (x1, y1), (x2, y2) = points
    x_min, x_max = sorted([x1, x2])
    y_min, y_max = sorted([y1, y2])

    xc = ((x_min + x_max) / 2) / w
    yc = ((y_min + y_max) / 2) / h
    bw = (x_max - x_min) / w
    bh = (y_max - y_min) / h

    return xc, yc, bw, bh, x_min, y_min, x_max, y_max


def norm_point(point, w, h):
    x, y = point
    return x / w, y / h


def find_shape(shapes, label, shape_type=None):
    for s in shapes:
        if s.get("label") != label:
            continue
        if shape_type is not None and s.get("shape_type") != shape_type:
            continue
        return s
    return None


def has_all_pose_points(shapes):
    for kp in KEYPOINT_ORDER:
        if find_shape(shapes, kp, "point") is None:
            return False
    return True


def write_yaml(path, dataset_root, is_pose=False):
    if is_pose:
        text = f"""path: {dataset_root.resolve()}
train: images
val: images

names:
  0: fish

kpt_shape: [4, 3]
flip_idx: [0, 1, 2, 3]
"""
    else:
        text = f"""path: {dataset_root.resolve()}
train: images
val: images

names:
  0: fish
"""
    path.write_text(text, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--benchmark", required=True)
    args = parser.parse_args()

    benchmark_dir = Path(args.benchmark)
    labelme_dir = benchmark_dir / "labelme"
    image_dir_candidates = [
        benchmark_dir / "images",
        benchmark_dir / "labelme",
    ]

    if not labelme_dir.exists():
        raise FileNotFoundError(f"LabelMe folder not found: {labelme_dir}")

    image_dir = None
    for cand in image_dir_candidates:
        if cand.exists():
            image_dir = cand
            break

    if image_dir is None:
        raise FileNotFoundError("Image folder not found")

    out_root = benchmark_dir / "eval_dataset"

    det_img_dir = out_root / "detection" / "images"
    det_lbl_dir = out_root / "detection" / "labels"

    pose_img_dir = out_root / "pose" / "images"
    pose_lbl_dir = out_root / "pose" / "labels"

    det_img_dir.mkdir(parents=True, exist_ok=True)
    det_lbl_dir.mkdir(parents=True, exist_ok=True)
    pose_img_dir.mkdir(parents=True, exist_ok=True)
    pose_lbl_dir.mkdir(parents=True, exist_ok=True)

    tracking_rows = ["frame_id,gt_id,x1,y1,x2,y2"]
    full_rows = [
        "frame_id,image_name,has_detection,has_pose,x1,y1,x2,y2,"
        "head_x,head_y,dorsal_x,dorsal_y,tail_x,tail_y,belly_x,belly_y"
    ]

    det_count = 0
    pose_count = 0
    invalid_count = 0

    json_files = sorted(labelme_dir.glob("*.json"))

    for json_path in json_files:
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[WARN] json read failed: {json_path} ({e})")
            invalid_count += 1
            continue

        image_name = data.get("imagePath")
        img_w = data.get("imageWidth")
        img_h = data.get("imageHeight")
        shapes = data.get("shapes", [])

        if not image_name or not img_w or not img_h:
            invalid_count += 1
            continue

        image_path = image_dir / image_name
        if not image_path.exists():
            # LabelMe가 labelme 폴더 기준으로 저장했을 수도 있으니 fallback
            image_path = labelme_dir / image_name

        if not image_path.exists():
            print(f"[WARN] image not found: {image_name}")
            invalid_count += 1
            continue

        fish_shape = find_shape(shapes, "fish", "rectangle")

        # fish bbox가 없으면 detection/tracking 모두 불가
        if fish_shape is None:
            invalid_count += 1
            continue

        xc, yc, bw, bh, x1, y1, x2, y2 = norm_bbox(fish_shape["points"], img_w, img_h)

        stem = Path(image_name).stem

        # frame_id 추출: frame_000120.jpg -> 120
        try:
            frame_id = int(stem.split("_")[-1])
        except Exception:
            frame_id = det_count

        # =====================================================
        # Detection GT: fish rectangle만 있으면 valid
        # =====================================================
        shutil.copy2(image_path, det_img_dir / image_path.name)
        det_label_path = det_lbl_dir / f"{stem}.txt"
        det_label_path.write_text(
            f"0 {xc:.8f} {yc:.8f} {bw:.8f} {bh:.8f}\n",
            encoding="utf-8"
        )
        det_count += 1

        # Tracking GT: single fish니까 gt_id=1
        tracking_rows.append(
            f"{frame_id},1,{x1:.3f},{y1:.3f},{x2:.3f},{y2:.3f}"
        )

        # =====================================================
        # Pose GT: 4 keypoint가 모두 있을 때만 valid
        # =====================================================
        has_pose = has_all_pose_points(shapes)

        head_x = head_y = dorsal_x = dorsal_y = tail_x = tail_y = belly_x = belly_y = ""

        if has_pose:
            kpt_values = []
            raw_points = {}

            for kp in KEYPOINT_ORDER:
                s = find_shape(shapes, kp, "point")
                px, py = s["points"][0]
                nx, ny = norm_point([px, py], img_w, img_h)

                # YOLO pose format: x y v
                # v=2 visible
                kpt_values.extend([nx, ny, 2])

                raw_points[kp] = (px, py)

            shutil.copy2(image_path, pose_img_dir / image_path.name)
            pose_label_path = pose_lbl_dir / f"{stem}.txt"

            values = [0, xc, yc, bw, bh, *kpt_values]
            pose_label_path.write_text(
                " ".join(f"{v:.8f}" if isinstance(v, float) else str(v) for v in values) + "\n",
                encoding="utf-8"
            )

            head_x, head_y = raw_points["head"]
            dorsal_x, dorsal_y = raw_points["dorsal"]
            tail_x, tail_y = raw_points["tail"]
            belly_x, belly_y = raw_points["belly"]

            pose_count += 1

        full_rows.append(
            f"{frame_id},{image_name},1,{int(has_pose)},"
            f"{x1:.3f},{y1:.3f},{x2:.3f},{y2:.3f},"
            f"{head_x},{head_y},{dorsal_x},{dorsal_y},{tail_x},{tail_y},{belly_x},{belly_y}"
        )

    # yaml 저장
    write_yaml(out_root / "detection" / "data.yaml", out_root / "detection", is_pose=False)
    write_yaml(out_root / "pose" / "data.yaml", out_root / "pose", is_pose=True)

    # csv 저장
    (out_root / "tracking_gt.csv").write_text("\n".join(tracking_rows) + "\n", encoding="utf-8")
    (out_root / "benchmark_gt_full.csv").write_text("\n".join(full_rows) + "\n", encoding="utf-8")

    print("[DONE] benchmark eval dataset built")
    print(f"detection valid frames: {det_count}")
    print(f"pose valid frames: {pose_count}")
    print(f"invalid/missing frames: {invalid_count}")
    print(f"detection yaml: {out_root / 'detection' / 'data.yaml'}")
    print(f"pose yaml: {out_root / 'pose' / 'data.yaml'}")
    print(f"tracking gt: {out_root / 'tracking_gt.csv'}")
    print(f"full gt: {out_root / 'benchmark_gt_full.csv'}")


if __name__ == "__main__":
    main()