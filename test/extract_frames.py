import os
import cv2

VIDEO_PATH = r"C:\Users\jsh14\Desktop\신진철\test\test.mp4"   # 영상 파일 경로
OUT_DIR = "dataset_images"
SAVE_EVERY = 10                  # 10프레임마다 1장 저장

os.makedirs(OUT_DIR, exist_ok=True)

cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    raise RuntimeError(f"영상을 열 수 없음: {VIDEO_PATH}")

frame_idx = 0
save_idx = 0

while True:
    ok, frame = cap.read()
    if not ok:
        break

    if frame_idx % SAVE_EVERY == 0:
        out_path = os.path.join(OUT_DIR, f"frame_{save_idx:05d}.jpg")
        cv2.imwrite(out_path, frame)
        print(f"[SAVE] {out_path}")
        save_idx += 1

    frame_idx += 1

cap.release()
print("[DONE] frame extraction finished")