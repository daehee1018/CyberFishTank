# local_fish_sprite_generator.py

import os
import cv2
import torch
import numpy as np
from pathlib import Path
from PIL import Image
from rembg import remove

from diffusers import (
    ControlNetModel,
    StableDiffusionXLControlNetImg2ImgPipeline,
    AutoencoderKL,
    EulerAncestralDiscreteScheduler,
)

INPUT_PATH = r"C:\Users\jsh14\Desktop\s\test\다운로드 (1).jpg"

OUT_DIR = Path("local_ai_fish_candidates")
CLEAN_PATH = OUT_DIR / "clean_input.png"
CANNY_PATH = OUT_DIR / "canny_control.png"

N_CANDIDATES = 10
SIZE = 1024

SELECTED_CANDIDATE = None
# 예: SELECTED_CANDIDATE = 3

DEVICE = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

BASE_MODEL = "stabilityai/stable-diffusion-xl-base-1.0"
CONTROLNET_MODEL = "diffusers/controlnet-canny-sdxl-1.0"
VAE_MODEL = "madebyollin/sdxl-vae-fp16-fix"


def prepare_input():
    OUT_DIR.mkdir(exist_ok=True)

    img = Image.open(INPUT_PATH).convert("RGBA")
    cut = remove(img)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cut.thumbnail((850, 850), Image.LANCZOS)

    x = (SIZE - cut.width) // 2
    y = (SIZE - cut.height) // 2
    canvas.paste(cut, (x, y), cut)
    canvas.save(CLEAN_PATH)

    rgb = Image.new("RGB", canvas.size, (255, 255, 255))
    rgb.paste(canvas, mask=canvas.split()[-1])

    arr = np.array(rgb)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 80, 180)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8), iterations=1)

    canny = np.stack([edges, edges, edges], axis=-1)
    canny_img = Image.fromarray(canny)
    canny_img.save(CANNY_PATH)

    return rgb, canny_img


def load_pipeline():
    controlnet = ControlNetModel.from_pretrained(
        CONTROLNET_MODEL,
        torch_dtype=DTYPE,
    )

    vae = AutoencoderKL.from_pretrained(
        VAE_MODEL,
        torch_dtype=DTYPE,
    )

    pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(
        BASE_MODEL,
        controlnet=controlnet,
        vae=vae,
        torch_dtype=DTYPE,
        variant="fp16" if DEVICE == "cuda" else None,
        use_safetensors=True,
    )

    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to(DEVICE)

    if DEVICE == "cuda":
        pipe.enable_model_cpu_offload()
        pipe.enable_xformers_memory_efficient_attention()

    return pipe


def make_prompt(i):
    return f"""
high quality 2D low-poly fish sprite,
stylized polygon art fish,
clean vector-like geometric facets,
cute aquarium digital twin game asset,
side view fish, centered composition,
large expressive fins and tail,
simple black eye,
polished mobile game sprite,
vibrant colors based on the reference fish,
transparent or plain white background,
sharp clean silhouette,
candidate variation {i},
different polygon facet layout and fin proportions
"""


def make_negative_prompt():
    return """
photo, realistic photo, blurry, noisy, low quality, ugly, deformed fish,
extra fins, extra eyes, extra mouth, broken anatomy,
text, watermark, logo, frame, aquarium background, plants, rocks,
human, hand, camera UI, bounding box, label
"""


def generate_candidates(pipe, init_image, control_image):
    saved = []

    for i in range(1, N_CANDIDATES + 1):
        generator = torch.Generator(device=DEVICE).manual_seed(1000 + i)

        result = pipe(
            prompt=make_prompt(i),
            negative_prompt=make_negative_prompt(),
            image=init_image,
            control_image=control_image,
            strength=0.72,
            controlnet_conditioning_scale=0.85,
            guidance_scale=7.5,
            num_inference_steps=35,
            generator=generator,
        ).images[0]

        out_path = OUT_DIR / f"{i:02d}_lowpoly_fish_sprite.png"
        result.save(out_path)
        saved.append(out_path)
        print("saved:", out_path)

    return saved


def make_8_directions(selected_path):
    out_dir = OUT_DIR / "8_directions"
    out_dir.mkdir(exist_ok=True)

    img = Image.open(selected_path).convert("RGBA")

    directions = {
        "E_right": 0,
        "NE_up_right": 45,
        "N_up": 90,
        "NW_up_left": 135,
        "W_left": 180,
        "SW_down_left": 225,
        "S_down": 270,
        "SE_down_right": 315,
    }

    for name, angle in directions.items():
        rotated = img.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )

        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        rotated.thumbnail((900, 900), Image.LANCZOS)

        x = (SIZE - rotated.width) // 2
        y = (SIZE - rotated.height) // 2
        canvas.paste(rotated, (x, y), rotated)

        out_path = out_dir / f"{name}.png"
        canvas.save(out_path)
        print("saved direction:", out_path)


def main():
    print("device:", DEVICE)

    init_image, control_image = prepare_input()
    pipe = load_pipeline()

    saved = generate_candidates(pipe, init_image, control_image)

    if SELECTED_CANDIDATE is not None:
        idx = SELECTED_CANDIDATE - 1
        make_8_directions(saved[idx])

    print("done.")
    print("output:", OUT_DIR)


if __name__ == "__main__":
    main()