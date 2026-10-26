import json
import random
import shutil
from pathlib import Path

# =========================================================
# Config
# =========================================================
SOURCES = [
    {
        "name": "base",
        "dir": Path(r"C:\Users\jsh14\Desktop\s\fish_raw"),
        "max_items": None,   # 기존 pose 전부 사용
    },
    {
        "name": "extra",
        "dir": Path(r"C:\Users\jsh14\Desktop\s\train_extra_detect_all\images"),
        "max_items": None,   # 새로 라벨링한 pose 전부 사용
    },
    {
        "name": "flip",
        "dir": Path(r"C:\Users\jsh14\Desktop\s\fish_pose_flip_aug"),
        "max_items": 100,    # flip augmentation은 100장만 사용
    },
]

OUT_DIR = Path(r"C:\Users\jsh14\Desktop\s\fish_pose_dataset_v2")

TRAIN_RATIO = 0.8
SEED = 42

KEYPOINT_ORDER = ["head", "dorsal", "tail", "belly"]

random.seed(SEED)


# =========================================================
# Utils
# =========================================================
def find_shape(shapes, label, shape_type=None):
    for s in shapes:
        if s.get("label") != label:
            continue
        if shape_type is not None and s.get("shape_type") != shape_type:
            continue
        return s
    return None


def norm_bbox(points, w, h):
    (x1, y1), (x2, y2) = points
    x_min, x_max = sorted([x1, x2])
    y_min, y_max = sorted([y1, y2])

    xc = ((x_min + x_max) / 2) / w
    yc = ((y_min + y_max) / 2) / h
    bw = (x_max - x_min) / w
    bh = (y_max - y_min) / h

    return xc, yc, bw, bh


def norm_point(point, w, h):
    x, y = point
    return x / w, y / h


def parse_labelme_json(json_path, src_dir):
    data = json.loads(json_path.read_text(encoding="utf-8"))

    image_name = data.get("imagePath")
    img_w = data.get("imageWidth")
    img_h = data.get("imageHeight")
    shapes = data.get("shapes", [])

    if not image_name or not img_w or not img_h:
        return None

    fish = find_shape(shapes, "fish", "rectangle")
    if fish is None:
        return None

    keypoints = []
    for kp in KEYPOINT_ORDER:
        s = find_shape(shapes, kp, "point")
        if s is None:
            return None
        keypoints.append(s["points"][0])

    image_path = src_dir / image_name

    if not image_path.exists():
        image_path = json_path.with_suffix(".jpg")

    if not image_path.exists():
        image_path = json_path.with_suffix(".png")

    if not image_path.exists():
        return None

    bbox = norm_bbox(fish["points"], img_w, img_h)

    kpt_values = []
    for p in keypoints:
        nx, ny = norm_point(p, img_w, img_h)
        # YOLO pose format: x y visibility
        # 2 = visible
        kpt_values.extend([nx, ny, 2])

    return {
        "image_path": image_path,
        "bbox": bbox,
        "keypoints": kpt_values,
        "source_json": json_path,
    }


def collect_items():
    all_items = []

    for source in SOURCES:
        name = source["name"]
        src_dir = source["dir"]
        max_items = source["max_items"]

        if not src_dir.exists():
            print(f"[WARN] source not found: {src_dir}")
            continue

        items = []

        for jp in sorted(src_dir.glob("*.json")):
            parsed = parse_labelme_json(jp, src_dir)
            if parsed is not None:
                parsed["source"] = name
                items.append(parsed)

        random.shuffle(items)

        if max_items is not None:
            items = items[:max_items]

        print(f"[INFO] {name}: {len(items)} valid pose samples")
        all_items.extend(items)

    return all_items


def save_dataset(items):
    if OUT_DIR.exists():
        print(f"[WARN] output exists. Existing files may remain: {OUT_DIR}")

    for split in ["train", "val"]:
        (OUT_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (OUT_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

    random.shuffle(items)

    n_train = int(len(items) * TRAIN_RATIO)

    splits = {
        "train": items[:n_train],
        "val": items[n_train:],
    }

    used_names = set()

    for split, split_items in splits.items():
        img_dir = OUT_DIR / "images" / split
        lbl_dir = OUT_DIR / "labels" / split

        for idx, item in enumerate(split_items):
            src_img = item["image_path"]
            source = item["source"]

            stem = f"{source}_{src_img.stem}"

            # 파일명 중복 방지
            if stem in used_names:
                stem = f"{stem}_{idx:05d}"
            used_names.add(stem)

            dst_img = img_dir / f"{stem}{src_img.suffix.lower()}"
            dst_lbl = lbl_dir / f"{stem}.txt"

            shutil.copy2(src_img, dst_img)

            xc, yc, bw, bh = item["bbox"]
            values = [0, xc, yc, bw, bh, *item["keypoints"]]

            line = " ".join(
                f"{v:.8f}" if isinstance(v, float) else str(v)
                for v in values
            )

            dst_lbl.write_text(line + "\n", encoding="utf-8")

    yaml_text = f"""path: {OUT_DIR.resolve()}
train: images/train
val: images/val

names:
  0: fish

kpt_shape: [4, 3]
flip_idx: [0, 1, 2, 3]
"""

    (OUT_DIR / "data.yaml").write_text(yaml_text, encoding="utf-8")

    print("[DONE] pose dataset v2 created")
    print(f"train: {len(splits['train'])}")
    print(f"val: {len(splits['val'])}")
    print(f"total: {len(items)}")
    print(f"output: {OUT_DIR}")
    print(f"yaml: {OUT_DIR / 'data.yaml'}")


def main():
    items = collect_items()

    if len(items) == 0:
        print("[ERROR] no valid pose samples found")
        return

    save_dataset(items)


if __name__ == "__main__":
    main()