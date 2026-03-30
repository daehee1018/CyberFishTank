from pathlib import Path
import shutil

SRC_ROOT = Path("/Users/handh/CyberFishTank/test/dataset/raw_fish3")
DST_ROOT = Path("/Users/handh/CyberFishTank/test/dataset")

PREFIX = "fish3_"

def copy_split(src_img, src_lbl, dst_img, dst_lbl):
    dst_img.mkdir(parents=True, exist_ok=True)
    dst_lbl.mkdir(parents=True, exist_ok=True)

    for img_path in src_img.iterdir():
        if not img_path.is_file():
            continue

        if img_path.suffix.lower() not in [".jpg", ".png", ".jpeg"]:
            continue

        lbl_path = src_lbl / (img_path.stem + ".txt")
        if not lbl_path.exists():
            continue

        new_img = dst_img / (PREFIX + img_path.name)
        new_lbl = dst_lbl / (PREFIX + lbl_path.name)

        shutil.copy2(img_path, new_img)
        shutil.copy2(lbl_path, new_lbl)


def main():
    copy_split(
        SRC_ROOT / "train/images",
        SRC_ROOT / "train/labels",
        DST_ROOT / "images/train",
        DST_ROOT / "labels/train"
    )

    copy_split(
        SRC_ROOT / "valid/images",
        SRC_ROOT / "valid/labels",
        DST_ROOT / "images/val",
        DST_ROOT / "labels/val"
    )

    copy_split(
        SRC_ROOT / "test/images",
        SRC_ROOT / "test/labels",
        DST_ROOT / "images/test",
        DST_ROOT / "labels/test"
    )

    print("✅ 3번째 데이터셋 합치기 완료")


if __name__ == "__main__":
    main()