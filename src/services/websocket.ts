import type { SensorData } from "../types/sensor";


// ============================================================
// Node.js 서버 주소
// ============================================================

const WS_URL = "ws://192.168.31.150:5000";


// ============================================================
// Sensor WebSocket
// ============================================================

export class SensorWebSocket {

  private socket: WebSocket | null = null;


  connect(
    onData: (data: SensorData) => void,
    onError?: (error: Event) => void,
    onConnectionChange?: (connected: boolean) => void
  ) {

    // 이미 연결되어 있으면 새로 연결하지 않음
    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      return;
    }


    console.log(
      "WebSocket 연결 시도:",
      WS_URL
    );


    this.socket = new WebSocket(WS_URL);


    // --------------------------------------------------------
    // 연결 성공
    // --------------------------------------------------------

    this.socket.onopen = () => {

      console.log(
        "✅ WebSocket 연결 성공"
      );

      if (onConnectionChange) {
        onConnectionChange(true);
      }

    };


    // --------------------------------------------------------
    // 데이터 수신
    // --------------------------------------------------------

    this.socket.onmessage = (event) => {

      try {

        const data: SensorData =
          JSON.parse(event.data);


        console.log(
          "📡 센서 데이터 수신:",
          data
        );


        onData(data);

      } catch (error) {

        console.error(
          "❌ JSON 파싱 오류:",
          error
        );

      }

    };


    // --------------------------------------------------------
    // WebSocket 오류
    // --------------------------------------------------------

    this.socket.onerror = (error) => {

      console.error(
        "❌ WebSocket 오류:",
        error
      );


      if (onError) {
        onError(error);
      }

    };


    // --------------------------------------------------------
    // 연결 종료
    // --------------------------------------------------------

    this.socket.onclose = () => {

      console.log(
        "🔌 WebSocket 연결 종료"
      );


      if (onConnectionChange) {
        onConnectionChange(false);
      }

    };

  }


  // ==========================================================
  // 연결 종료
  // ==========================================================

  disconnect() {

    if (this.socket) {

      this.socket.close();

      this.socket = null;

    }

  }

}