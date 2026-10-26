import json
import random
import shutil
from pathlib import Path

SRC_DIR = Path("train_extra_detect_all/images")
OUT_DIR = Path("train_extra_detect_yolo")

TRAIN_RATIO = 0.8
SEED = 42

random.seed(SEED)


def norm_bbox(points, w, h):
    (x1, y1), (x2, y2) = points
    x_min, x_max = sorted([x1, x2])
    y_min, y_max = sorted([y1, y2])

    xc = ((x_min + x_max) / 2) / w
    yc = ((y_min + y_max) / 2) / h
    bw = (x_max - x_min) / w
    bh = (y_max - y_min) / h

    return xc, yc, bw, bh


def parse_json(json_path):
    data = json.loads(json_path.read_text(encoding="utf-8"))

    w = data["imageWidth"]
    h = data["imageHeight"]
    image_name = data["imagePath"]

    fish = None
    for s in data["shapes"]:
        if s["label"] == "fish" and s["shape_type"] == "rectangle":
            fish = s
            break

    if fish is None:
        return None

    bbox = norm_bbox(fish["points"], w, h)
    image_path = SRC_DIR / image_name

    if not image_path.exists():
        image_path = json_path.with_suffix(".jpg")

    if not image_path.exists():
        return None

    return image_path, bbox


def main():
    items = []

    for jp in SRC_DIR.glob("*.json"):
        parsed = parse_json(jp)
        if parsed is not None:
            items.append(parsed)

    print(f"[INFO] valid detection labels: {len(items)}")

    random.shuffle(items)
    n_train = int(len(items) * TRAIN_RATIO)

    splits = {
        "train": items[:n_train],
        "val": items[n_train:],
    }

    for split, split_items in splits.items():
        img_dir = OUT_DIR / "images" / split
        lbl_dir = OUT_DIR / "labels" / split
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        for image_path, bbox in split_items:
            dst_img = img_dir / image_path.name
            shutil.copy2(image_path, dst_img)

            label_path = lbl_dir / f"{image_path.stem}.txt"
            xc, yc, bw, bh = bbox
            label_path.write_text(
                f"0 {xc:.8f} {yc:.8f} {bw:.8f} {bh:.8f}\n",
                encoding="utf-8"
            )

    yaml_text = f"""path: {OUT_DIR.resolve()}
train: images/train
val: images/val

names:
  0: fish
"""
    (OUT_DIR / "data.yaml").write_text(yaml_text, encoding="utf-8")

    print(f"[DONE] train: {len(splits['train'])}")
    print(f"[DONE] val: {len(splits['val'])}")
    print(f"[DONE] output: {OUT_DIR}")


if __name__ == "__main__":
    main()