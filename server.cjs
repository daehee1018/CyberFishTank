const express = require('express');
const http = require('http'); // 💡 http 모듈 필수
const WebSocket = require('ws');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 💡 서버 생성
const server = http.createServer(app);
// 💡 wss 생성 (위에서 만든 server 사용)
const wss = new WebSocket.Server({ server });

let connectedClients = [];

wss.on('connection', (ws) => {
  connectedClients.push(ws);
  ws.on('close', () => connectedClients = connectedClients.filter(client => client !== ws));
});

// 파이썬에서 호출할 API
app.post('/api/update-fish', (req, res) => {
  const { x, y, color } = req.body;
  const data = JSON.stringify({ x, y, color });
  
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
  res.status(200).send('좌표 전송 완료');
});

// 💡 5000번 포트로 서버 실행 (중요: app.listen이 아니라 server.listen입니다)
server.listen(5000, () => console.log('🚀 서버가 5000번 포트에서 가동 중입니다.'));