import requests

# 좌표 계산 후...
target_x = 2.5  # 계산된 x값
target_y = -1.0 # 계산된 y값
target_color = "#FF5733"

# Node.js 서버의 API로 POST 요청 전송
try:
    requests.post("http://localhost:5000/api/update-fish", json={
        "x": target_x, 
        "y": target_y, 
        "color": target_color
    })
except Exception as e:
    print("전송 실패:", e)