import cv2
import os

VIDEO_PATH = "fish.mp4"
SAVE_DIR = "frames"

os.makedirs(SAVE_DIR, exist_ok=True)

cap = cv2.VideoCapture(VIDEO_PATH)

count = 0
saved = 0

while True:

    ret, frame = cap.read()

    if not ret:
        break

    # 10프레임마다 저장
    if count % 10 == 0:

        path = os.path.join(
            SAVE_DIR,
            f"frame_{saved:05d}.jpg"
        )

        cv2.imwrite(path, frame)

        saved += 1

    count += 1

cap.release()

print("saved:", saved)