from ultralytics import YOLO

DATA_PATH = r"C:\Users\jsh14\Desktop\s\fish_pose_dataset_v2\data.yaml"

MODEL_PATH = r"C:\Users\jsh14\Desktop\CyberFishTank\runs\pose\runs\fish_pose-6\weights\best.pt"

model = YOLO(MODEL_PATH)

model.train(
    data=DATA_PATH,
    epochs=80,
    imgsz=640,
    batch=8,
    workers=0,
    device=0,
    project=r"C:\Users\jsh14\Desktop\CyberFishTank\runs\pose",
    name="fish_pose_v2_flip",
    exist_ok=True
)