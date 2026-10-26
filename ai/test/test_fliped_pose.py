from pathlib import Path
from ultralytics import YOLO
import cv2

MODEL_PATH = r"C:\Users\jsh14\Desktop\CyberFishTank\runs\pose\fish_pose_v2_flip\weights\best.pt"
IMG_DIR = Path(r"C:\Users\jsh14\Desktop\s\fish_pose_flip_aug")

model = YOLO(MODEL_PATH)

total = 0
detected = 0
flipped_count = 0

for img_path in sorted(IMG_DIR.glob("*.jpg")):
    result = model.predict(str(img_path), conf=0.25, imgsz=640, verbose=False)[0]

    total += 1

    if result.keypoints is None or result.boxes is None or len(result.boxes) == 0:
        continue

    kpts = result.keypoints.xy.cpu().numpy()[0]

    head = kpts[0]
    dorsal = kpts[1]
    tail = kpts[2]
    belly = kpts[3]

    detected += 1

    is_flipped = dorsal[1] > belly[1]

    if is_flipped:
        flipped_count += 1

    img = cv2.imread(str(img_path))
    for name, p in zip(["H", "D", "T", "B"], [head, dorsal, tail, belly]):
        x, y = int(p[0]), int(p[1])
        cv2.circle(img, (x, y), 5, (0, 255, 255), -1)
        cv2.putText(img, name, (x + 5, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

    cv2.putText(
        img,
        f"flipped={is_flipped}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (0, 0, 255) if is_flipped else (255, 255, 255),
        2,
    )

    cv2.imshow("flipped test", img)
    key = cv2.waitKey(50)
    if key == ord("q"):
        break

cv2.destroyAllWindows()

print("===== FLIPPED TEST =====")
print(f"total images      : {total}")
print(f"pose detected     : {detected}")
print(f"flipped detected  : {flipped_count}")
print(f"flipped rate      : {flipped_count / max(detected, 1):.4f}")