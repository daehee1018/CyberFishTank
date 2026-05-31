from ultralytics import YOLO
import torch
import multiprocessing


def main():
    print("CUDA:", torch.cuda.is_available())
    if torch.cuda.is_available():
        print("GPU:", torch.cuda.get_device_name(0))

    model = YOLO(r"C:\Users\jsh14\Desktop\s\runs\detect\fish_real\weights\best.pt")

    model.train(
        data=r"C:\Users\jsh14\Desktop\s\fish_dataset_v2\data.yaml",
        epochs=80,
        imgsz=960,
        batch=8,
        device=0,
        workers=0,
        project=r"C:\Users\jsh14\Desktop\s\runs\detect",
        name="fish_real_v2",
        pretrained=True,
        amp=False,
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()