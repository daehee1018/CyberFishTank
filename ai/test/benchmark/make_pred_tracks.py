import cv2
import pandas as pd
from pathlib import Path
from ultralytics import YOLO

MODEL_PATH = r"C:\Users\jsh14\Desktop\s\runs\detect\fish_real_v2\weights\best.pt"

VIDEO_PATH = r"C:\Users\jsh14\Desktop\s\benchmark_videos\benchmark_20260531_163515.mp4"

OUT_CSV = r"C:\Users\jsh14\Desktop\s\benchmark_02\eval_dataset\pred_tracks.csv"
CONF_THR = 0.15
IMG_SIZE = 1280


def main():
    model = YOLO(MODEL_PATH)
    cap = cv2.VideoCapture(VIDEO_PATH)

    rows = []
    frame_id = 0
    track_id = 1  # single fish benchmark라 일단 1로 고정

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        results = model.predict(
            frame,
            conf=CONF_THR,
            imgsz=IMG_SIZE,
            iou=0.4,
            max_det=1,
            verbose=False,
        )

        r = results[0]

        if r.boxes is not None and len(r.boxes) > 0:
            box = r.boxes.xyxy[0].detach().cpu().numpy()
            conf = float(r.boxes.conf[0].detach().cpu().item())

            x1, y1, x2, y2 = box.tolist()

            rows.append({
                "frame_id": frame_id,
                "track_id": track_id,
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "conf": conf,
            })

        frame_id += 1

    cap.release()

    out_path = Path(OUT_CSV)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False, encoding="utf-8-sig")

    print(f"[DONE] saved: {out_path}")
    print(f"[DONE] rows: {len(df)}")


if __name__ == "__main__":
    main()