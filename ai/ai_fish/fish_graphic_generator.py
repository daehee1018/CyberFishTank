import os
import sys
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


# ============================================================
# Cyber Fish Tank
# Fish Graphic Generator
#
# 사진 속 물고기의 특징을 분석해서
# 2D Digital Twin 그래픽으로 재구성한다.
#
# 처리 과정
# 1. 배경 제거
# 2. 물고기 영역 추출
# 3. 실루엣 분석
# 4. 색상 영역 분석
# 5. 색상 양자화
# 6. 명암 단순화
# 7. 외곽선 생성
# 8. 하이라이트 / 그림자 생성
# 9. 투명 배경 PNG 출력
# ============================================================


# ------------------------------------------------------------
# 기본 설정
# ------------------------------------------------------------

OUTPUT_SIZE = 700

# 물고기 주변 여백
PADDING = 60

# 색상 단계
COLOR_LEVELS = 8


# ------------------------------------------------------------
# 1. 이미지 불러오기
# ------------------------------------------------------------

def load_image(path):

    print("[1/8] 원본 이미지 불러오는 중...")

    image = cv2.imread(path, cv2.IMREAD_UNCHANGED)

    if image is None:
        raise FileNotFoundError(
            f"이미지를 불러올 수 없습니다: {path}"
        )

    # grayscale
    if len(image.shape) == 2:
        image = cv2.cvtColor(
            image,
            cv2.COLOR_GRAY2BGRA
        )

    # BGR
    elif image.shape[2] == 3:
        image = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2BGRA
        )

    return image


# ------------------------------------------------------------
# 2. 배경 제거
# ------------------------------------------------------------

def remove_background(image):

    print("[2/8] 물고기 영역 분석 중...")

    h, w = image.shape[:2]

    # 이미 Alpha가 의미 있게 존재하면 사용
    alpha = image[:, :, 3]

    if np.min(alpha) < 250:

        # 기존 alpha 활용
        mask = alpha.copy()

    else:

        # GrabCut을 이용한 foreground 추출
        bgr = image[:, :, :3]

        mask = np.zeros(
            (h, w),
            np.uint8
        )

        # 가장자리 = 배경
        mask[:, :] = cv2.GC_BGD

        margin_x = max(5, int(w * 0.03))
        margin_y = max(5, int(h * 0.03))

        # 중앙 영역은 foreground 후보
        mask[
            margin_y:h-margin_y,
            margin_x:w-margin_x
        ] = cv2.GC_PR_FGD

        # 중앙보다 더 강하게 foreground로 지정
        cx1 = int(w * 0.15)
        cx2 = int(w * 0.85)

        cy1 = int(h * 0.15)
        cy2 = int(h * 0.85)

        mask[cy1:cy2, cx1:cx2] = cv2.GC_PR_FGD

        bgd_model = np.zeros(
            (1, 65),
            np.float64
        )

        fgd_model = np.zeros(
            (1, 65),
            np.float64
        )

        try:

            cv2.grabCut(
                bgr,
                mask,
                None,
                bgd_model,
                fgd_model,
                5,
                cv2.GC_INIT_WITH_MASK
            )

            binary_mask = np.where(
                (mask == cv2.GC_FGD) |
                (mask == cv2.GC_PR_FGD),
                255,
                0
            ).astype(np.uint8)

            mask = binary_mask

        except Exception:

            print(
                "[WARNING] GrabCut 실패. "
                "전체 이미지를 foreground로 사용합니다."
            )

            mask = np.ones(
                (h, w),
                dtype=np.uint8
            ) * 255

    # --------------------------------------------------------
    # 마스크 정리
    # --------------------------------------------------------

    kernel = np.ones(
        (5, 5),
        np.uint8
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        kernel,
        iterations=2
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_OPEN,
        kernel,
        iterations=1
    )

    # 작은 잡음 제거
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask,
        connectivity=8
    )

    if num_labels > 1:

        largest_label = 1 + np.argmax(
            stats[1:, cv2.CC_STAT_AREA]
        )

        mask = np.where(
            labels == largest_label,
            255,
            0
        ).astype(np.uint8)

    # 가장자리 부드럽게
    mask = cv2.GaussianBlur(
        mask,
        (7, 7),
        0
    )

    return mask


# ------------------------------------------------------------
# 3. 물고기 크롭 + 정규화
# ------------------------------------------------------------

def crop_fish(image, mask):

    print("[3/8] 물고기 실루엣 분석 중...")

    ys, xs = np.where(mask > 30)

    if len(xs) == 0 or len(ys) == 0:
        raise RuntimeError(
            "물고기 영역을 찾지 못했습니다."
        )

    x1 = max(
        0,
        int(np.min(xs)) - PADDING
    )

    y1 = max(
        0,
        int(np.min(ys)) - PADDING
    )

    x2 = min(
        image.shape[1],
        int(np.max(xs)) + PADDING
    )

    y2 = min(
        image.shape[0],
        int(np.max(ys)) + PADDING
    )

    cropped_image = image[y1:y2, x1:x2]
    cropped_mask = mask[y1:y2, x1:x2]

    return cropped_image, cropped_mask


# ------------------------------------------------------------
# 4. 그래픽용 크기 조정
# ------------------------------------------------------------

def normalize_canvas(image, mask):

    print("[4/8] 디지털 트윈 크기로 변환 중...")

    h, w = image.shape[:2]

    scale = min(
        (OUTPUT_SIZE - PADDING * 2) / w,
        (OUTPUT_SIZE - PADDING * 2) / h
    )

    new_w = max(
        1,
        int(w * scale)
    )

    new_h = max(
        1,
        int(h * scale)
    )

    image = cv2.resize(
        image,
        (new_w, new_h),
        interpolation=cv2.INTER_LANCZOS4
    )

    mask = cv2.resize(
        mask,
        (new_w, new_h),
        interpolation=cv2.INTER_CUBIC
    )

    canvas = np.zeros(
        (OUTPUT_SIZE, OUTPUT_SIZE, 4),
        dtype=np.uint8
    )

    # 중앙 배치
    x = (OUTPUT_SIZE - new_w) // 2
    y = (OUTPUT_SIZE - new_h) // 2

    canvas[
        y:y+new_h,
        x:x+new_w
    ] = image

    canvas_mask = np.zeros(
        (OUTPUT_SIZE, OUTPUT_SIZE),
        dtype=np.uint8
    )

    canvas_mask[
        y:y+new_h,
        x:x+new_w
    ] = mask

    return canvas, canvas_mask


# ------------------------------------------------------------
# 5. 색상 양자화
# ------------------------------------------------------------

def quantize_colors(bgr):

    # 작은 크기로 줄였다가 다시 확대하면
    # 지나치게 많은 색상을 하나의 그래픽 색상군으로 묶을 수 있다.

    small = cv2.resize(
        bgr,
        (120, 120),
        interpolation=cv2.INTER_AREA
    )

    data = np.float32(
        small.reshape((-1, 3))
    )

    criteria = (
        cv2.TERM_CRITERIA_EPS +
        cv2.TERM_CRITERIA_MAX_ITER,
        20,
        1.0
    )

    K = COLOR_LEVELS

    _, labels, centers = cv2.kmeans(
        data,
        K,
        None,
        criteria,
        3,
        cv2.KMEANS_PP_CENTERS
    )

    centers = np.uint8(centers)

    quantized = centers[
        labels.flatten()
    ]

    quantized = quantized.reshape(
        small.shape
    )

    quantized = cv2.resize(
        quantized,
        (
            bgr.shape[1],
            bgr.shape[0]
        ),
        interpolation=cv2.INTER_NEAREST
    )

    return quantized


# ------------------------------------------------------------
# 6. 그래픽 스타일 생성
# ------------------------------------------------------------

def create_graphic(image, mask):

    print("[5/8] 물고기 특징을 그래픽으로 재구성 중...")

    bgr = image[:, :, :3].copy()

    # --------------------------------------------------------
    # 색상 단순화
    # --------------------------------------------------------

    quantized = quantize_colors(bgr)

    # --------------------------------------------------------
    # 부드러운 색상 처리
    # --------------------------------------------------------

    smooth = cv2.bilateralFilter(
        quantized,
        9,
        50,
        50
    )

    # --------------------------------------------------------
    # 명암 분석
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        bgr,
        cv2.COLOR_BGR2GRAY
    )

    # 물고기 내부 명암을 강조
    shadow = cv2.GaussianBlur(
        gray,
        (0, 0),
        4
    )

    # --------------------------------------------------------
    # 외곽선
    # --------------------------------------------------------

    edges = cv2.Canny(
        gray,
        50,
        130
    )

    # 물고기 내부의 세부 윤곽도 살리기
    edges = cv2.GaussianBlur(
        edges,
        (3, 3),
        0
    )

    edges = np.where(
        edges > 40,
        255,
        0
    ).astype(np.uint8)

    # --------------------------------------------------------
    # 외곽선 강화
    # --------------------------------------------------------

    contour_mask = cv2.Canny(
        mask,
        40,
        120
    )

    # 내부 디테일 + 외곽선
    combined_edges = cv2.max(
        edges,
        contour_mask
    )

    # --------------------------------------------------------
    # 그래픽 색상 생성
    # --------------------------------------------------------

    graphic = smooth.copy()

    # 명암 기반 shading
    light = shadow.astype(
        np.float32
    ) / 255.0

    # 너무 강한 명암은 제한
    light = np.clip(
        light,
        0.25,
        0.9
    )

    graphic_float = graphic.astype(
        np.float32
    )

    # 입체감
    graphic_float *= (
        0.82 + light[:, :, None] * 0.28
    )

    graphic = np.clip(
        graphic_float,
        0,
        255
    ).astype(np.uint8)

    # --------------------------------------------------------
    # 하이라이트
    # --------------------------------------------------------

    highlight = cv2.GaussianBlur(
        gray,
        (0, 0),
        12
    )

    highlight_threshold = np.percentile(
        highlight[mask > 100],
        78
    ) if np.any(mask > 100) else 220

    highlight_mask = np.where(
        highlight > highlight_threshold,
        1.0,
        0.0
    ).astype(np.float32)

    highlight_mask *= (
        mask.astype(np.float32) / 255.0
    )

    graphic_float = graphic.astype(
        np.float32
    )

    graphic_float += (
        highlight_mask[:, :, None] * 18
    )

    graphic = np.clip(
        graphic_float,
        0,
        255
    ).astype(np.uint8)

    # --------------------------------------------------------
    # 외곽선 적용
    # --------------------------------------------------------

    edge_strength = (
        combined_edges.astype(
            np.float32
        ) / 255.0
    )

    graphic_float = graphic.astype(
        np.float32
    )

    graphic_float *= (
        1.0 - edge_strength[:, :, None] * 0.38
    )

    graphic = np.clip(
        graphic_float,
        0,
        255
    ).astype(np.uint8)

    return graphic


# ------------------------------------------------------------
# 7. 투명 PNG 생성
# ------------------------------------------------------------

def create_transparent_png(
    graphic,
    mask,
    output_path
):

    print("[6/8] 투명 배경 그래픽 생성 중...")

    rgba = cv2.cvtColor(
        graphic,
        cv2.COLOR_BGR2BGRA
    )

    # 가장자리 alpha 부드럽게
    alpha = cv2.GaussianBlur(
        mask,
        (3, 3),
        0
    )

    rgba[:, :, 3] = alpha

    # 배경 완전 제거
    rgba[
        alpha < 8,
        3
    ] = 0

    cv2.imwrite(
        output_path,
        rgba
    )


# ------------------------------------------------------------
# 8. 최종 후처리
# ------------------------------------------------------------

def final_polish(input_path, output_path):

    print("[7/8] 그래픽 품질 보정 중...")

    image = Image.open(
        output_path
    ).convert("RGBA")

    # 약간 선명하게
    image = image.filter(
        ImageFilter.UnsharpMask(
            radius=1.2,
            percent=110,
            threshold=3
        )
    )

    # 약간의 대비 강화
    rgb = image.convert("RGB")

    rgb = ImageEnhance.Contrast(
        rgb
    ).enhance(1.06)

    rgb = ImageEnhance.Color(
        rgb
    ).enhance(1.04)

    alpha = image.getchannel("A")

    final = Image.merge(
        "RGBA",
        (
            rgb.getchannel("R"),
            rgb.getchannel("G"),
            rgb.getchannel("B"),
            alpha
        )
    )

    final.save(
        output_path,
        "PNG"
    )

    print("[8/8] 최종 그래픽 저장 완료")


# ------------------------------------------------------------
# 메인
# ------------------------------------------------------------

def generate_fish_graphic(
    input_path,
    output_path
):

    print()
    print("=" * 60)
    print("Cyber Fish Tank")
    print("Fish Graphic Generator")
    print("=" * 60)
    print()

    if not os.path.exists(input_path):

        raise FileNotFoundError(
            f"입력 이미지가 없습니다: {input_path}"
        )

    os.makedirs(
        os.path.dirname(output_path),
        exist_ok=True
    )

    # 1
    image = load_image(
        input_path
    )

    # 2
    mask = remove_background(
        image
    )

    # 3
    image, mask = crop_fish(
        image,
        mask
    )

    # 4
    image, mask = normalize_canvas(
        image,
        mask
    )

    # 5~6
    graphic = create_graphic(
        image,
        mask
    )

    # 7
    create_transparent_png(
        graphic,
        mask,
        output_path
    )

    # 8
    final_polish(
        input_path,
        output_path
    )

    print()
    print("=" * 60)
    print("생성 완료!")
    print(f"출력: {output_path}")
    print("=" * 60)
    print()


# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------

if __name__ == "__main__":

    if len(sys.argv) < 3:

        print(
            "사용법:"
        )

        print(
            "python fish_graphic_generator.py "
            "<input_image> <output_image>"
        )

        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    try:

        generate_fish_graphic(
            input_path,
            output_path
        )

    except Exception as e:

        print()
        print("[ERROR]")
        print(e)

        sys.exit(1)