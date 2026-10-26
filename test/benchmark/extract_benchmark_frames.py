import cv2
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--interval-sec", type=float, default=2.0)
    args = parser.parse_args()

    video_path = args.video
    out_dir = Path(args.out)
    img_dir = out_dir / "images"

    img_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"[ERROR] cannot open video: {video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30

    frame_interval = int(fps * args.interval_sec)

    frame_idx = 0
    saved = 0

    print(f"[INFO] fps={fps:.2f}")
    print(f"[INFO] save every {frame_interval} frames")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_idx % frame_interval == 0:
            save_path = img_dir / f"frame_{frame_idx:06d}.jpg"
            cv2.imwrite(str(save_path), frame)
            saved += 1

        frame_idx += 1

    cap.release()

    print(f"[DONE] total frames: {frame_idx}")
    print(f"[DONE] saved images: {saved}")
    print(f"[DONE] output: {img_dir}")


if __name__ == "__main__":
    main()