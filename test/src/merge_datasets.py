import shutil
from pathlib import Path

BASE_DIR = Path("/Users/handh/CyberFishTank/fish_unified")

SOURCES = [
    BASE_DIR / "raw_sources" / "public_aquarium",
    BASE_DIR / "raw_sources" / "public_fish",
    BASE_DIR / "raw_sources" / "my_aquarium",
]

OUT_IMG_DIR = BASE_DIR / "dataset" / "images" / "train"
OUT_LBL_DIR = BASE_DIR / "dataset" / "labels" / "train"

def copy_one_dataset(src_root: Path, prefix: str):
    src_img_dir = src_root / "images"
    src_lbl_dir = src_root / "labels"

    img_files = list(src_img_dir.rglob("*.jpg")) + list(src_img_dir.rglob("*.png")) + list(src_img_dir.rglob("*.jpeg"))

    copied = 0
    for img_path in img_files:
        rel_name = img_path.stem
        label_path = src_lbl_dir / f"{rel_name}.txt"

        if not label_path.exists():
            continue

        # 라벨이 비어 있으면 스킵 가능
        with open(label_path, "r", encoding="utf-8") as f:
            lines = [ln.strip() for ln in f.readlines() if ln.strip()]
        if len(lines) == 0:
            continue

        new_img_name = f"{prefix}_{img_path.name}"
        new_lbl_name = f"{prefix}_{img_path.stem}.txt"

        shutil.copy2(img_path, OUT_IMG_DIR / new_img_name)
        shutil.copy2(label_path, OUT_LBL_DIR / new_lbl_name)

        copied += 1

    print(f"[완료] {src_root.name}: {copied}개 복사")

def main():
    OUT_IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_LBL_DIR.mkdir(parents=True, exist_ok=True)

    for src in SOURCES:
        copy_one_dataset(src, src.name)

    print("[완료] 데이터셋 병합 종료")

if __name__ == "__main__":
    main()