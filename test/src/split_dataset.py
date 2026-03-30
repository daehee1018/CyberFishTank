import random
import shutil
from pathlib import Path

BASE_DIR = Path("/Users/handh/CyberFishTank/fish_unified/dataset")

TRAIN_IMG_DIR = BASE_DIR / "images" / "train"
TRAIN_LBL_DIR = BASE_DIR / "labels" / "train"

VAL_IMG_DIR = BASE_DIR / "images" / "val"
VAL_LBL_DIR = BASE_DIR / "labels" / "val"

TEST_IMG_DIR = BASE_DIR / "images" / "test"
TEST_LBL_DIR = BASE_DIR / "labels" / "test"

VAL_RATIO = 0.15
TEST_RATIO = 0.10
SEED = 42

def main():
    random.seed(SEED)

    VAL_IMG_DIR.mkdir(parents=True, exist_ok=True)
    VAL_LBL_DIR.mkdir(parents=True, exist_ok=True)
    TEST_IMG_DIR.mkdir(parents=True, exist_ok=True)
    TEST_LBL_DIR.mkdir(parents=True, exist_ok=True)

    img_files = sorted(list(TRAIN_IMG_DIR.glob("*.jpg")) + list(TRAIN_IMG_DIR.glob("*.png")) + list(TRAIN_IMG_DIR.glob("*.jpeg")))
    paired = []

    for img_path in img_files:
        lbl_path = TRAIN_LBL_DIR / f"{img_path.stem}.txt"
        if lbl_path.exists():
            paired.append((img_path, lbl_path))

    random.shuffle(paired)

    n_total = len(paired)
    n_val = int(n_total * VAL_RATIO)
    n_test = int(n_total * TEST_RATIO)

    val_items = paired[:n_val]
    test_items = paired[n_val:n_val + n_test]

    for img_path, lbl_path in val_items:
        shutil.move(str(img_path), str(VAL_IMG_DIR / img_path.name))
        shutil.move(str(lbl_path), str(VAL_LBL_DIR / lbl_path.name))

    for img_path, lbl_path in test_items:
        shutil.move(str(img_path), str(TEST_IMG_DIR / img_path.name))
        shutil.move(str(lbl_path), str(TEST_LBL_DIR / lbl_path.name))

    print(f"[완료] total={n_total}, val={n_val}, test={n_test}, train={n_total - n_val - n_test}")

if __name__ == "__main__":
    main()