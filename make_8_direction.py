import os
import sys
from PIL import Image

def make_8_directions(input_path, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # 1. 원본 이미지 불러오기
    try:
        base_img = Image.open(input_path).convert("RGBA")
    except Exception as e:
        print(f"이미지 로드 에러: {e}")
        return

    # 💡 [핵심] 원본이 '왼쪽'을 본다고 가정하고, '오른쪽'은 거울처럼 좌우 반전(FLIP)시켜서 만듭니다!
    img_left = base_img
    img_right = base_img.transpose(Image.FLIP_LEFT_RIGHT)

    # 💡 90도로 꺾지 않고, 25도~45도 내외로 머리만 살짝 들거나 숙이게 만듭니다.
    # PIL.Image.rotate는 반시계 방향이 양수입니다.
    directions = {
        'W_left.png':       (img_left, 0),
        'NW_up_left.png':   (img_left, -25), # 왼쪽 위로 갈 땐 머리를 25도 듦
        'SW_down_left.png': (img_left, 25),  # 왼쪽 아래로 갈 땐 머리를 25도 숙임
        'N_up.png':         (img_left, -45), # 수직 상승할 때도 45도까지만 듦
        'S_down.png':       (img_left, 45),  # 수직 하강할 때도 45도까지만 숙임
        
        'E_right.png':      (img_right, 0),
        'NE_up_right.png':  (img_right, 25), # 오른쪽 위
        'SE_down_right.png':(img_right, -25) # 오른쪽 아래
    }

    for filename, (img, angle) in directions.items():
        # expand=True 설정으로 이미지가 회전하면서 모서리가 잘리는 것을 완벽 방지
        rotated_img = img.rotate(angle, resample=Image.BICUBIC, expand=True)
        rotated_img.save(os.path.join(output_dir, filename))
        
    print("🎉 8방향 반전 및 미세 회전 에셋 생성 완료!")

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        make_8_directions(sys.argv[1], sys.argv[2])
    else:
        print("인자가 부족합니다.")