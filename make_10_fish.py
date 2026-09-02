import os
import sys
import shutil
import cv2
import numpy as np

from PIL import Image, ImageEnhance, ImageFilter
from rembg import remove


# ============================================================
# 설정
# ============================================================

CANVAS_SIZE = 640
MARGIN = 45

# 후보 이름
STYLES = [
    ("01_natural", "Natural"),
    ("02_vivid", "Vivid"),
    ("03_ocean_blue", "Ocean Blue"),
    ("04_crimson", "Crimson"),
    ("05_golden", "Golden"),
    ("06_galaxy", "Galaxy"),
    ("07_koi", "Koi"),
    ("08_pastel", "Pastel"),
    ("09_deep_sea", "Deep Sea"),
    ("10_cartoon", "Soft Cartoon"),
]


# ============================================================
# 입력 인자
# ============================================================

INPUT_PATH = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "base_fish.png"
)

OUT_DIR = (
    sys.argv[2]
    if len(sys.argv) > 2
    else "fish_10_candidates"
)


# ============================================================
# 배경 제거
# ============================================================

def remove_background(input_path):
    print("[1/6] 물고기 배경 제거 중...")

    with open(input_path, "rb") as f:
        input_bytes = f.read()

    output_bytes = remove(input_bytes)

    temp_path = "_fish_removed_bg.png"

    with open(temp_path, "wb") as f:
        f.write(output_bytes)

    image = Image.open(temp_path).convert("RGBA")

    try:
        os.remove(temp_path)
    except Exception:
        pass

    return image


# ============================================================
# 알파 마스크 정리
# ============================================================

def clean_alpha(image):
    rgba = np.array(image)

    alpha = rgba[:, :, 3]

    # 작은 노이즈 제거
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

    # 너무 희미한 부분 제거
    alpha[alpha < 18] = 0

    # 약간 부드럽게
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

    rgba[:, :, 3] = alpha

    return Image.fromarray(rgba)


# ============================================================
# 물고기 영역만 정확하게 crop
# ============================================================

def crop_to_fish(image):
    print("[2/6] 물고기 실루엣 분석 중...")

    rgba = np.array(image)
    alpha = rgba[:, :, 3]

    ys, xs = np.where(alpha > 20)

    if len(xs) == 0 or len(ys) == 0:
        print("[WARNING] 물고기 영역을 찾지 못했습니다.")
        return image

    x1 = max(0, xs.min() - MARGIN)
    y1 = max(0, ys.min() - MARGIN)
    x2 = min(image.width, xs.max() + MARGIN + 1)
    y2 = min(image.height, ys.max() + MARGIN + 1)

    return image.crop((x1, y1, x2, y2))


# ============================================================
# 640x640 투명 캔버스에 물고기 배치
# ============================================================

def fit_to_canvas(image):
    print("[3/6] 디지털 트윈용 크기로 변환 중...")

    max_size = CANVAS_SIZE - (MARGIN * 2)

    scale = min(
        max_size / image.width,
        max_size / image.height
    )

    new_w = max(1, int(image.width * scale))
    new_h = max(1, int(image.height * scale))

    resized = image.resize(
        (new_w, new_h),
        Image.Resampling.LANCZOS
    )

    canvas = Image.new(
        "RGBA",
        (CANVAS_SIZE, CANVAS_SIZE),
        (0, 0, 0, 0)
    )

    x = (CANVAS_SIZE - new_w) // 2
    y = (CANVAS_SIZE - new_h) // 2

    canvas.alpha_composite(
        resized,
        (x, y)
    )

    return canvas


# ============================================================
# 색상 보정
# ============================================================

def adjust_color(
    image,
    saturation=1.0,
    brightness=1.0,
    contrast=1.0
):
    rgb = image.convert("RGB")

    rgb = ImageEnhance.Color(rgb).enhance(saturation)
    rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)

    result = rgb.convert("RGBA")

    result.putalpha(image.getchannel("A"))

    return result


# ============================================================
# HSV 색상 변경
# ============================================================

def hue_shift(image, degrees):
    rgba = np.array(image)

    rgb = rgba[:, :, :3]

    hsv = cv2.cvtColor(
        rgb,
        cv2.COLOR_RGB2HSV
    ).astype(np.float32)

    hsv[:, :, 0] = (
        hsv[:, :, 0]
        + degrees / 2.0
    ) % 180

    hsv = np.clip(
        hsv,
        0,
        255
    ).astype(np.uint8)

    new_rgb = cv2.cvtColor(
        hsv,
        cv2.COLOR_HSV2RGB
    )

    result = np.dstack(
        [new_rgb, rgba[:, :, 3]]
    )

    return Image.fromarray(result)


# ============================================================
# 특정 색 계열로 자연스럽게 변환
# ============================================================

def colorize_fish(image, target_color, strength=0.35):
    rgba = np.array(image).astype(np.float32)

    rgb = rgba[:, :, :3]

    target = np.array(
        target_color,
        dtype=np.float32
    )

    # 밝기 정보 유지
    gray = (
        rgb[:, :, 0] * 0.299
        + rgb[:, :, 1] * 0.587
        + rgb[:, :, 2] * 0.114
    )

    gray = gray / 255.0

    target_img = np.zeros_like(rgb)

    target_img[:, :, 0] = target[0] * (0.35 + gray * 0.65)
    target_img[:, :, 1] = target[1] * (0.35 + gray * 0.65)
    target_img[:, :, 2] = target[2] * (0.35 + gray * 0.65)

    mixed = (
        rgb * (1.0 - strength)
        + target_img * strength
    )

    mixed = np.clip(
        mixed,
        0,
        255
    )

    result = np.dstack(
        [
            mixed,
            rgba[:, :, 3]
        ]
    ).astype(np.uint8)

    return Image.fromarray(result)


# ============================================================
# 물고기 외곽선
# ============================================================

def add_outline(image, thickness=3, opacity=130):
    rgba = np.array(image)

    alpha = rgba[:, :, 3]

    kernel = np.ones(
        (thickness, thickness),
        np.uint8
    )

    dilated = cv2.dilate(
        alpha,
        kernel,
        iterations=1
    )

    outline = dilated - alpha

    outline_alpha = (
        outline.astype(np.float32)
        * (opacity / 255.0)
    ).astype(np.uint8)

    outline_rgba = np.zeros_like(rgba)

    # 어두운 남색 계열 외곽선
    outline_rgba[:, :, 0] = 20
    outline_rgba[:, :, 1] = 25
    outline_rgba[:, :, 2] = 40
    outline_rgba[:, :, 3] = outline_alpha

    outline_img = Image.fromarray(
        outline_rgba
    )

    result = Image.new(
        "RGBA",
        image.size,
        (0, 0, 0, 0)
    )

    result.alpha_composite(outline_img)
    result.alpha_composite(image)

    return result


# ============================================================
# 부드러운 그림자
# ============================================================

def add_shadow(image):
    alpha = image.getchannel("A")

    shadow = Image.new(
        "RGBA",
        image.size,
        (15, 23, 42, 0)
    )

    shadow.putalpha(
        alpha.point(
            lambda x: int(x * 0.22)
        )
    )

    shadow = shadow.filter(
        ImageFilter.GaussianBlur(10)
    )

    canvas = Image.new(
        "RGBA",
        image.size,
        (0, 0, 0, 0)
    )

    canvas.alpha_composite(
        shadow,
        (0, 8)
    )

    canvas.alpha_composite(image)

    return canvas


# ============================================================
# 하이라이트 추가
# ============================================================

def add_highlight(image, amount=0.15):
    rgba = np.array(image).astype(np.float32)

    rgb = rgba[:, :, :3]

    # 밝은 영역만 살짝 강조
    brightness = (
        rgb[:, :, 0]
        + rgb[:, :, 1]
        + rgb[:, :, 2]
    ) / 3.0

    highlight = np.clip(
        (brightness - 110) / 145,
        0,
        1
    )

    rgb += (
        highlight[:, :, None]
        * 255
        * amount
    )

    rgb = np.clip(
        rgb,
        0,
        255
    )

    result = np.dstack(
        [rgb, rgba[:, :, 3]]
    ).astype(np.uint8)

    return Image.fromarray(result)


# ============================================================
# 후보별 스타일
# ============================================================

def create_style(base, index):
    img = base.copy()

    # --------------------------------------------------------
    # 01 Natural
    # --------------------------------------------------------
    if index == 0:
        img = adjust_color(
            img,
            saturation=1.08,
            brightness=1.02,
            contrast=1.08
        )

    # --------------------------------------------------------
    # 02 Vivid
    # --------------------------------------------------------
    elif index == 1:
        img = adjust_color(
            img,
            saturation=1.55,
            brightness=1.05,
            contrast=1.18
        )

        img = add_highlight(
            img,
            0.12
        )

    # --------------------------------------------------------
    # 03 Ocean Blue
    # --------------------------------------------------------
    elif index == 2:
        img = hue_shift(
            img,
            -25
        )

        img = adjust_color(
            img,
            saturation=1.35,
            brightness=1.04,
            contrast=1.12
        )

    # --------------------------------------------------------
    # 04 Crimson
    # --------------------------------------------------------
    elif index == 3:
        img = colorize_fish(
            img,
            (210, 35, 45),
            0.42
        )

        img = adjust_color(
            img,
            saturation=1.45,
            brightness=1.03,
            contrast=1.12
        )

    # --------------------------------------------------------
    # 05 Golden
    # --------------------------------------------------------
    elif index == 4:
        img = colorize_fish(
            img,
            (230, 165, 40),
            0.42
        )

        img = adjust_color(
            img,
            saturation=1.25,
            brightness=1.08,
            contrast=1.08
        )

    # --------------------------------------------------------
    # 06 Galaxy
    # --------------------------------------------------------
    elif index == 5:
        img = hue_shift(
            img,
            55
        )

        img = adjust_color(
            img,
            saturation=1.65,
            brightness=0.96,
            contrast=1.22
        )

        img = add_highlight(
            img,
            0.20
        )

    # --------------------------------------------------------
    # 07 Koi
    # --------------------------------------------------------
    elif index == 6:
        img = colorize_fish(
            img,
            (235, 95, 35),
            0.28
        )

        img = adjust_color(
            img,
            saturation=1.25,
            brightness=1.05,
            contrast=1.10
        )

    # --------------------------------------------------------
    # 08 Pastel
    # --------------------------------------------------------
    elif index == 7:
        img = adjust_color(
            img,
            saturation=0.78,
            brightness=1.16,
            contrast=0.90
        )

    # --------------------------------------------------------
    # 09 Deep Sea
    # --------------------------------------------------------
    elif index == 8:
        img = hue_shift(
            img,
            -45
        )

        img = adjust_color(
            img,
            saturation=1.25,
            brightness=0.88,
            contrast=1.25
        )

    # --------------------------------------------------------
    # 10 Soft Cartoon
    # --------------------------------------------------------
    elif index == 9:
        img = adjust_color(
            img,
            saturation=1.30,
            brightness=1.06,
            contrast=1.25
        )

        img = add_outline(
            img,
            thickness=3,
            opacity=150
        )

    # 공통 하이라이트
    if index != 9:
        img = add_highlight(
            img,
            0.08
        )

    return img


# ============================================================
# 메인
# ============================================================

def main():

    print("=" * 60)
    print(" Cyber Fish Tank - Betta Graphic Generator")
    print("=" * 60)

    print(f"입력 이미지 : {INPUT_PATH}")
    print(f"출력 폴더   : {OUT_DIR}")

    if not os.path.exists(INPUT_PATH):
        print()
        print(
            f"[ERROR] 입력 파일이 없습니다: {INPUT_PATH}"
        )
        sys.exit(1)

    # 출력 폴더 초기화
    if os.path.exists(OUT_DIR):
        print("[4/6] 기존 후보 이미지 정리 중...")
        shutil.rmtree(OUT_DIR)

    os.makedirs(
        OUT_DIR,
        exist_ok=True
    )

    # --------------------------------------------------------
    # 1. 배경 제거
    # --------------------------------------------------------

    image = remove_background(
        INPUT_PATH
    )

    # --------------------------------------------------------
    # 2. 알파 정리
    # --------------------------------------------------------

    image = clean_alpha(
        image
    )

    # --------------------------------------------------------
    # 3. 물고기 영역 crop
    # --------------------------------------------------------

    image = crop_to_fish(
        image
    )

    # --------------------------------------------------------
    # 4. 640x640 변환
    # --------------------------------------------------------

    base = fit_to_canvas(
        image
    )

    print("[5/6] 10가지 그래픽 스타일 생성 중...")

    # --------------------------------------------------------
    # 후보 생성
    # --------------------------------------------------------

    for index, (filename, label) in enumerate(STYLES):

        print(
            f"  [{index + 1:02d}/10] {label}"
        )

        styled = create_style(
            base,
            index
        )

        # 그림자
        styled = add_shadow(
            styled
        )

        # 최종 저장
        output_path = os.path.join(
            OUT_DIR,
            f"{filename}.png"
        )

        styled.save(
            output_path,
            "PNG",
            optimize=True
        )

    print("[6/6] 생성 완료!")
    print()

    print("=" * 60)
    print(" 생성된 후보")
    print("=" * 60)

    for filename, label in STYLES:
        print(
            f"  {filename}.png  ->  {label}"
        )

    print()
    print(f"출력 위치: {OUT_DIR}")
    print("=" * 60)


# ============================================================
# 실행
# ============================================================

if __name__ == "__main__":
    main()