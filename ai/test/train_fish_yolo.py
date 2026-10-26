import os
import json
import shutil
import random

SRC_DIR = r"C:\Users\jsh14\Desktop\s\fish_raw"
DST_DIR = r"C:\Users\jsh14\Desktop\s\fish_dataset"

TRAIN_RATIO = 0.8


os.makedirs(DST_DIR, exist_ok=True)

for p in [
    "images/train",
    "images/val",
    "labels/train",
    "labels/val",
]:
    os.makedirs(os.path.join(DST_DIR, p), exist_ok=True)


all_json = [
    f for f in os.listdir(SRC_DIR)
    if f.endswith(".json")
]

random.shuffle(all_json)

split_idx = int(len(all_json) * TRAIN_RATIO)

train_files = all_json[:split_idx]
val_files = all_json[split_idx:]


def convert(json_name, mode):

    json_path = os.path.join(SRC_DIR, json_name)

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    img_name = data["imagePath"]

    img_w = data["imageWidth"]
    img_h = data["imageHeight"]

    yolo_lines = []

    for shape in data["shapes"]:

        pts = shape["points"]

        x1 = min(pts[0][0], pts[1][0])
        x2 = max(pts[0][0], pts[1][0])

        y1 = min(pts[0][1], pts[1][1])
        y2 = max(pts[0][1], pts[1][1])

        cx = ((x1 + x2) / 2) / img_w
        cy = ((y1 + y2) / 2) / img_h

        bw = (x2 - x1) / img_w
        bh = (y2 - y1) / img_h

        line = f"0 {cx} {cy} {bw} {bh}"
        yolo_lines.append(line)

    txt_name = img_name.replace(".jpg", ".txt")

    txt_path = os.path.join(
        DST_DIR,
        f"labels/{mode}",
        txt_name
    )

    with open(txt_path, "w") as f:
        f.write("\n".join(yolo_lines))

    src_img = os.path.join(SRC_DIR, img_name)

    dst_img = os.path.join(
        DST_DIR,
        f"images/{mode}",
        img_name
    )

    shutil.copy(src_img, dst_img)


for f in train_files:
    convert(f, "train")

for f in val_files:
    convert(f, "val")


yaml_path = os.path.join(DST_DIR, "data.yaml")

with open(yaml_path, "w") as f:

    f.write(
"""train: ./images/train
val: ./images/val

nc: 1

names: ['fish']
"""
    )

print("DONE")