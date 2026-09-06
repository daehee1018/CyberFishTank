import os
import sys
import shutil
import base64
import time

import cv2
import numpy as np

from PIL import Image
from rembg import remove
from dotenv import load_dotenv
from openai import OpenAI


# ============================================================
# 환경 설정
# ============================================================

load_dotenv()

CANVAS_SIZE = 640
MARGIN = 45

# OpenAI 이미지 모델
IMAGE_MODEL = "gpt-image-1"

# 생성 이미지 크기
GENERATE_SIZE = "1024x1024"

# 생성 품질
GENERATE_QUALITY = "high"


# ============================================================
# 후보 목록
# ============================================================

STYLES = [

    # --------------------------------------------------------
    # 고품질 그래픽 5개
    # --------------------------------------------------------

    (
        "01_classic",
        "Classic Betta",
        "high_quality"
    ),

    (
        "02_long_fin",
        "Long Fin Betta",
        "high_quality"
    ),

    (
        "03_crowntail",
        "Crowntail Betta",
        "high_quality"
    ),

    (
        "04_halfmoon",
        "Halfmoon Betta",
        "high_quality"
    ),

    (
        "05_fantasy",
        "Fantasy Betta",
        "high_quality"
    ),

    # --------------------------------------------------------
    # 픽셀 그래픽 5개
    # --------------------------------------------------------

    (
        "06_pixel_classic",
        "Pixel Classic Betta",
        "pixel"
    ),

    (
        "07_pixel_long_fin",
        "Pixel Long Fin Betta",
        "pixel"
    ),

    (
        "08_pixel_crowntail",
        "Pixel Crowntail Betta",
        "pixel"
    ),

    (
        "09_pixel_halfmoon",
        "Pixel Halfmoon Betta",
        "pixel"
    ),

    (
        "10_pixel_fantasy",
        "Pixel Fantasy Betta",
        "pixel"
    ),
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
# API Client
# ============================================================

def create_openai_client():

    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        print()
        print("[ERROR] OPENAI_API_KEY가 설정되어 있지 않습니다.")
        print()
        print(".env 파일에 다음과 같이 설정하세요:")
        print()
        print("OPENAI_API_KEY=your_api_key_here")
        print()

        sys.exit(1)

    return OpenAI(
        api_key=api_key
    )


# ============================================================
# 프롬프트 생성
# ============================================================

def build_prompt(style_name, style_type):

    # --------------------------------------------------------
    # 고품질 그래픽
    # --------------------------------------------------------

    if style_type == "high_quality":

        common = """
Create exactly ONE betta fish character based on the provided reference fish.

The result is for a digital aquarium game.

Keep the overall identity of a betta fish, but redesign the body,
tail, fins, silhouette, proportions, and visual details according
to the requested style.

The fish must be shown in a clean side-view profile.

The entire fish must be visible.

Do not create an aquarium.
Do not create water.
Do not create bubbles.
Do not create plants.
Do not create rocks.
Do not create another fish.
Do not create a human.
Do not add text or letters.

Use a clean game-asset presentation.

The fish should have a transparent or plain background.

Make the silhouette clearly different from the reference when
the requested style requires a different fin or tail structure.
"""

        styles = {

            "Classic Betta": """
Create a classic high-quality betta fish.

Moderately large flowing fins,
balanced body proportions,
natural rounded tail,
elegant but realistic ornamental betta appearance.

Use detailed fins and subtle scales.
Make it look like a polished premium game asset.
""",

            "Long Fin Betta": """
Create a long-fin betta.

The dorsal, anal, and caudal fins should be significantly
longer and more flowing than a normal betta.

The fins should have elegant trailing shapes and layered
fin membranes.

Make the silhouette obviously different from a classic
short-fin fish.
""",

            "Crowntail Betta": """
Create a crowntail betta.

The caudal fin must have distinctive separated rays
and pointed crown-like extensions.

The dorsal and anal fins should also have slightly
spiky separated structures.

Make the crown-tail silhouette very obvious.
""",

            "Halfmoon Betta": """
Create a halfmoon betta.

The caudal fin should spread into a large elegant
fan shape approaching a semicircle.

The tail should be dramatically wider than the body.

Create flowing ornamental fins while keeping the
fish readable as a side-view game character.
""",

            "Fantasy Betta": """
Create a fantasy-style betta fish.

Use an imaginative ornamental body and highly elaborate
flowing fins.

The tail and fins may contain elegant layered shapes,
fantasy-like patterns, subtle glowing accents,
and premium game-art detailing.

Keep the fish recognizable as a betta fish.
"""
        }

        return common + styles[style_name]


    # --------------------------------------------------------
    # 픽셀 그래픽
    # --------------------------------------------------------

    else:

        common = """
Create exactly ONE betta fish character based on the provided
reference fish.

This is a pixel-art game asset for a digital aquarium game.

Use a strong pixel-art aesthetic.

The fish must be shown in a clean side-view profile.

Use clearly visible square pixels,
pixel clusters,
hard edges,
limited color palette,
and intentionally simplified details.

Do NOT create smooth vector art.
Do NOT create a realistic painting.
Do NOT use anti-aliased smooth gradients.

The entire fish must be visible.

Do not create an aquarium.
Do not create water.
Do not create bubbles.
Do not create plants.
Do not create rocks.
Do not create another fish.
Do not create a human.
Do not add text or letters.

The background should be transparent or plain.
"""

        styles = {

            "Pixel Classic Betta": """
Create a classic pixel-art betta.

Moderate flowing fins,
clear fish silhouette,
small pixel clusters for scales,
simple but attractive game-sprite design.
""",

            "Pixel Long Fin Betta": """
Create a pixel-art long-fin betta.

Make the dorsal, anal, and caudal fins
long and flowing using large recognizable
pixel clusters.

The silhouette should be clearly different
from the classic pixel betta.
""",

            "Pixel Crowntail Betta": """
Create a pixel-art crowntail betta.

The tail must have clearly separated
pointed crown-like rays.

Use strong pixel clusters to emphasize
the spiky tail structure.
""",

            "Pixel Halfmoon Betta": """
Create a pixel-art halfmoon betta.

The caudal fin should form a large
semicircular fan shape.

Make the tail dramatically wide while
maintaining a recognizable fish body.
""",

            "Pixel Fantasy Betta": """
Create a fantasy pixel-art betta.

Use an unusual ornamental silhouette,
large decorative fins,
fantasy patterns,
and a slightly magical game-sprite appearance.

Keep it clearly recognizable as a betta.
"""
        }

        return common + styles[style_name]


# ============================================================
# AI 이미지 생성
# ============================================================

def generate_ai_fish(
    client,
    input_path,
    style_name,
    style_type
):

    prompt = build_prompt(
        style_name,
        style_type
    )

    print()
    print("------------------------------------------------------------")
    print(f"[AI] {style_name}")
    print("------------------------------------------------------------")

    print("[AI] 이미지 생성 요청 중...")

    try:

        with open(
            input_path,
            "rb"
        ) as image_file:

            response = client.images.edit(

                model=IMAGE_MODEL,

                image=image_file,

                prompt=prompt,

                size=GENERATE_SIZE,

                quality=GENERATE_QUALITY,

                input_fidelity="high",

                background="transparent"
            )

        if not response.data:
            raise RuntimeError(
                "이미지 생성 결과가 없습니다."
            )

        image_data = response.data[0].b64_json

        if not image_data:
            raise RuntimeError(
                "이미지 base64 데이터가 없습니다."
            )

        image_bytes = base64.b64decode(
            image_data
        )

        return Image.open(
            __import__("io").BytesIO(image_bytes)
        ).convert("RGBA")

    except Exception as e:

        print()
        print(
            f"[ERROR] {style_name} 생성 실패"
        )

        print(
            f"       {type(e).__name__}: {e}"
        )

        return None


# ============================================================
# 배경 제거
# ============================================================

def remove_background(image):

    print("[처리] 배경 제거 중...")

    # PIL → PNG bytes
    import io

    buffer = io.BytesIO()

    image.save(
        buffer,
        format="PNG"
    )

    input_bytes = buffer.getvalue()

    # rembg
    output_bytes = remove(
        input_bytes
    )

    result = Image.open(
        io.BytesIO(output_bytes)
    ).convert("RGBA")

    return result


# ============================================================
# 알파 마스크 정리
# ============================================================

def clean_alpha(image):

    rgba = np.array(
        image
    )

    alpha = rgba[:, :, 3]

    # 작은 노이즈 제거
    alpha = cv2.GaussianBlur(
        alpha,
        (3, 3),
        0
    )

    # 너무 희미한 영역 제거
    alpha[alpha < 18] = 0

    # 경계 부드럽게
    alpha = cv2.GaussianBlur(
        alpha,
        (3, 3),
        0
    )

    rgba[:, :, 3] = alpha

    return Image.fromarray(
        rgba
    )


# ============================================================
# 물고기 영역 Crop
# ============================================================

def crop_to_fish(image):

    print("[처리] 물고기 실루엣 분석 중...")

    rgba = np.array(
        image
    )

    alpha = rgba[:, :, 3]

    ys, xs = np.where(
        alpha > 20
    )

    if len(xs) == 0 or len(ys) == 0:

        print(
            "[WARNING] 물고기 영역을 찾지 못했습니다."
        )

        return image

    x1 = max(
        0,
        xs.min() - MARGIN
    )

    y1 = max(
        0,
        ys.min() - MARGIN
    )

    x2 = min(
        image.width,
        xs.max() + MARGIN + 1
    )

    y2 = min(
        image.height,
        ys.max() + MARGIN + 1
    )

    return image.crop(
        (
            x1,
            y1,
            x2,
            y2
        )
    )


# ============================================================
# 640 × 640 Canvas
# ============================================================

def fit_to_canvas(image):

    print(
        "[처리] 640x640 디지털 트윈용 크기로 변환 중..."
    )

    max_size = (
        CANVAS_SIZE
        - (MARGIN * 2)
    )

    if image.width <= 0 or image.height <= 0:

        raise ValueError(
            "이미지 크기가 올바르지 않습니다."
        )

    scale = min(

        max_size / image.width,

        max_size / image.height
    )

    new_w = max(
        1,
        int(image.width * scale)
    )

    new_h = max(
        1,
        int(image.height * scale)
    )

    resized = image.resize(

        (
            new_w,
            new_h
        ),

        Image.Resampling.LANCZOS
    )

    canvas = Image.new(

        "RGBA",

        (
            CANVAS_SIZE,
            CANVAS_SIZE
        ),

        (
            0,
            0,
            0,
            0
        )
    )

    x = (
        CANVAS_SIZE
        - new_w
    ) // 2

    y = (
        CANVAS_SIZE
        - new_h
    ) // 2

    canvas.alpha_composite(

        resized,

        (
            x,
            y
        )
    )

    return canvas


# ============================================================
# 최종 이미지 처리
# ============================================================

def process_generated_image(image):

    # AI가 이미 투명 배경으로 만들어도
    # 안전하게 한 번 더 배경 제거
    image = remove_background(
        image
    )

    image = clean_alpha(
        image
    )

    image = crop_to_fish(
        image
    )

    image = fit_to_canvas(
        image
    )

    return image


# ============================================================
# 저장
# ============================================================

def save_image(
    image,
    output_path
):

    image.save(

        output_path,

        "PNG",

        optimize=True
    )


# ============================================================
# 메인
# ============================================================

def main():

    print("=" * 65)

    print(
        " Cyber Fish Tank - AI Betta Candidate Generator"
    )

    print("=" * 65)

    print(
        f"입력 이미지 : {INPUT_PATH}"
    )

    print(
        f"출력 폴더   : {OUT_DIR}"
    )

    print(
        f"AI 모델     : {IMAGE_MODEL}"
    )

    print()


    # --------------------------------------------------------
    # 입력 확인
    # --------------------------------------------------------

    if not os.path.exists(
        INPUT_PATH
    ):

        print(
            f"[ERROR] 입력 파일이 없습니다: {INPUT_PATH}"
        )

        sys.exit(1)


    # --------------------------------------------------------
    # API Client
    # --------------------------------------------------------

    client = create_openai_client()


    # --------------------------------------------------------
    # 출력 폴더 초기화
    # --------------------------------------------------------

    if os.path.exists(
        OUT_DIR
    ):

        print(
            "[1/3] 기존 후보 이미지 정리 중..."
        )

        shutil.rmtree(
            OUT_DIR
        )

    os.makedirs(
        OUT_DIR,
        exist_ok=True
    )


    # --------------------------------------------------------
    # 후보 생성
    # --------------------------------------------------------

    print()
    print(
        "[2/3] AI 물고기 후보 10개 생성 시작..."
    )

    print()

    success_count = 0


    for index, (
        filename,
        label,
        style_type
    ) in enumerate(STYLES):

        print(
            f"[{index + 1:02d}/10] {label}"
        )

        print(
            f"       타입: {style_type}"
        )

        image = generate_ai_fish(

            client,

            INPUT_PATH,

            label,

            style_type
        )


        # ----------------------------------------------------
        # 생성 실패
        # ----------------------------------------------------

        if image is None:

            print(
                f"[SKIP] {label} 생성 실패"
            )

            continue


        # ----------------------------------------------------
        # 후처리
        # ----------------------------------------------------

        try:

            print(
                "[처리] 최종 그래픽 후처리 중..."
            )

            processed = process_generated_image(
                image
            )

        except Exception as e:

            print(
                f"[ERROR] 이미지 후처리 실패: {e}"
            )

            continue


        # ----------------------------------------------------
        # 저장
        # ----------------------------------------------------

        output_path = os.path.join(

            OUT_DIR,

            f"{filename}.png"
        )

        save_image(

            processed,

            output_path
        )

        success_count += 1

        print(
            f"[OK] 저장 완료: {output_path}"
        )

        print()


        # API 요청 간 약간의 간격
        time.sleep(1)


    # --------------------------------------------------------
    # 완료
    # --------------------------------------------------------

    print(
        "[3/3] 생성 작업 완료!"
    )

    print()

    print("=" * 65)

    print(
        f" 성공: {success_count}/10"
    )

    print(
        f" 출력 위치: {OUT_DIR}"
    )

    print("=" * 65)

    print()

    print(
        "생성된 후보:"
    )

    print()

    for filename, label, style_type in STYLES:

        path = os.path.join(

            OUT_DIR,

            f"{filename}.png"
        )

        if os.path.exists(path):

            print(
                f"  [OK] {filename}.png"
                f"  -> {label}"
            )

        else:

            print(
                f"  [FAIL] {filename}.png"
                f"  -> {label}"
            )

    print()


# ============================================================
# 실행
# ============================================================

if __name__ == "__main__":

    main()