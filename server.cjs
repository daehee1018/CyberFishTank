// server.cjs - 최종 통합 버전
const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const WebSocket = require('ws'); // 웹소켓 라이브러리 추가

const app = express();
app.use(cors()); 
app.use(express.json());

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/fish_10_candidates', express.static(path.join(__dirname, 'public', 'fish_10_candidates')));

const upload = multer({ dest: 'uploads/' });

// API 1: 이미지 업로드 -> make_10_fish.py 구동
app.post('/api/upload-fish', upload.single('fishImage'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

  const inputPath = path.resolve(req.file.path);
  const reactCandidatesDir = path.join(__dirname, 'public', 'fish_10_candidates');
  
  if (!fs.existsSync(reactCandidatesDir)) fs.mkdirSync(reactCandidatesDir, { recursive: true });

  console.log(`[AI 가동] make_10_fish.py 실행 중...`);
  
  exec(`python make_10_fish.py "${inputPath}" "${reactCandidatesDir}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('Python 에러 로그:', stderr);
      return res.status(500).json({ error: '물고기 10종 후보 생성 실패' });
    }

    const files = fs.readdirSync(reactCandidatesDir).filter(f => f.endsWith('.png'));
    res.json({ success: true, candidates: files });
  });
});

// API 2: 스타일 선택 -> make_8_direction.py 구동
app.post('/api/select-style', (req, res) => {
  const { selectedStyle } = req.body; 
  if (!selectedStyle) return res.status(400).json({ error: '선택된 스타일이 없습니다.' });

  const inputPath = path.join(__dirname, 'public', 'fish_10_candidates', selectedStyle);
  const outDir = path.join(__dirname, 'public', 'assets', 'fish');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`[스프라이트 가공] make_8_direction.py 실행 중...`);

  exec(`python make_8_direction.py "${inputPath}" "${outDir}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('Python 에러 로그:', stderr);
      return res.status(500).json({ error: '8방향 이미지 에셋 변환 실패' });
    }
    res.json({ success: true, message: '8방향 에셋 주입 완료' });
  });
});

// 5000번 포트에서 백엔드 대기
const server = app.listen(5000, () => console.log('🚀 백엔드 파이썬 서버가 5000번 포트에서 대기 중입니다.'));

// 8765번 포트에서 웹소켓 대기 (데이터 스트리밍)
const wss = new WebSocket.Server({ port: 8765 });

wss.on('connection', (ws) => {
  console.log('클라이언트와 웹소켓 연결 성공!');

  const interval = setInterval(() => {
    const data = { 
        x: Math.random() * 2 - 1, 
        y: Math.random() * 2 - 1, 
        color: "#FF5733" 
    };
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
  }, 50);

  ws.on('close', () => clearInterval(interval));
});