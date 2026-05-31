// server.cjs (수정된 핵심 부분)
let connectedClients = [];

wss.on('connection', (ws) => {
  connectedClients.push(ws);
  ws.on('close', () => connectedClients = connectedClients.filter(client => client !== ws));
});

// 파이썬에서 좌표 데이터를 받을 API
app.post('/api/update-fish', (req, res) => {
  const { x, y, color } = req.body;
  
  // 연결된 모든 브라우저 클라이언트에 데이터 전송
  const data = JSON.stringify({ x, y, color });
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
  
  res.status(200).send('좌표 전송 완료');
});