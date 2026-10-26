import shutil
from pathlib import Path

DATASETS = [
    Path("fish_dataset"),
    Path("train_extra_detect_yolo"),
]

OUT_DIR = Path("fish_dataset_v2")

for split in ["train", "val"]:
    (OUT_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

count = 0

for ds_idx, ds in enumerate(DATASETS):
    prefix = f"ds{ds_idx+1}_"

    for split in ["train", "val"]:
        img_dir = ds / "images" / split
        lbl_dir = ds / "labels" / split

        if not img_dir.exists():
            print(f"[WARN] missing: {img_dir}")
            continue

        for img_path in img_dir.glob("*.*"):
            if img_path.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
                continue

            label_path = lbl_dir / f"{img_path.stem}.txt"
            if not label_path.exists():
                continue

            new_stem = prefix + img_path.stem
            dst_img = OUT_DIR / "images" / split / f"{new_stem}{img_path.suffix}"
            dst_lbl = OUT_DIR / "labels" / split / f"{new_stem}.txt"

            shutil.copy2(img_path, dst_img)
            shutil.copy2(label_path, dst_lbl)
            count += 1

yaml_text = f"""path: {OUT_DIR.resolve()}
train: images/train
val: images/val

nc: 1
names: ['fish']
"""

(OUT_DIR / "data.yaml").write_text(yaml_text, encoding="utf-8")

print("[DONE] merged dataset")
print("images+labels:", count)
print("output:", OUT_DIR)
print("yaml:", OUT_DIR / "data.yaml")