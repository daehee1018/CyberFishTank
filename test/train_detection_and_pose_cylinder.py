from ultralytics import YOLO
from pathlib import Path
import torch

# ============================================================
# 경로 설정
# ============================================================

DET_MODEL = r"C:\Users\jsh14\Desktop\s\runs\detect\fish_real_v2\weights\best.pt"
DET_DATA = r"C:\Users\jsh14\Desktop\s\fish_dataset_v3_cylinder\data.yaml"

POSE_MODEL = r"C:\Users\jsh14\Desktop\CyberFishTank\runs\pose\fish_pose_v2_flip\weights\best.pt"
POSE_DATA = r"C:\Users\jsh14\Desktop\s\fish_pose_dataset_v3_cylinder\data.yaml"

DET_PROJECT = r"C:\Users\jsh14\Desktop\s\runs\detect"
POSE_PROJECT = r"C:\Users\jsh14\Desktop\s\runs\pose"

DET_NAME = "fish_real_v3_cylinder"
POSE_NAME = "fish_pose_v3_cylinder"

# ============================================================
# 학습 설정
# ============================================================

EPOCHS = 30
IMGSZ = 1280
BATCH = 8
PATIENCE = 15

# None이면 Ultralytics가 자동 선택
# CUDA가 있으면 0번 GPU, 없으면 CPU 사용
DEVICE = 0 if torch.cuda.is_available() else "cpu"


def check_exists(path_str, label):
    path = Path(path_str)
    if not path.exists():
        raise FileNotFoundError(f"{label} 경로를 찾을 수 없음:\n{path}")


def train_detection():
    print("\n" + "=" * 70)
    print("1/2 Detection fine-tuning 시작")
    print("=" * 70)

    check_exists(DET_MODEL, "Detection model")
    check_exists(DET_DATA, "Detection data.yaml")

    model = YOLO(DET_MODEL)

    results = model.train(
        data=DET_DATA,
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        device=DEVICE,
        project=DET_PROJECT,
        name=DET_NAME,
        patience=PATIENCE,
        exist_ok=False,
    )

    best = Path(DET_PROJECT) / DET_NAME / "weights" / "best.pt"
    print("\n[Detection 완료]")
    print("best.pt:", best)

    return results, best


def train_pose():
    print("\n" + "=" * 70)
    print("2/2 Pose fine-tuning 시작")
    print("=" * 70)

    check_exists(POSE_MODEL, "Pose model")
    check_exists(POSE_DATA, "Pose data.yaml")

    model = YOLO(POSE_MODEL)

    results = model.train(
        data=POSE_DATA,
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        device=DEVICE,
        project=POSE_PROJECT,
        name=POSE_NAME,
        patience=PATIENCE,
        exist_ok=False,
    )

    best = Path(POSE_PROJECT) / POSE_NAME / "weights" / "best.pt"
    print("\n[Pose 완료]")
    print("best.pt:", best)

    return results, best


def main():
    print("=" * 70)
    print("Fish YOLO Detection + Pose sequential fine-tuning")
    print("=" * 70)
    print("Device:", DEVICE)
    print("Epochs:", EPOCHS)
    print("Image size:", IMGSZ)
    print("Batch:", BATCH)
    print("\n순서: Detection 완료 -> Pose 자동 시작")

    det_results, det_best = train_detection()
    pose_results, pose_best = train_pose()

    print("\n" + "=" * 70)
    print("전체 학습 완료")
    print("=" * 70)
    print("Detection best.pt:")
    print(det_best)
    print("\nPose best.pt:")
    print(pose_best)
    print("\n이 두 경로를 기존 성장 측정 코드의 모델 경로에 넣으면 됨.")


if __name__ == "__main__":
    main()
