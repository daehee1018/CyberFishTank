from pathlib import Path
import cv2

IMAGE_DIR = Path("/Users/handh/CyberFishTank/fish_unified/dataset/images/train")
LABEL_DIR = Path("/Users/handh/CyberFishTank/fish_unified/dataset/labels/train")
OUTPUT_DIR = Path("/Users/handh/CyberFishTank/fish_unified/check_labels")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def yolo_to_xyxy(line, w, h):
    parts = line.strip().split()
    if len(parts) != 5:
        return None

    _, cx, cy, bw, bh = parts
    cx, cy, bw, bh = map(float, [cx, cy, bw, bh])

    x1 = int((cx - bw / 2) * w)
    y1 = int((cy - bh / 2) * h)
    x2 = int((cx + bw / 2) * w)
    y2 = int((cy + bh / 2) * h)
    return x1, y1, x2, y2

def main():
    imgs = sorted(list(IMAGE_DIR.glob("*.jpg")) + list(IMAGE_DIR.glob("*.png")) + list(IMAGE_DIR.glob("*.jpeg")))

    saved = 0
    for img_path in imgs[:100]:
        lbl_path = LABEL_DIR / f"{img_path.stem}.txt"
        if not lbl_path.exists():
            continue

        img = cv2.imread(str(img_path))
        if img is None:
            continue

        h, w = img.shape[:2]
        with open(lbl_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for line in lines:
            box = yolo_to_xyxy(line, w, h)
            if box is None:
                continue
            x1, y1, x2, y2 = box
            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)

        out_path = OUTPUT_DIR / img_path.name
        cv2.imwrite(str(out_path), img)
        saved += 1

    print(f"[완료] 저장 수: {saved}")
    print(f"[완료] 확인 폴더: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()