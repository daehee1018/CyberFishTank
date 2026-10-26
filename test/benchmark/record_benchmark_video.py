import cv2
import time
from datetime import datetime
from pathlib import Path

VIDEO_SOURCE = 0
# VIDEO_SOURCE = "http://192.168.31.14:8080/video"

OUT_DIR = Path("benchmark_videos")
RECORD_SECONDS = 10 * 60

WIDTH = 1280
HEIGHT = 720
FPS = 30

WINDOW_NAME = "Benchmark Recorder"


def main():
    OUT_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUT_DIR / f"benchmark_{timestamp}.mp4"

    cap = cv2.VideoCapture(VIDEO_SOURCE, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, FPS)

    if not cap.isOpened():
        print("[ERROR] camera open failed")
        return

    real_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    real_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    real_fps = cap.get(cv2.CAP_PROP_FPS)
    if real_fps <= 0:
        real_fps = FPS

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(out_path), fourcc, FPS, (real_w, real_h))

    print(f"[INFO] recording: {out_path}")
    print(f"[INFO] camera: {real_w}x{real_h}, fps={real_fps}")
    print("[INFO] press q to stop early")

    start_time = time.time()
    frame_count = 0
    prev_time = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[WARN] frame read failed")
            break

        elapsed = time.time() - start_time
        remain = max(0, RECORD_SECONDS - elapsed)

        writer.write(frame)
        frame_count += 1

        now = time.time()
        fps_now = 1.0 / max(1e-6, now - prev_time)
        prev_time = now

        vis = frame.copy()
        cv2.putText(
            vis,
            f"REC {elapsed:6.1f}s / {RECORD_SECONDS}s | remain {remain:6.1f}s | FPS {fps_now:.1f}",
            (20, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            (0, 0, 255),
            2,
        )
        cv2.putText(
            vis,
            f"Saving: {out_path.name}",
            (20, 70),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
        )

        cv2.imshow(WINDOW_NAME, vis)

        if elapsed >= RECORD_SECONDS:
            print("[INFO] finished 10 min recording")
            break

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q") or key == 27:
            print("[INFO] stopped by user")
            break

    cap.release()
    writer.release()
    cv2.destroyAllWindows()

    print(f"[DONE] saved: {out_path}")
    print(f"[DONE] frames: {frame_count}")


if __name__ == "__main__":
    main()