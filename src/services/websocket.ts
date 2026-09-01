import { SensorData } from "../types/sensor";

const WS_URL = "ws://192.168.31.150";

export class SensorWebSocket {
  private socket: WebSocket | null = null;

  connect(
    onData: (data: SensorData) => void,
    onError?: (error: Event) => void
  ) {
    this.socket = new WebSocket(WS_URL);

    this.socket.onopen = () => {
      console.log("WebSocket 연결 성공");
    };

    this.socket.onmessage = (event) => {
      try {
        const data: SensorData = JSON.parse(event.data);

        console.log("센서 데이터 수신:", data);

        onData(data);
      } catch (error) {
        console.error("JSON 파싱 오류:", error);
      }
    };

    this.socket.onerror = (error) => {
      console.error("WebSocket 오류:", error);

      if (onError) {
        onError(error);
      }
    };

    this.socket.onclose = () => {
      console.log("WebSocket 연결 종료");
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}