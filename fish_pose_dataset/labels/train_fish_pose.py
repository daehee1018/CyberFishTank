from ultralytics import YOLO
import torch
import multiprocessing


def main():

    print("=" * 50)
    print("PyTorch CUDA:", torch.cuda.is_available())

    if torch.cuda.is_available():
        print("GPU:", torch.cuda.get_device_name(0))

    print("=" * 50)

    model = YOLO("yolov8n-pose.pt")

    model.train(
        data="fish_pose_dataset/data.yaml",
        epochs=100,
        imgsz=640,
        batch=8,
        device=0,
        workers=0,   # Windows 안정성
        amp=False,   # 이전 에러 해결
        project="runs",
        name="fish_pose"
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()