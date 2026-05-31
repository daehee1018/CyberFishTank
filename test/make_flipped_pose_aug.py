import json
import cv2
import shutil
from pathlib import Path

SRC_DIR = Path("fish_raw")
OUT_DIR = Path("fish_pose_flip_aug")

KEYPOINTS = ["head", "dorsal", "tail", "belly"]


def find_shape(shapes, label, shape_type=None):
    for s in shapes:
        if s.get("label") != label:
            continue
        if shape_type is not None and s.get("shape_type") != shape_type:
            continue
        return s
    return None


def has_pose(shapes):
    if find_shape(shapes, "fish", "rectangle") is None:
        return False
    for kp in KEYPOINTS:
        if find_shape(shapes, kp, "point") is None:
            return False
    return True


def rotate_point_180_in_bbox(px, py, x1, y1, x2, y2):
    new_x = x1 + x2 - px
    new_y = y1 + y2 - py
    return new_x, new_y


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    count = 0

    for json_path in SRC_DIR.glob("*.json"):
        data = json.loads(json_path.read_text(encoding="utf-8"))
        shapes = data.get("shapes", [])

        if not has_pose(shapes):
            continue

        image_name = data["imagePath"]
        image_path = SRC_DIR / image_name

        if not image_path.exists():
            continue

        img = cv2.imread(str(image_path))
        if img is None:
            continue

        fish = find_shape(shapes, "fish", "rectangle")
        (bx1, by1), (bx2, by2) = fish["points"]

        x1, x2 = sorted([int(round(bx1)), int(round(bx2))])
        y1, y2 = sorted([int(round(by1)), int(round(by2))])

        h, w = img.shape[:2]
        x1 = max(0, min(x1, w - 1))
        x2 = max(0, min(x2, w - 1))
        y1 = max(0, min(y1, h - 1))
        y2 = max(0, min(y2, h - 1))

        if x2 <= x1 or y2 <= y1:
            continue

        aug = img.copy()

        crop = aug[y1:y2, x1:x2].copy()
        crop_rot = cv2.rotate(crop, cv2.ROTATE_180)
        aug[y1:y2, x1:x2] = crop_rot

        new_image_name = f"{Path(image_name).stem}_flipcrop.jpg"
        new_json_name = f"{Path(image_name).stem}_flipcrop.json"

        new_data = json.loads(json.dumps(data))
        new_data["imagePath"] = new_image_name

        for s in new_data["shapes"]:
            label = s.get("label")

            if label == "fish" and s.get("shape_type") == "rectangle":
                # bbox 위치는 그대로
                s["points"] = [
                    [float(x1), float(y1)],
                    [float(x2), float(y2)]
                ]

            elif label in KEYPOINTS and s.get("shape_type") == "point":
                px, py = s["points"][0]
                nx, ny = rotate_point_180_in_bbox(px, py, x1, y1, x2, y2)
                s["points"] = [[float(nx), float(ny)]]

        cv2.imwrite(str(OUT_DIR / new_image_name), aug)
        (OUT_DIR / new_json_name).write_text(
            json.dumps(new_data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        count += 1

    print(f"[DONE] flipped crop augmented images: {count}")
    print(f"[DONE] output: {OUT_DIR}")


if __name__ == "__main__":
    main()