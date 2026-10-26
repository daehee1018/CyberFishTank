import os
import cv2
import time

# =========================================================
# 설정
# =========================================================

SAVE_DIR = r"C:\Users\jsh14\Desktop\신진철\fish_raw"

CAMERA_INDEX = 0

SAVE_EVERY = 3

RESIZE_WIDTH = 1280
RESIZE_HEIGHT = 720

WINDOW_NAME = "Fish Dataset Recorder"


# =========================================================
# 폴더 생성
# =========================================================
os.makedirs(SAVE_DIR, exist_ok=True)


# =========================================================
# 기존 파일 번호 확인해서 이어 저장
# =========================================================
existing_numbers = []

for f in os.listdir(SAVE_DIR):
    if f.startswith("fish_") and f.endswith(".jpg"):
        try:
            num = int(f.replace("fish_", "").replace(".jpg", ""))
            existing_numbers.append(num)
        except:
            pass

if existing_numbers:
    saved_count = max(existing_numbers) + 1
else:
    saved_count = 0

print(f"[INFO] start index: {saved_count}")


# =========================================================
# 웹캠 열기 - 처음 되던 방식 그대로
# =========================================================
cap = cv2.VideoCapture(CAMERA_INDEX)

if not cap.isOpened():
    raise RuntimeError("웹캠을 열 수 없습니다.")


print("=" * 50)
print("Fish Dataset Recorder")
print("=" * 50)
print(f"저장 경로: {SAVE_DIR}")
print()
print("s : 저장 시작")
print("p : 저장 일시정지")
print("q : 종료")
print("=" * 50)


saving = False
frame_count = 0
prev_time = time.time()


while True:
    ret, frame = cap.read()

    if not ret:
        print("[WARN] 프레임 읽기 실패")
        break

    if RESIZE_WIDTH is not None and RESIZE_HEIGHT is not None:
        frame = cv2.resize(frame, (RESIZE_WIDTH, RESIZE_HEIGHT))

    display = frame.copy()

    # =====================================================
    # 저장
    # =====================================================
    if saving and frame_count % SAVE_EVERY == 0:
        filename = f"fish_{saved_count:06d}.jpg"
        save_path = os.path.join(SAVE_DIR, filename)

        try:
            success, encoded_img = cv2.imencode(".jpg", frame)

            if success:
                encoded_img.tofile(save_path)
                print(f"[SAVE] {filename}")
                saved_count += 1
            else:
                print("[ERROR] 이미지 인코딩 실패")

        except Exception as e:
            print(f"[ERROR] 저장 실패: {e}")

    # =====================================================
    # FPS 계산
    # =====================================================
    now = time.time()
    fps = 1.0 / max(1e-6, now - prev_time)
    prev_time = now

    state_text = "RECORDING" if saving else "PAUSED"

    cv2.putText(
        display,
        f"STATE: {state_text}",
        (20, 45),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.2,
        (0, 255, 0) if saving else (0, 0, 255),
        3
    )

    cv2.putText(
        display,
        f"Saved Images: {saved_count}",
        (20, 90),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (255, 255, 255),
        2
    )

    cv2.putText(
        display,
        f"FPS: {fps:.1f}",
        (20, 130),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (255, 255, 255),
        2
    )

    cv2.putText(
        display,
        "s=start   p=pause   q=quit",
        (20, 170),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (255, 255, 0),
        2
    )

    cv2.imshow(WINDOW_NAME, display)

    key = cv2.waitKey(1) & 0xFF

    if key == ord("q"):
        break

    elif key == ord("s"):
        saving = True
        print("[INFO] 저장 시작")

    elif key == ord("p"):
        saving = False
        print("[INFO] 저장 일시정지")

    frame_count += 1


cap.release()
cv2.destroyAllWindows()

print("=" * 50)
print("[DONE]")
print(f"총 저장 이미지 수: {saved_count}")
print(f"저장 위치: {SAVE_DIR}")
print("=" * 50)