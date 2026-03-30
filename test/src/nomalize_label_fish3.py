from pathlib import Path

ALLOWED_FISH_CLASS_IDS = set(range(26))
LABEL_DIR = Path("/Users/handh/CyberFishTank/test/dataset/raw_fish3")

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

            # 전부 fish 단일 클래스 0으로 통일
            new_line = "0 " + " ".join(parts[1:])
            new_lines.append(new_line)

        with open(txt_path, "w", encoding="utf-8") as f:
            for line in new_lines:
                f.write(line + "\n")

    print("[완료] 3번째 데이터셋 fish 단일 클래스로 정규화 완료")

if __name__ == "__main__":
    main()