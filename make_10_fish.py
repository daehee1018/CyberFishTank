import os
import cv2
import numpy as np
from PIL import Image, ImageDraw
from rembg import remove
import sys
import shutil  # 폴더 초기화를 위한 라이브러리 추가

# 외부(Node.js)에서 경로를 던져주면 그 주소를 쓰고, 없으면 기본값
INPUT_PATH = sys.argv[1] if len(sys.argv) > 1 else "beta-fish.png"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "fish_10_candidates"
SIZE = 512

def remove_bg(path):
    img = Image.open(path).convert("RGBA")
    return np.array(remove(img))

def crop_object(rgba, pad=30):
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 30)
    if len(xs) == 0: return rgba
    x1, x2 = xs.min(), xs.max()
    y1, y2 = ys.min(), ys.max()
    h, w = alpha.shape
    return rgba[
        max(0, y1 - pad):min(h, y2 + pad),
        max(0, x1 - pad):min(w, x2 + pad),
    ]

def fit_canvas(rgba, size=512):
    img = Image.fromarray(rgba)
    img.thumbnail((size - 80, size - 80), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - img.width) // 2
    y = (size - img.height) // 2
    canvas.paste(img, (x, y), img)
    return np.array(canvas)

def get_mask(rgba):
    alpha = rgba[:, :, 3]
    mask = (alpha > 30).astype(np.uint8) * 255
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask

def extract_colors(rgba, mask):
    rgb = rgba[:, :, :3]
    pixels = rgb[mask > 0]
    if len(pixels) < 20: return (220, 80, 35), (255, 160, 90), (70, 30, 20)
    pixels = pixels.astype(np.float32)
    _, _, centers = cv2.kmeans(
        pixels, 5, None,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1.0),
        10, cv2.KMEANS_PP_CENTERS,
    )
    centers = np.uint8(centers)
    centers = centers[np.argsort(centers.mean(axis=1))]
    dark = tuple(map(int, centers[0]))
    main = tuple(map(int, centers[-2]))
    light = tuple(map(int, centers[-1]))
    return main, light, dark

def generate_lowpoly_betta(main, light, dark, tail_sx, tail_sy, fin_sy, body_sy):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    def st(pts): return [(256 + (x - 256) * tail_sx, 256 + (y - 256) * tail_sy) for x, y in pts]
    def sf(pts): return [(256 + (x - 256) * 1.0, 256 + (y - 256) * fin_sy) for x, y in pts]
    def sb(pts): return [(256 + (x - 256) * 1.0, 256 + (y - 256) * body_sy) for x, y in pts]

    d.polygon(st([(110, 256), (50, 160), (150, 160), (210, 230)]), fill=main+(255,))
    d.polygon(st([(110, 256), (210, 230), (210, 270), (50, 256)]), fill=dark+(255,))
    d.polygon(st([(110, 256), (50, 256), (100, 360), (190, 300)]), fill=main+(255,))
    d.polygon(st([(110, 256), (190, 300), (220, 260)]), fill=dark+(255,))

    d.polygon(sf([(230, 210), (190, 90), (260, 110), (290, 200)]), fill=light+(255,))

    d.polygon(sf([(250, 280), (190, 420), (260, 430), (290, 290)]), fill=main+(255,))
    d.polygon(sf([(290, 290), (260, 430), (320, 400), (310, 280)]), fill=dark+(255,))
    d.polygon(sf([(320, 290), (280, 380), (300, 380), (330, 300)]), fill=light+(255,))

    d.polygon(sb([(200, 240), (240, 200), (350, 200), (410, 240), (440, 260), (200, 260)]), fill=light+(255,))
    d.polygon(sb([(200, 240), (200, 260), (440, 260), (410, 290), (350, 300), (240, 290)]), fill=main+(255,))

    d.polygon(sb([(380, 210), (440, 260), (380, 290), (360, 256)]), fill=dark+(255,))
    d.polygon(sb([(400, 245), (415, 240), (420, 255), (405, 260)]), fill=(30, 20, 20, 255))
    d.polygon(sb([(440, 260), (450, 265), (440, 275), (435, 270)]), fill=(40, 20, 20, 255))
    d.line(sb([(375, 215), (360, 256), (375, 295)]), fill=(20, 10, 10, 150), width=4)

    return img

def main():
    # 💡 1. 기존 폴더가 있다면 안의 내용물까지 싹 지워서 초기화합니다.
    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)
        
    os.makedirs(OUT_DIR, exist_ok=True)

    # 💡 2. try 문구에 완벽한 except 처리를 추가하여 뻗지 않도록 수정했습니다.
    try:
        rgba = remove_bg(INPUT_PATH)
        rgba = crop_object(rgba)
        rgba = fit_canvas(rgba, SIZE)
        mask = get_mask(rgba)
        main_color, light_color, dark_color = extract_colors(rgba, mask)
    except Exception as e:
        print(f"이미지 처리 에러: {e}")
        print(f"입력 파일 경로({INPUT_PATH})를 다시 한번 확인해주세요!")
        return

    candidates = [
        ("01_lowpoly_standard.png", 1.0, 1.0, 1.0, 1.0),
        ("02_lowpoly_long_tail.png", 1.4, 1.1, 1.0, 1.0),
        ("03_lowpoly_tall_fins.png", 1.0, 1.0, 1.4, 1.0),
        ("04_lowpoly_thick_body.png", 1.0, 1.0, 1.0, 1.4),
        ("05_lowpoly_slim_fast.png", 1.3, 0.8, 0.8, 0.8),
        ("06_lowpoly_huge_betta.png", 1.3, 1.3, 1.3, 1.2),
        ("07_lowpoly_short_cute.png", 0.7, 0.9, 0.9, 1.3),
        ("08_lowpoly_sharp.png",       0.9, 1.5, 1.5, 0.9),
        ("09_lowpoly_wide.png",        1.2, 1.4, 1.1, 1.0),
        ("10_lowpoly_compact.png",     0.8, 0.8, 0.8, 0.9),
    ]

    for name, tsx, tsy, fsy, bsy in candidates:
        img = generate_lowpoly_betta(main_color, light_color, dark_color, tsx, tsy, fsy, bsy)
        out_path = os.path.join(OUT_DIR, name)
        img.save(out_path)
        print("saved:", out_path)

    # 💡 3. 윈도우 터미널 에러의 주범이었던 이모지를 제거했습니다.
    print("10가지 로우폴리 물고기 생성 완료!")
    print("output folder:", OUT_DIR)

if __name__ == "__main__":
    main()