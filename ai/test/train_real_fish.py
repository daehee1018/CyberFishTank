from ultralytics import YOLO

DATA_PATH = r"C:\Users\jsh14\Desktop\s\fish_dataset\data.yaml"

model = YOLO("yolov8s.pt")

model.train(
    data=DATA_PATH,
    epochs=50,
    imgsz=640,
    batch=16,
    workers=0,
    device=0,
    project=r"C:\Users\jsh14\Desktop\s\runs\detect",
    name="fish_real",
    exist_ok=True
)