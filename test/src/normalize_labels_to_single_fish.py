from pathlib import Path

# 수정 필요:
# 원본 클래스 맵 예시
# 예: public_aquarium 데이터셋에서 fish class id가 1이라면 {1}
# 예: public_fish 데이터셋에서 fish class id가 0이면 {0}
ALLOWED_FISH_CLASS_IDS = {0}

LABEL_DIR = Path("/Users/handh/CyberFishTank/test/dataset/labels")

def main():
    txt_files = list(LABEL_DIR.rglob("*.txt"))
    print(f"[INFO] 라벨 파일 수: {len(txt_files)}")

    for txt_path in txt_files:
        new_lines = []

        with open(txt_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for line in lines:
            parts = line.strip().split()
            if len(parts) != 5:
                continue

            cls_id = int(parts[0])
            if cls_id not in ALLOWED_FISH_CLASS_IDS:
                continue

            # fish 단일 클래스 0으로 통일
            new_line = "0 " + " ".join(parts[1:])
            new_lines.append(new_line)

        with open(txt_path, "w", encoding="utf-8") as f:
            for line in new_lines:
                f.write(line + "\n")

    print("[완료] fish 단일 클래스로 정규화 완료")

if __name__ == "__main__":
    main()