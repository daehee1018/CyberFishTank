import os
import sys
import json
import uuid
import time
import random
import io

import requests
import cv2
import numpy as np
from PIL import Image
from rembg import remove, new_session


# ============================================================
# 설정
# ============================================================

CANVAS_WIDTH = 1536
CANVAS_HEIGHT = 1024
MARGIN = 45

COMFY_URL = os.getenv("COMFY_URL", "http://127.0.0.1:8188")

WORKFLOW_PATH = os.getenv(
    "FISH_WORKFLOW",
    os.path.join(os.path.dirname(__file__), "fish_img2img_api.json")
)

INPUT_PATH = sys.argv[1] if len(sys.argv) > 1 else "base_fish.png"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "fish_10_candidates"

# 기존에 성공했던 값
STEPS = 20
CFG = 8
DENOISE_HIGH = 0.55
DENOISE_PIXEL = 0.58

STYLES = [
    ("01_classic", "Classic Betta", "high_quality"),
    ("02_halfmoon", "Halfmoon Betta", "high_quality"),
    ("03_fantasy", "Fantasy Betta", "high_quality"),

    ("04_lowpoly_angular", "Low Poly Angular", "lowpoly"),
    ("05_lowpoly_faceted", "Low Poly Faceted", "lowpoly"),

    ("06_pixel_classic", "Pixel Classic Betta", "pixel"),
    ("07_pixel_long_fin", "Pixel Long Fin Betta", "pixel"),
    ("08_pixel_crowntail", "Pixel Crowntail Betta", "pixel"),

    ("09_silhouette", "Silhouette Vector", "silhouette"),
    ("10_silhouette_fin", "Silhouette Vector Fin", "silhouette"),
]


# ============================================================
# 프롬프트
# ============================================================

def build_prompt(style_name, style_type):

    # --------------------------------------------------------
    # 고품질 2D
    # --------------------------------------------------------
    if style_type == "high_quality":

        common = """
Clean high-quality 2D betta fish game asset based on input image reference.
Clean side-view profile, entire fish inside frame, transparent background.

BODY PROPORTIONS:
Longer horizontal body proportion, slightly thicker torso.
The main body is the dominant visual mass with low vertical height.
Keep head shape and eye position aligned with input image reference.

FINS & TAIL:
Short compact dorsal fin, short compact anal fin.
Fins stay close to the body, occupying a small portion of the silhouette.
Moderate neat tail size.

STYLE:
Polished 2D game asset, clean digital illustration style.
"""

        style_prompt = {
            "Classic Betta": """
Classic betta appearance.
Natural compact fins and moderately sized tail.
Strong horizontal body emphasis.
""",

            "Halfmoon Betta": """
Halfmoon-inspired appearance.
Rounded fan-shaped tail.
Short dorsal and anal fins with substantial body length.
""",

            "Fantasy Betta": """
Fantasy-inspired appearance.
Vibrant decorative colors and subtle magical accents.
Compact fins with dominant body proportions.
"""
        }

        return common + style_prompt.get(style_name, "")

    # --------------------------------------------------------
    # Low Poly
    # --------------------------------------------------------
    elif style_type == "lowpoly":

        common = """
Stylized low-poly betta fish game asset based on input image reference.
Clean side-view profile, entire fish inside frame, transparent background.

BODY PROPORTIONS:
Longer horizontal body, slightly thicker torso.
Low vertical height, dominant body visual mass.

LOW POLY STYLE:
Visible polygonal surfaces and sharp angular geometric shapes.
Triangular and polygonal facets across the body.
Simplified polygonal 3D-inspired game asset illustration with clean geometric edges.

FINS & TAIL:
Short compact fins tightly aligned to the body.
Geometric polygonal tail shape in moderate size.
"""

        style_prompt = {
            "Low Poly Angular": """
Strong angular low-poly style.
Large clearly visible polygon facets and sharp geometric body planes.
Distinct triangular shapes.
""",

            "Low Poly Faceted": """
Highly faceted low-poly style with detailed polygonal body structure.
Many clearly separated polygon surfaces and geometric mesh composition.
"""
        }

        return common + style_prompt.get(style_name, "")

    # --------------------------------------------------------
    # Pixel Art
    # --------------------------------------------------------
    elif style_type == "pixel":

        common = """
Clean pixel art betta fish game asset based on input image reference.
Clean side-view profile, entire fish inside frame, transparent background.

BODY PROPORTIONS:
Longer horizontal body, slightly thicker torso.
Low vertical height, main body as dominant visual mass.

PIXEL ART STYLE:
Large chunky pixels, low-resolution retro 16-bit sprite appearance.
Sharp blocky pixel edges and clean sprite outlines.

FINS & TAIL:
Very short compact fins held close to the body.
Moderate tail size with sharp pixel definition.
"""

        style_prompt = {
            "Pixel Classic Betta": """
Classic retro pixel sprite.
Compact horizontal proportions and short neat fins.
""",

            "Pixel Long Fin Betta": """
Distinctive pixel tail details with short compact dorsal and anal fins.
Chunky retro pixel shapes.
""",

            "Pixel Crowntail Betta": """
Crowntail-inspired design with small pointed pixel tail edges.
Compact body structure and chunky pixel shapes.
"""
        }

        return common + style_prompt.get(style_name, "")

    # --------------------------------------------------------
    # Silhouette Vector
    # --------------------------------------------------------
    elif style_type == "silhouette":

        common = """
Minimal flat vector silhouette of a betta fish based on input image reference.
Clean side-view profile, entire fish inside frame, transparent background.

BODY PROPORTIONS:
Longer horizontal body, thick compact body shape.
Low vertical height with recognizable betta contour.

VECTOR SILHOUETTE STYLE:
Flat single-color fish silhouette.
Bold recognizable outer contour with smooth clean vector edges.
Minimalist logo icon appearance.
"""

        style_prompt = {
            "Silhouette Vector": """
Minimal elegant betta silhouette with smooth flowing outer contour.
Moderate rounded tail and simple clean vector logo style.
""",

            "Silhouette Vector Fin": """
Bold betta silhouette with sharp distinctive tail and fin contours.
Thick horizontal body with modern graphic icon appearance.
"""
        }

        return common + style_prompt.get(style_name, "")

    # --------------------------------------------------------
    # 기본값
    # --------------------------------------------------------
    else:
        return """
Create a clean betta fish game asset based on the input image.

Keep a horizontal compact body.
Keep the fish side-facing.
Keep the entire fish inside the image.
Transparent background.
"""


# ============================================================
# ComfyUI 통신
# ============================================================

def check_comfyui():
    try:
        r = requests.get(f"{COMFY_URL}/system_stats", timeout=5)
        r.raise_for_status()
        print(f"[OK] ComfyUI 연결: {COMFY_URL}")
        return True
    except Exception as e:
        print(f"[ERROR] ComfyUI에 연결할 수 없습니다: {COMFY_URL}")
        print(f"        {e}")
        print("        ComfyUI를 먼저 실행하세요.")
        return False


def upload_image(image_path):
    filename = os.path.basename(image_path)

    with open(image_path, "rb") as f:
        files = {
            "image": (
                filename,
                f,
                "image/png" if filename.lower().endswith(".png") else "image/jpeg"
            )
        }

        data = {
            "overwrite": "true"
        }

        r = requests.post(
            f"{COMFY_URL}/upload/image",
            files=files,
            data=data,
            timeout=60,
        )

    r.raise_for_status()
    result = r.json()

    uploaded_name = result.get("name", filename)
    subfolder = result.get("subfolder", "")

    print(f"[OK] ComfyUI 입력 이미지 업로드: {uploaded_name}")

    return uploaded_name, subfolder


def load_workflow():
    with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def prepare_workflow(workflow, image_name, prompt, seed, denoise):
    # 깊은 복사
    wf = json.loads(json.dumps(workflow))

    # LoadImage node
    if "53" not in wf:
        raise RuntimeError("워크플로우에서 LoadImage 노드(53)를 찾을 수 없습니다.")

    wf["53"]["inputs"]["image"] = image_name

    # Positive prompt
    if "6" not in wf:
        raise RuntimeError("워크플로우에서 Positive CLIP 노드(6)를 찾을 수 없습니다.")

    wf["6"]["inputs"]["text"] = prompt

    # Negative prompt
    if "7" not in wf:
        raise RuntimeError("워크플로우에서 Negative CLIP 노드(7)를 찾을 수 없습니다.")

    wf["7"]["inputs"]["text"] = """
photorealistic,
photograph,
3d render,

long fins,
tall fins,
large fins,
huge fins,
oversized fins,
elongated fins,
vertical fins,

long dorsal fin,
tall dorsal fin,
large dorsal fin,

long anal fin,
tall anal fin,
large anal fin,

dorsal fin extending upward,
anal fin extending downward,

flowing fins,
trailing fins,
hanging fins,
streamer fins,
veil fins,

giant tail,
oversized tail,
extremely long tail,

vertically elongated fish,
tall fish,
stretched fish,

deformed body,
warped body,
distorted anatomy,
extra fins,
extra appendages
"""

    # KSampler node
    if "57" not in wf:
        raise RuntimeError("워크플로우에서 KSampler 노드(57)를 찾을 수 없습니다.")

    wf["57"]["inputs"]["seed"] = int(seed)
    wf["57"]["inputs"]["steps"] = STEPS
    wf["57"]["inputs"]["cfg"] = CFG
    wf["57"]["inputs"]["denoise"] = denoise

    # SaveImage 파일명
    if "19" in wf:
        wf["19"]["inputs"]["filename_prefix"] = "fish_candidate"

    return wf


def queue_prompt(workflow):
    client_id = str(uuid.uuid4())

    payload = {
        "prompt": workflow,
        "client_id": client_id,
    }

    r = requests.post(
        f"{COMFY_URL}/prompt",
        json=payload,
        timeout=60,
    )

    if not r.ok:
        print("[ERROR] ComfyUI /prompt 응답:")
        print(r.text)

    r.raise_for_status()
    result = r.json()

    if "error" in result:
        raise RuntimeError(f"ComfyUI workflow error: {result}")

    prompt_id = result.get("prompt_id")

    if not prompt_id:
        raise RuntimeError(f"prompt_id가 없습니다: {result}")

    print(f"[OK] ComfyUI 작업 등록: {prompt_id}")

    return prompt_id


def wait_for_result(prompt_id, timeout=600):
    start = time.time()

    while True:
        if time.time() - start > timeout:
            raise TimeoutError(f"ComfyUI 생성 시간 초과: {prompt_id}")

        r = requests.get(
            f"{COMFY_URL}/history/{prompt_id}",
            timeout=30,
        )

        r.raise_for_status()
        history = r.json()

        item = history.get(prompt_id)

        if item:
            status = item.get("status", {})

            if status.get("status_str") == "error":
                raise RuntimeError(
                    "ComfyUI 이미지 생성 실패:\n"
                    + json.dumps(item, ensure_ascii=False, indent=2)
                )

            if status.get("completed") is True:
                outputs = item.get("outputs", {})

                # SaveImage 결과 찾기
                for node_id, node_output in outputs.items():
                    images = node_output.get("images", [])

                    if images:
                        image_info = images[0]

                        print("[OK] ComfyUI 이미지 생성 완료")

                        return image_info

        elapsed = int(time.time() - start)

        print(
            f"\r[대기] ComfyUI 생성 중... {elapsed}s",
            end="",
            flush=True
        )

        time.sleep(1)


def download_result(image_info):
    params = {
        "filename": image_info["filename"],
        "subfolder": image_info.get("subfolder", ""),
        "type": image_info.get("type", "output"),
    }

    r = requests.get(
        f"{COMFY_URL}/view",
        params=params,
        timeout=120,
    )

    r.raise_for_status()

    return Image.open(
        io.BytesIO(r.content)
    ).convert("RGBA")


# ============================================================
# rembg 세션
# ============================================================

REMBG_SESSION = new_session("u2netp")


# ============================================================
# 이미지 후처리
# ============================================================

def remove_background(image):
    print("[처리] 배경 제거 중...")

    # ComfyUI에서 생성된 1024x1024 이미지를
    # 배경 제거 전에 512x512로 축소하여 메모리 사용량 감소
    background_input = image.resize(
        (512, 512),
        Image.Resampling.LANCZOS
    ).convert("RGBA")

    input_bytes = io.BytesIO()

    try:
        background_input.save(
            input_bytes,
            format="PNG"
        )

        output_bytes = remove(
            input_bytes.getvalue(),
            session=REMBG_SESSION
        )

    finally:
        background_input.close()
        input_bytes.close()

    result = Image.open(
        io.BytesIO(output_bytes)
    ).convert("RGBA")

    return result


def clean_alpha(image):
    rgba = np.array(image)
    alpha = rgba[:, :, 3]

    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
    alpha[alpha < 18] = 0
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

    rgba[:, :, 3] = alpha

    return Image.fromarray(rgba)


def crop_to_fish(image):
    rgba = np.array(image)
    alpha = rgba[:, :, 3]

    ys, xs = np.where(alpha > 20)

    if len(xs) == 0 or len(ys) == 0:
        print("[WARN] 물고기 영역을 찾지 못했습니다. 원본 크기를 사용합니다.")
        return image

    x1 = max(0, int(xs.min()) - 5)
    y1 = max(0, int(ys.min()) - 5)
    x2 = min(image.width, int(xs.max()) + 6)
    y2 = min(image.height, int(ys.max()) + 6)

    return image.crop((x1, y1, x2, y2))


def fit_to_canvas(image):
    max_width = CANVAS_WIDTH - (MARGIN * 2)
    max_height = CANVAS_HEIGHT - (MARGIN * 2)

    # 원본 가로세로 비율을 유지하면서
    # 1536x1024 캔버스 안에 맞춤
    scale = min(
        max_width / image.width,
        max_height / image.height
    )

    new_w = max(1, int(image.width * scale))
    new_h = max(1, int(image.height * scale))

    resized = image.resize(
        (new_w, new_h),
        Image.Resampling.LANCZOS
    )

    canvas = Image.new(
        "RGBA",
        (CANVAS_WIDTH, CANVAS_HEIGHT),
        (0, 0, 0, 0)
    )

    x = (CANVAS_WIDTH - new_w) // 2
    y = (CANVAS_HEIGHT - new_h) // 2

    canvas.alpha_composite(resized, (x, y))

    return canvas


def make_pixel_art(image):
    # 1536x1024 -> 96x64 -> 1536x1024
    # 3:2 비율을 그대로 유지
    # 기존 192x128보다 픽셀 크기를 크게 만듦

    small_width = 96
    small_height = 64

    small = image.resize(
        (small_width, small_height),
        Image.Resampling.LANCZOS
    )

    pixel = small.resize(
        (CANVAS_WIDTH, CANVAS_HEIGHT),
        Image.Resampling.NEAREST
    )

    return pixel


def process_generated_image(image, style_type):
    image = remove_background(image)

    image = clean_alpha(image)

    image = crop_to_fish(image)

    image = fit_to_canvas(image)

    if style_type == "pixel":
        image = make_pixel_art(image)

    return image


def save_image(image, output_path):
    image.save(
        output_path,
        "PNG",
        optimize=True
    )


# ============================================================
# 메인
# ============================================================

def main():
    print("=" * 70)
    print("Cyber Fish Tank - ComfyUI 10 Fish Candidate Generator")
    print("=" * 70)
    print(f"ComfyUI : {COMFY_URL}")
    print(f"Input   : {INPUT_PATH}")
    print(f"Output  : {OUT_DIR}")
    print(f"Workflow: {WORKFLOW_PATH}")
    print()

    if not os.path.exists(INPUT_PATH):
        print(f"[ERROR] 입력 이미지가 없습니다: {INPUT_PATH}")
        sys.exit(1)

    if not os.path.exists(WORKFLOW_PATH):
        print(f"[ERROR] ComfyUI API workflow가 없습니다: {WORKFLOW_PATH}")
        sys.exit(1)

    if not check_comfyui():
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    # 기존 후보 이미지 제거
    for filename in os.listdir(OUT_DIR):
        path = os.path.join(OUT_DIR, filename)

        if os.path.isfile(path) and filename.lower().endswith(".png"):
            os.remove(path)

    # 입력 이미지 ComfyUI 업로드
    image_name, image_subfolder = upload_image(INPUT_PATH)

    base_workflow = load_workflow()

    success = []

    for index, (filename, label, style_type) in enumerate(STYLES, start=1):

        print()
        print("=" * 70)
        print(f"[{index}/10] {label}")
        print("=" * 70)

        try:
            prompt = build_prompt(label, style_type)

            seed = random.randint(1, 2**63 - 1)

            denoise = (
                DENOISE_HIGH
                if style_type == "high_quality"
                else DENOISE_PIXEL
            )

            workflow = prepare_workflow(
                base_workflow,
                image_name,
                prompt,
                seed,
                denoise
            )

            print(f"[설정] seed={seed}")
            print(f"[설정] denoise={denoise}")
            print(f"[설정] steps={STEPS}")
            print(f"[설정] cfg={CFG}")

            prompt_id = queue_prompt(workflow)

            image_info = wait_for_result(prompt_id)

            generated = download_result(image_info)

            processed = process_generated_image(
                generated,
                style_type
            )

            output_path = os.path.join(
                OUT_DIR,
                f"{filename}.png"
            )

            save_image(processed, output_path)

            print(f"[OK] 저장 완료: {output_path}")

            success.append(output_path)

            time.sleep(1)

        except Exception as e:
            print(f"[ERROR] {label} 생성 실패")
            print(e)

    print()
    print("=" * 70)
    print(f"완료: {len(success)}/10")
    print("=" * 70)

    for path in success:
        print(f"  - {path}")

    if len(success) != 10:
        print()
        print("[WARN] 10개 중 일부 생성에 실패했습니다.")
        sys.exit(2)


if __name__ == "__main__":
    main()