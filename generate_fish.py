from PIL import Image
import os

def generate_8_directions(input_path, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"[{input_path}] 이미지를 불러옵니다. (오른쪽을 바라보는 물고기 기준)")
    
    # 1. 동쪽 (원본 이미지 = 오른쪽을 봄)
    right_img = Image.open(input_path).convert("RGBA")
    right_img.save(os.path.join(output_dir, "fish_right.png"))

    # 2. 서쪽 (오른쪽을 좌우 반전 = 왼쪽을 봄)
    left_img = right_img.transpose(Image.FLIP_LEFT_RIGHT)
    left_img.save(os.path.join(output_dir, "fish_left.png"))

    # 3. 북동쪽 (오른쪽을 반시계방향 45도 회전)
    right_img.rotate(45, expand=True).save(os.path.join(output_dir, "fish_right_up.png"))

    # 4. 남동쪽 (오른쪽을 시계방향 45도 회전)
    right_img.rotate(-45, expand=True).save(os.path.join(output_dir, "fish_right_down.png"))

    # 5. 북서쪽 (왼쪽을 시계방향 45도 회전)
    left_img.rotate(-45, expand=True).save(os.path.join(output_dir, "fish_left_up.png"))

    # 6. 남서쪽 (왼쪽을 반시계방향 45도 회전)
    left_img.rotate(45, expand=True).save(os.path.join(output_dir, "fish_left_down.png"))

    # 7. 북쪽 (오른쪽을 반시계방향 90도 회전)
    right_img.rotate(90, expand=True).save(os.path.join(output_dir, "fish_up.png"))

    # 8. 남쪽 (오른쪽을 시계방향 90도 회전)
    right_img.rotate(-90, expand=True).save(os.path.join(output_dir, "fish_down.png"))

    print(f"🎉 8방향 이미지 방향 수정 완료! [{output_dir}] 폴더를 확인하세요.")

if __name__ == "__main__":
    INPUT_FILE = "base_fish.png" 
    OUTPUT_FOLDER = "public/fish_sprites" 
    
    if os.path.exists(INPUT_FILE):
        generate_8_directions(INPUT_FILE, OUTPUT_FOLDER)
    else:
        print(f"에러: {INPUT_FILE} 파일을 찾을 수 없습니다.")