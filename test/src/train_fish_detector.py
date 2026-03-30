from pathlib import Path
from ultralytics import YOLO

BASE_DIR = Path("/Users/handh/CyberFishTank/test")
DATA_YAML = Path("/Users/handh/CyberFishTank/test/data.yaml")
RUNS_DIR = BASE_DIR / "runs" / "detect"

def main():
    if not DATA_YAML.exists():
        raise FileNotFoundError(f"data.yaml 없음: {DATA_YAML}")

    model = YOLO("yolov8n.pt")

    model.train(
        data=str(DATA_YAML),
        epochs=150,
        imgsz=640,
        batch=8,
        workers=4,
        pretrained=True,
        project=str(RUNS_DIR),
        name="fish_unified",
        patience=30,
        save=True,
        verbose=True
    )

    print("[완료] 학습 종료")
    print(f"[INFO] best.pt: {RUNS_DIR / 'fish_unified' / 'weights' / 'best.pt'}")

if __name__ == "__main__":
    main()