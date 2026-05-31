const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// 서버 객체 먼저 생성
const server = http.createServer(app);

// 웹소켓 서버 생성 (반드시 서버 객체 생성 후)
const wss = new WebSocket.Server({ server });

// 전역 변수 설정
let connectedClients = [];

// 웹소켓 연결 로직
wss.on('connection', (ws) => {
  connectedClients.push(ws);
  ws.on('close', () => connectedClients = connectedClients.filter(client => client !== ws));
});

// 기존 API들
app.use('/public', express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });

app.post('/api/upload-fish', upload.single('fishImage'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  const inputPath = path.resolve(req.file.path);
  const reactCandidatesDir = path.join(__dirname, 'public', 'fish_10_candidates');
  if (!fs.existsSync(reactCandidatesDir)) fs.mkdirSync(reactCandidatesDir, { recursive: true });
  exec(`python make_10_fish.py "${inputPath}" "${reactCandidatesDir}"`, (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: '생성 실패' });
    const files = fs.readdirSync(reactCandidatesDir).filter(f => f.endsWith('.png'));
    res.json({ success: true, candidates: files });
  });
});

app.post('/api/select-style', (req, res) => {
  const { selectedStyle } = req.body;
  const inputPath = path.join(__dirname, 'public', 'fish_10_candidates', selectedStyle);
  const outDir = path.join(__dirname, 'public', 'assets', 'fish');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  exec(`python make_8_direction.py "${inputPath}" "${outDir}"`, (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: '변환 실패' });
    res.json({ success: true });
  });
});

// 좌표 업데이트 API
app.post('/api/update-fish', (req, res) => {
  const { x, y, color } = req.body;
  const data = JSON.stringify({ x, y, color });
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
  res.status(200).send('좌표 전송 완료');
});

// 서버 실행
server.listen(5000, () => console.log('🚀 서버가 5000번 포트에서 가동 중입니다.'));