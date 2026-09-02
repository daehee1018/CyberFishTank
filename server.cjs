const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { exec } = require('child_process');
const Database = require('better-sqlite3');

const app = express();

app.use(cors());
app.use(express.json());


// ============================================================
// 센서 온도 보정 설정
//
// 현재 온도 센서가 실제 온도보다 약 4°C 높게 측정됨
//
// 예:
//   센서 원본 29°C
//        ↓
//   -4°C 보정
//        ↓
//   실제 저장값 25°C
//
// 이 값만 변경하면 보정값을 쉽게 조절할 수 있음.
// ============================================================

const TEMPERATURE_OFFSET = -4;


// ============================================================
// SQLite 데이터베이스
// ============================================================

const dbPath = path.join(__dirname, 'sensor.db');

const db = new Database(dbPath);

console.log('');
console.log('============================================');
console.log('🗄️ SQLite 데이터베이스 연결');
console.log('============================================');
console.log(`📁 DB 위치: ${dbPath}`);
console.log('============================================');


// ============================================================
// 센서 데이터 테이블
// ============================================================

db.prepare(`
  CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    timestamp TEXT NOT NULL,

    millis INTEGER,

    temperature REAL,

    ph REAL,

    ph_voltage REAL,

    tds REAL,

    tds_voltage REAL,

    turbidity_voltage REAL,

    turbidity_delta REAL,

    turbidity_warning TEXT,

    water_level_detected TEXT
  )
`).run();

console.log('✅ sensor_data 테이블 확인 완료');


// ============================================================
// HTTP 서버
// ============================================================

const server = http.createServer(app);


// ============================================================
// WebSocket 서버
//
// YOLO 데이터 전송용
// 센서 데이터에는 사용하지 않음
// ============================================================

const wss = new WebSocket.Server({
  server
});


// ============================================================
// 연결된 WebSocket 클라이언트
// ============================================================

let connectedClients = [];


// ============================================================
// WebSocket 연결
//
// YOLO 데이터를 웹페이지로 전달하기 위한 연결
// ============================================================

wss.on('connection', (ws) => {

  connectedClients.push(ws);

  console.log(
    `🔌 WebSocket 클라이언트 연결됨 (${connectedClients.length}명)`
  );


  ws.on('close', () => {

    connectedClients =
      connectedClients.filter(
        client => client !== ws
      );

  });


  ws.on('error', (error) => {

    console.error(
      'WebSocket 오류:',
      error.message
    );

  });

});


// ============================================================
// 기존 정적 파일
// ============================================================

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


// ============================================================
// 이미지 업로드
// ============================================================

const upload = multer({
  dest: 'uploads/'
});


app.post(
  '/api/upload-fish',
  upload.single('fishImage'),
  (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        error: '파일이 없습니다.'
      });

    }

    const inputPath =
      path.resolve(req.file.path);

    const reactCandidatesDir =
      path.join(
        __dirname,
        'public',
        'fish_10_candidates'
      );

    if (!fs.existsSync(reactCandidatesDir)) {

      fs.mkdirSync(
        reactCandidatesDir,
        {
          recursive: true
        }
      );

    }

    exec(
      `/usr/bin/python3 make_10_fish.py "${inputPath}" "${reactCandidatesDir}"`,
      (error, stdout, stderr) => {

        if (error) {

          console.error(stderr);

          return res.status(500).json({
            error: '생성 실패'
          });

        }

        console.log(stdout);

        return res.json({
          success: true,
          candidates:
            fs.readdirSync(
              reactCandidatesDir
            )
        });

      }
    );

  }
);


// ============================================================
// 물고기 스타일 선택
// ============================================================

app.post(
  '/api/select-style',
  (req, res) => {

    const {
      selectedStyle
    } = req.body;

    if (!selectedStyle) {

      return res.status(400).json({
        error: '선택된 스타일이 없습니다.'
      });

    }

    const inputPath =
      path.join(
        __dirname,
        'public',
        'fish_10_candidates',
        selectedStyle
      );

    const outDir =
      path.join(
        __dirname,
        'public',
        'fish_sprites'
      );

    if (!fs.existsSync(inputPath)) {

      return res.status(404).json({
        error:
          '선택한 물고기 이미지를 찾을 수 없습니다.'
      });

    }

    if (!fs.existsSync(outDir)) {

      fs.mkdirSync(
        outDir,
        {
          recursive: true
        }
      );

    }

    exec(
      `/usr/bin/python3 generate_fish.py "${inputPath}" "${outDir}"`,
      (error, stdout, stderr) => {

        if (error) {

          console.error(stderr);

          return res.status(500).json({
            error: '변환 실패'
          });

        }

        console.log(stdout);

        return res.json({
          success: true
        });

      }
    );

  }
);


// ============================================================
// 물고기 좌표 업데이트
//
// 기존 기능 유지
// ============================================================

app.post(
  '/api/update-fish',
  (req, res) => {

    const {
      x,
      y,
      color
    } = req.body;


    console.log('🐟 물고기 좌표 업데이트');

    console.log({
      x,
      y,
      color
    });


    res
      .status(200)
      .json({
        success: true,
        message: '좌표 수신 완료'
      });

  }
);


// ============================================================
// 센서 DB 저장 설정
//
// 센서:
//   3초마다 서버로 데이터 전송
//
// DB:
//   10분마다 1개 저장
//
// 첫 번째 센서 데이터:
//   즉시 저장
//
// 이후:
//   10분 동안 들어오는 데이터는 저장하지 않음
//   10분이 지나면 가장 최근 센서 데이터를 저장
// ============================================================

const SENSOR_SAVE_INTERVAL =
  10 * 60 * 1000;


// 마지막으로 DB에 저장한 시간

let lastSensorSaveTime = 0;


// 10분 동안 들어온 데이터 중
// 가장 최신 데이터를 임시 보관

let pendingSensorData = null;


// ============================================================
// 센서 데이터 INSERT SQL
// ============================================================

const insertSensorData =
  db.prepare(`
    INSERT INTO sensor_data (

      timestamp,

      millis,

      temperature,

      ph,

      ph_voltage,

      tds,

      tds_voltage,

      turbidity_voltage,

      turbidity_delta,

      turbidity_warning,

      water_level_detected

    )

    VALUES (

      @timestamp,

      @millis,

      @temperature,

      @ph,

      @ph_voltage,

      @tds,

      @tds_voltage,

      @turbidity_voltage,

      @turbidity_delta,

      @turbidity_warning,

      @water_level_detected

    )
  `);


// ============================================================
// 센서 데이터를 DB 형식으로 변환
// ============================================================

function normalizeSensorData(data) {

  // ----------------------------------------------------------
  // 원본 온도
  //
  // 센서가 temperature_c 또는 temperature 중
  // 하나를 보내는 구조를 모두 지원
  // ----------------------------------------------------------

  const rawTemperature =
    Number(
      data.temperature_c ??
      data.temperature ??
      0
    );


  // ----------------------------------------------------------
  // 온도 보정
  //
  // 현재 센서가 실제보다 약 4°C 높으므로
  // -4°C를 적용
  // ----------------------------------------------------------

  const correctedTemperature =
    rawTemperature +
    TEMPERATURE_OFFSET;


  // ----------------------------------------------------------
  // 센서 데이터 반환
  // ----------------------------------------------------------

  return {

    timestamp:
      data.timestamp ||
      new Date().toISOString(),

    millis:
      Number(
        data.millis || 0
      ),

    temperature:
      correctedTemperature,

    ph:
      Number(
        data.ph ?? 0
      ),

    ph_voltage:
      Number(
        data.ph_voltage ?? 0
      ),

    tds:
      Number(
        data.tds_ppm ??
        data.tds ??
        0
      ),

    tds_voltage:
      Number(
        data.tds_voltage ?? 0
      ),

    turbidity_voltage:
      Number(
        data.turbidity_voltage ??
        data.turbidity ??
        0
      ),

    turbidity_delta:
      Number(
        data.turbidity_delta ?? 0
      ),

    turbidity_warning:
      String(
        data.turbidity_warning ?? ''
      ),

    water_level_detected:
      String(
        data.water_level_detected ??
        data.water_level ??
        ''
      )

  };

}


// ============================================================
// 센서 데이터 DB 저장 함수
// ============================================================

function saveSensorData(data) {

  try {

    const result =
      insertSensorData.run(
        data
      );


    lastSensorSaveTime =
      Date.now();


    console.log('');

    console.log(
      '💾 센서 데이터 DB 저장'
    );

    console.log(
      `   ID: ${result.lastInsertRowid}`
    );

    console.log(
      `   수온: ${data.temperature}°C`
    );

    console.log(
      `   pH: ${data.ph}`
    );


    const count =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM sensor_data
      `).get();


    console.log(
      `   현재 DB 기록: ${count.count}개`
    );


    return result.lastInsertRowid;

  } catch (error) {

    console.error(
      '❌ 센서 데이터 DB 저장 오류:',
      error
    );

    return null;

  }

}


// ============================================================
// 센서 데이터 수신
//
// Python
//   ↓
// 3초마다 POST
//   ↓
// Node.js
//   ↓
// 온도 -4°C 보정
//   ↓
// 최신 데이터 임시 보관
//   ↓
// 10분마다 DB 저장
//
// 센서 데이터는 WebSocket으로 보내지 않음
// ============================================================

app.post(
  '/api/sensor-data',
  (req, res) => {

    try {

      const sensorData =
        normalizeSensorData(
          req.body
        );


      // --------------------------------------------------------
      // 서버에는 보정된 센서 데이터 표시
      // --------------------------------------------------------

      console.log('');

      console.log(
        '📡 센서 데이터 수신'
      );

      console.log(
        `   수온: ${sensorData.temperature}°C`
      );

      console.log(
        `   pH: ${sensorData.ph}`
      );


      // --------------------------------------------------------
      // 항상 가장 최근 데이터로 교체
      //
      // 3초마다 들어오는 데이터 중
      // 가장 최신 데이터만 유지
      // --------------------------------------------------------

      pendingSensorData =
        sensorData;


      // --------------------------------------------------------
      // DB 저장 여부 확인
      // --------------------------------------------------------

      const now =
        Date.now();


      const elapsed =
        now -
        lastSensorSaveTime;


      // --------------------------------------------------------
      // 첫 번째 데이터라면 즉시 저장
      // --------------------------------------------------------

      if (
        lastSensorSaveTime === 0
      ) {

        saveSensorData(
          pendingSensorData
        );

        pendingSensorData =
          null;

      }


      // --------------------------------------------------------
      // 마지막 저장 후 10분이 지났다면 저장
      // --------------------------------------------------------

      else if (
        elapsed >=
        SENSOR_SAVE_INTERVAL
      ) {

        if (
          pendingSensorData
        ) {

          saveSensorData(
            pendingSensorData
          );

          pendingSensorData =
            null;

        }

      }


      // --------------------------------------------------------
      // Python에 응답
      // --------------------------------------------------------

      res
        .status(200)
        .json({
          success: true
        });

    } catch (error) {

      console.error(
        '❌ 센서 데이터 처리 오류:',
        error
      );


      res
        .status(500)
        .json({
          success: false,
          error: error.message
        });

    }

  }
);


// ============================================================
// 센서 데이터 전체 조회
//
// React Records.tsx
//   ↓
// GET /api/sensor-data
//   ↓
// SQLite
// ============================================================

app.get(
  '/api/sensor-data',
  (req, res) => {

    try {

      const rows =
        db.prepare(`
          SELECT

            id,

            timestamp,

            millis,

            temperature,

            ph,

            ph_voltage,

            tds,

            tds_voltage,

            turbidity_voltage,

            turbidity_delta,

            turbidity_warning,

            water_level_detected

          FROM sensor_data

          ORDER BY timestamp ASC

        `).all();


      res.json({

        success: true,

        count: rows.length,

        data: rows

      });

    } catch (error) {

      console.error(
        '❌ 센서 데이터 조회 오류:',
        error
      );


      res
        .status(500)
        .json({

          success: false,

          error: error.message

        });

    }

  }
);


// ============================================================
// 최근 센서 데이터 조회
// ============================================================

app.get(
  '/api/sensor-data/latest',
  (req, res) => {

    try {

      const row =
        db.prepare(`
          SELECT

            id,

            timestamp,

            millis,

            temperature,

            ph,

            ph_voltage,

            tds,

            tds_voltage,

            turbidity_voltage,

            turbidity_delta,

            turbidity_warning,

            water_level_detected

          FROM sensor_data

          ORDER BY timestamp DESC

          LIMIT 1

        `).get();


      res.json({

        success: true,

        data:
          row || null

      });

    } catch (error) {

      console.error(
        '❌ 최신 센서 데이터 조회 오류:',
        error
      );


      res
        .status(500)
        .json({

          success: false,

          error: error.message

        });

    }

  }
);


// ============================================================
// 최근 N개 센서 데이터
//
// 예:
// /api/sensor-data/recent?limit=100
// ============================================================

app.get(
  '/api/sensor-data/recent',
  (req, res) => {

    try {

      let limit =
        Number(
          req.query.limit || 100
        );


      if (
        limit < 1
      ) {

        limit = 1;

      }


      if (
        limit > 10000
      ) {

        limit = 10000;

      }


      const rows =
        db.prepare(`
          SELECT

            id,

            timestamp,

            millis,

            temperature,

            ph,

            ph_voltage,

            tds,

            tds_voltage,

            turbidity_voltage,

            turbidity_delta,

            turbidity_warning,

            water_level_detected

          FROM sensor_data

          ORDER BY timestamp DESC

          LIMIT ?

        `).all(limit);


      rows.reverse();


      res.json({

        success: true,

        count: rows.length,

        data: rows

      });

    } catch (error) {

      console.error(
        '❌ 최근 센서 데이터 조회 오류:',
        error
      );


      res
        .status(500)
        .json({

          success: false,

          error: error.message

        });

    }

  }
);


// ============================================================
// 기간별 센서 데이터 조회
//
// 예:
//
// /api/sensor-data/range
// ?start=2026-09-01T00:00:00
// &end=2026-09-07T23:59:59
// ============================================================

app.get(
  '/api/sensor-data/range',
  (req, res) => {

    try {

      const {
        start,
        end
      } = req.query;


      if (
        !start ||
        !end
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              'start와 end 날짜가 필요합니다.'

          });

      }


      const rows =
        db.prepare(`
          SELECT

            id,

            timestamp,

            millis,

            temperature,

            ph,

            ph_voltage,

            tds,

            tds_voltage,

            turbidity_voltage,

            turbidity_delta,

            turbidity_warning,

            water_level_detected

          FROM sensor_data

          WHERE timestamp >= ?

          AND timestamp <= ?

          ORDER BY timestamp ASC

        `).all(
          start,
          end
        );


      res.json({

        success: true,

        count: rows.length,

        data: rows

      });

    } catch (error) {

      console.error(
        '❌ 기간별 센서 데이터 조회 오류:',
        error
      );


      res
        .status(500)
        .json({

          success: false,

          error: error.message

        });

    }

  }
);


// ============================================================
// 센서 데이터 개수 확인
// ============================================================

app.get(
  '/api/sensor-data/count',
  (req, res) => {

    try {

      const result =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM sensor_data
        `).get();


      res.json({

        success: true,

        count: result.count

      });

    } catch (error) {

      console.error(
        '❌ 센서 데이터 개수 조회 오류:',
        error
      );


      res
        .status(500)
        .json({

          success: false,

          error: error.message

        });

    }

  }
);


// ============================================================
// YOLO 데이터 수신
//
// ★ 기존 WebSocket 방식 그대로 유지 ★
//
// YOLO
//   ↓
// POST /posi
//   ↓
// Node.js
//   ↓
// WebSocket
//   ↓
// React Dashboard
//
// 센서 DB와는 완전히 별개
// ============================================================

app.post(
  '/posi',
  (req, res) => {

    const yoloData =
      req.body;


    const data =
      Array.isArray(yoloData)
        ? yoloData[0]
        : yoloData;


    const payload = {

      center_norm:
        Array.isArray(data?.center_norm)
          ? data.center_norm
          : [0.5, 0.5],

      move_direction:
        data?.move_direction ||
        'none',

      pose_direction:
        data?.pose_direction ||
        'none',

      head:
        Array.isArray(data?.keypoints?.head)
          ? data.keypoints.head
          : [0.5, 0.5],

      tail:
        Array.isArray(data?.keypoints?.tail)
          ? data.keypoints.tail
          : [0.5, 0.5],

      state:
        data?.state ||
        'tracked',

      abnormal:
        Boolean(data?.abnormal)

    };


    const message =
      JSON.stringify(
        payload
      );


    // --------------------------------------------------------
    // YOLO 데이터 WebSocket 전송
    //
    // 기존 방식 유지
    // --------------------------------------------------------

    wss.clients.forEach(
      (client) => {

        if (
          client.readyState ===
          WebSocket.OPEN
        ) {

          client.send(
            message
          );

        }

      }
    );


    res
      .status(200)
      .send('OK');

  }
);


// ============================================================
// 서버 종료 처리
// ============================================================

process.on(
  'SIGINT',
  () => {

    console.log('');

    console.log(
      '🛑 서버 종료'
    );


    db.close();


    server.close(
      () => {

        console.log(
          '🗄️ SQLite 연결 종료'
        );

        process.exit(0);

      }
    );

  }
);


// ============================================================
// 서버 실행
// ============================================================

server.listen(
  5000,
  '0.0.0.0',
  () => {

    console.log('');

    console.log(
      '============================================'
    );

    console.log(
      '🚀 CyberFishTank 서버 시작'
    );

    console.log(
      '============================================'
    );

    console.log(
      'HTTP       : 5000'
    );

    console.log(
      'Database   : SQLite'
    );

    console.log(
      'Sensor     : 3초 수신 / 10분 DB 저장'
    );

    console.log(
      'Temperature: -4°C 보정 적용'
    );

    console.log(
      'YOLO       : WebSocket'
    );
    
    console.log(
      '============================================'
    );

    console.log('');

  }
);