from PIL import Image
import os
import sys


def generate_8_directions(input_path, output_dir):

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"[Fish Generator] 입력 이미지: {input_path}")

    right_img = Image.open(input_path).convert("RGBA")

    # ------------------------------------------------------------
    # 기존 이미지 크기를 유지하기 위해
    # 모든 이미지가 같은 크기를 갖도록 처리
    # ------------------------------------------------------------

    width, height = right_img.size

    # ------------------------------------------------------------
    # 오른쪽
    # ------------------------------------------------------------

    right_img.save(
        os.path.join(output_dir, "fish_right.png")
    )

    # ------------------------------------------------------------
    # 왼쪽
    # ------------------------------------------------------------

    left_img = right_img.transpose(
        Image.Transpose.FLIP_LEFT_RIGHT
    )

    left_img.save(
        os.path.join(output_dir, "fish_left.png")
    )

    # ------------------------------------------------------------
    # 오른쪽 위
    # ------------------------------------------------------------

    right_up = right_img.rotate(
        45,
        expand=False,
        resample=Image.Resampling.BICUBIC
    )

    right_up.save(
        os.path.join(output_dir, "fish_right_up.png")
    )

    # ------------------------------------------------------------
    # 오른쪽 아래
    # ------------------------------------------------------------

    right_down = right_img.rotate(
        -45,
        expand=False,
        resample=Image.Resampling.BICUBIC
    )

    right_down.save(
        os.path.join(output_dir, "fish_right_down.png")
    )

    # ------------------------------------------------------------
    # 왼쪽 위
    # ------------------------------------------------------------

    left_up = left_img.rotate(
        -45,
        expand=False,
        resample=Image.Resampling.BICUBIC
    )

    left_up.save(
        os.path.join(output_dir, "fish_left_up.png")
    )

    # ------------------------------------------------------------
    # 왼쪽 아래
    # ------------------------------------------------------------

    left_down = left_img.rotate(
        45,
        expand=False,
        resample=Image.Resampling.BICUBIC
    )

    left_down.save(
        os.path.join(output_dir, "fish_left_down.png")
    )

    # ------------------------------------------------------------
    # 위
    # ------------------------------------------------------------

    up = right_img.rotate(
        90,
        expand=False,
        resample=Image.Resampling.BICUBIC
    )

    up.save(
        os.path.join(output_dir, "fish_up.png")
    )

    # ------------------------------------------------------------
    # 아래
    # ------------------------------------------------------------

    down = right_img.rotate(
        -90,
        expand=False,
        resample=Image.Resampling.BICUBIC
    )

    down.save(
        os.path.join(output_dir, "fish_down.png")
    )

    print("[Fish Generator] 8방향 이미지 생성 완료")


if __name__ == "__main__":

    # ------------------------------------------------------------
    # Node.js에서 실행할 경우
    #
    # python generate_fish.py 입력이미지 출력폴더
    # ------------------------------------------------------------

    if len(sys.argv) >= 3:

        input_file = sys.argv[1]
        output_folder = sys.argv[2]

    else:

        # 직접 Python 실행할 때 기본값
        input_file = "base_fish.png"
        output_folder = "public/fish_sprites"


    if not os.path.exists(input_file):

        print(
            f"[Fish Generator] 에러: "
            f"{input_file} 파일을 찾을 수 없습니다."
        )

        sys.exit(1)


    generate_8_directions(
        input_file,
        output_folder
    )