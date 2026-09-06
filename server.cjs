const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { exec, execFile } = require('child_process');
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

// ======================================================
// 성장 데이터 자동 계산
//
// 매일 00:05에 전날 성장 데이터를 계산하여
// daily_growth 테이블에 저장
// ======================================================

function runDailyGrowthCalculation() {

  // 현재 시간
  const now = new Date();

  // 전날 날짜 생성
  const yesterday = new Date(now);

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  // YYYY-MM-DD 형식
  const year =
    yesterday.getFullYear();

  const month =
    String(
      yesterday.getMonth() + 1
    ).padStart(
      2,
      '0'
    );

  const day =
    String(
      yesterday.getDate()
    ).padStart(
      2,
      '0'
    );

  const targetDate =
    `${year}-${month}-${day}`;

  console.log('');
  console.log('============================================');
  console.log('🐟 자동 성장 데이터 계산 시작');
  console.log(`📅 대상 날짜: ${targetDate}`);
  console.log('============================================');

  // calculate_growth.cjs 경로
  const scriptPath =
    path.join(
      __dirname,
      'calculate_growth.cjs'
    );

  // calculate_growth.cjs 실행
  execFile(
    'node',
    [
      scriptPath,
      targetDate
    ],
    (
      error,
      stdout,
      stderr
    ) => {

      if (error) {

        console.error(
          '❌ 자동 성장 데이터 계산 실패:',
          error.message
        );

        return;

      }

      if (stderr) {

        console.error(
          '⚠️ 성장 계산 오류 메시지:',
          stderr
        );

      }

      console.log(
        stdout
      );

      console.log(
        '============================================'
      );

      console.log(
        '✅ 자동 성장 데이터 계산 완료'
      );

      console.log(
        '============================================'
      );

    }
  );

}

// ======================================================
// 활동량 데이터 자동 계산
//
// 매일 00:05에 전날 활동량 데이터를 계산하여
// daily_activity 테이블에 저장
// ======================================================

function runDailyActivityCalculation() {

  // 현재 시간
  const now =
    new Date();

  // 전날 날짜 생성
  const yesterday =
    new Date(
      now
    );

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  // YYYY-MM-DD 형식
  const year =
    yesterday.getFullYear();

  const month =
    String(
      yesterday.getMonth() + 1
    ).padStart(
      2,
      '0'
    );

  const day =
    String(
      yesterday.getDate()
    ).padStart(
      2,
      '0'
    );

  const targetDate =
    `${year}-${month}-${day}`;


  console.log('');

  console.log(
    '============================================'
  );

  console.log(
    '🏊 자동 활동량 데이터 계산 시작'
  );

  console.log(
    `📅 대상 날짜: ${targetDate}`
  );

  console.log(
    '============================================'
  );


  // calculate_activity.cjs 경로
  const scriptPath =
    path.join(
      __dirname,
      'calculate_activity.cjs'
    );


  // calculate_activity.cjs 실행
  execFile(
    'node',
    [
      scriptPath,
      targetDate
    ],
    (
      error,
      stdout,
      stderr
    ) => {

      if (
        error
      ) {

        console.error(
          '❌ 자동 활동량 데이터 계산 실패:',
          error.message
        );

        return;

      }


      if (
        stderr
      ) {

        console.error(
          '⚠️ 활동량 계산 오류 메시지:',
          stderr
        );

      }


      console.log(
        stdout
      );


      console.log(
        '============================================'
      );

      console.log(
        '✅ 자동 활동량 데이터 계산 완료'
      );

      console.log(
        '============================================'
      );

    }
  );

}


// ======================================================
// 매일 00:05 자동 실행 스케줄러
// ======================================================

function scheduleDailyGrowthCalculation() {

  const now =
    new Date();

  const nextRun =
    new Date();

  // 오늘 또는 다음날 00:05 설정
  nextRun.setHours(
    0,
    5,
    0,
    0
  );

  // 현재 시간이 이미
  // 오늘 00:05를 지났다면
  // 다음날 00:05로 이동
  if (
    nextRun <= now
  ) {

    nextRun.setDate(
      nextRun.getDate() + 1
    );

  }

  const delay =
    nextRun.getTime() -
    now.getTime();

  console.log(
    `⏰ 다음 성장 데이터 자동 계산 시간: ${nextRun.toLocaleString()}`
  );

  // 다음 00:05까지 한 번 대기
  setTimeout(
  () => {

    // ================================================
    // 전날 성장 데이터 계산
    // ================================================

    runDailyGrowthCalculation();


    // ================================================
    // 전날 활동량 데이터 계산
    // ================================================

    runDailyActivityCalculation();


    // ================================================
    // 이후 매일 24시간마다 실행
    // ================================================

    setInterval(
      () => {

        // 성장 데이터 계산
        runDailyGrowthCalculation();

        // 활동량 데이터 계산
        runDailyActivityCalculation();

      },
      24 * 60 * 60 * 1000
    );

  },
  delay
);

}

// ============================================================
// YOLO SQLite 데이터베이스
// ============================================================

const yoloDbPath =
  path.join(
    __dirname,
    'yolo.db'
  );


const yoloDb =
  new Database(
    yoloDbPath
  );


console.log('');
console.log('============================================');
console.log('🐟 YOLO SQLite 데이터베이스 연결');
console.log('============================================');
console.log(`📁 DB 위치: ${yoloDbPath}`);
console.log('============================================');

// ============================================================
// 성장 측정 / 분석 설정
// ============================================================

// ------------------------------------------------------------
// 최소 Event Sample 개수
//
// 기본적으로 Event 내부에 Sample이 3개 이상 있어야 사용
// ------------------------------------------------------------

const MIN_EVENT_SAMPLE_COUNT = 3;


// ------------------------------------------------------------
// Sample MAD 이상치 제거 기준
//
// robust_z > 3.5 제거
// ------------------------------------------------------------

const SAMPLE_ROBUST_Z_THRESHOLD = 3.5;


// ------------------------------------------------------------
// Event 안정성 기준
//
// Relative MAD = MAD / Median
//
// 4% 이하만 안정적인 Event로 판단
// ------------------------------------------------------------

const EVENT_RELATIVE_MAD_THRESHOLD = 0.04;


// ------------------------------------------------------------
// Event 간 MAD 이상치 제거 기준
// ------------------------------------------------------------

const EVENT_ROBUST_Z_THRESHOLD = 3.5;


// ------------------------------------------------------------
// Geometry QC
//
// 현재 임시 고정 기준
// ------------------------------------------------------------

const GEOMETRY_BBOX_W_MIN = 167.3;

const GEOMETRY_BBOX_W_MAX = 190.5;


const GEOMETRY_LENGTH_RATIO_MIN = 0.543;

const GEOMETRY_LENGTH_RATIO_MAX = 0.609;


// ------------------------------------------------------------
// Pixel → mm 변환
//
// 현재:
// 170 px ≈ 60 mm
//
// 추후 정확한 Calibration 값으로 변경 가능
// ------------------------------------------------------------

const PIXEL_TO_MM = 60 / 170;


// ------------------------------------------------------------
// 모델 버전
// ------------------------------------------------------------

const GROWTH_MODEL_VERSION = 'growth-v1';


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
// YOLO 데이터 테이블
// ============================================================

yoloDb.prepare(`
  CREATE TABLE IF NOT EXISTS yolo_data (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    timestamp TEXT NOT NULL,

    center_x REAL,

    center_y REAL,

    move_direction TEXT,

    pose_direction TEXT,

    head_x REAL,

    head_y REAL,

    tail_x REAL,

    tail_y REAL,

    state TEXT,

    abnormal INTEGER

  )
`).run();

console.log('✅ yolo_data 테이블 확인 완료');

// ============================================================
// 성장 Raw Sample 테이블
//
// /posi로 들어오는 growth_sample 원본 저장
//
// 절대 여기서 필터링하지 않음
// 받은 데이터를 최대한 그대로 저장
// ============================================================

yoloDb.prepare(`
  CREATE TABLE IF NOT EXISTS growth_samples (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    received_at TEXT NOT NULL,

    sample_datetime TEXT,

    date TEXT NOT NULL,

    event_id INTEGER,

    body_length_px REAL,

    bbox_w REAL,

    bbox_h REAL,

    head_x REAL,

    head_y REAL,

    tail_x REAL,

    tail_y REAL,

    pose_conf REAL,

    side_tilt_deg REAL,

    raw_json TEXT

  )
`).run();

console.log('✅ growth_samples 테이블 확인 완료');


// ============================================================
// 일일 성장 Summary 테이블
//
// 하루 최종 대표 성장값 저장
// ============================================================

yoloDb.prepare(`
  CREATE TABLE IF NOT EXISTS daily_growth (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    date TEXT NOT NULL UNIQUE,

    daily_length_px REAL,

    daily_length_mm REAL,

    event_mad_px REAL,

    event_mad_mm REAL,

    raw_sample_count INTEGER,

    raw_event_count INTEGER,

    stable_event_count INTEGER,

    geometry_pass_event_count INTEGER,

    used_event_count INTEGER,

    rejected_sample_outliers INTEGER,

    rejected_unstable_events INTEGER,

    rejected_geometry_events INTEGER,

    rejected_daily_outliers INTEGER,

    quality_flag TEXT,

    model_version TEXT,

    calculated_at TEXT NOT NULL

  )
`).run();

console.log('✅ daily_growth 테이블 확인 완료');


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

    // ========================================================
    // ComfyUI용 Python 환경
    //
    // 기존 /usr/bin/python3 대신
    // CyberFishTank/ai_env/bin/python 사용
    // ========================================================

    const pythonPath =
      path.join(
        __dirname,
        'ai_env',
        'bin',
        'python'
      );


    const scriptPath =
      path.join(
        __dirname,
        'make_10_fish.py'
      );


    console.log('');
    console.log('============================================');
    console.log('🐟 물고기 후보 10종 생성 시작');
    console.log('============================================');
    console.log(`📁 입력 이미지: ${inputPath}`);
    console.log(`📁 후보 저장: ${reactCandidatesDir}`);
    console.log(`🐍 Python: ${pythonPath}`);
    console.log(`📜 Script: ${scriptPath}`);
    console.log('🤖 ComfyUI: http://127.0.0.1:8188');
    console.log('============================================');


    // ========================================================
    // ComfyUI 기반 물고기 10종 생성
    //
    // ComfyUI가 실행 중이어야 함
    // ========================================================

    exec(
      `"${pythonPath}" "${scriptPath}" "${inputPath}" "${reactCandidatesDir}"`,
      {
        maxBuffer: 1024 * 1024 * 10
      },
      (error, stdout, stderr) => {

        // ----------------------------------------------------
        // Python 출력
        // ----------------------------------------------------

        if (stdout) {

          console.log(stdout);

        }


        // ----------------------------------------------------
        // 오류 출력
        // ----------------------------------------------------

        if (stderr) {

          console.error(stderr);

        }


        // ----------------------------------------------------
        // 생성 실패
        // ----------------------------------------------------

        if (error) {

          console.error('');
          console.error('============================================');
          console.error('❌ 물고기 후보 생성 실패');
          console.error('============================================');
          console.error(error.message);
          console.error('============================================');

          return res.status(500).json({
            success: false,
            error: '생성 실패'
          });

        }


        // ----------------------------------------------------
        // 생성된 후보 이미지 확인
        // ----------------------------------------------------

        let candidates = [];

        try {

          candidates =
            fs
              .readdirSync(
                reactCandidatesDir
              )
              .filter(
                filename =>
                  filename
                    .toLowerCase()
                    .endsWith('.png')
              )
              .sort();

        } catch (readError) {

          console.error(
            '❌ 후보 이미지 확인 실패:',
            readError
          );

          return res.status(500).json({
            success: false,
            error: '후보 이미지 확인 실패'
          });

        }


        // ----------------------------------------------------
        // 결과 출력
        // ----------------------------------------------------

        console.log('');
        console.log('============================================');
        console.log('🐟 물고기 후보 10종 생성 완료');
        console.log(`📊 생성된 후보: ${candidates.length}개`);
        console.log('============================================');

        candidates.forEach(
          candidate => {

            console.log(
              `  ✓ ${candidate}`
            );

          }
        );

        console.log('============================================');
        console.log('');


        // ----------------------------------------------------
        // React에 후보 목록 전달
        // ----------------------------------------------------

        return res.json({

          success: true,

          candidates:
            candidates

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
// YOLO 데이터 INSERT SQL
// ============================================================

const insertYoloData =
  yoloDb.prepare(`
    INSERT INTO yolo_data (

      timestamp,

      center_x,

      center_y,

      move_direction,

      pose_direction,

      head_x,

      head_y,

      tail_x,

      tail_y,

      state,

      abnormal

    )

    VALUES (

      @timestamp,

      @center_x,

      @center_y,

      @move_direction,

      @pose_direction,

      @head_x,

      @head_y,

      @tail_x,

      @tail_y,

      @state,

      @abnormal

    )
  `);

  // ============================================================
  // 성장 Raw Sample INSERT SQL
  // ============================================================

  const insertGrowthSample =
    yoloDb.prepare(`
      INSERT INTO growth_samples (

        received_at,

        sample_datetime,

        date,

        event_id,

        body_length_px,

        bbox_w,

        bbox_h,

        head_x,

        head_y,

        tail_x,

        tail_y,

        pose_conf,

        side_tilt_deg,

        raw_json

      )

      VALUES (

        @received_at,

        @sample_datetime,

        @date,

        @event_id,

        @body_length_px,

        @bbox_w,

        @bbox_h,

        @head_x,

        @head_y,

        @tail_x,

        @tail_y,

        @pose_conf,

        @side_tilt_deg,

        @raw_json

      )
    `);


  // ============================================================
  // 중앙값 계산
  // ============================================================

  function calculateMedian(values) {

    if (
      !values ||
      values.length === 0
    ) {

      return null;

    }


    const sorted =
      [...values]
        .filter(
          value =>
            Number.isFinite(value)
        )
        .sort(
          (a, b) =>
            a - b
        );


    if (
      sorted.length === 0
    ) {

      return null;

    }


    const middle =
      Math.floor(
        sorted.length / 2
      );


    if (
      sorted.length % 2 === 0
    ) {

      return (
        sorted[middle - 1] +
        sorted[middle]
      ) / 2;

    }


    return sorted[middle];

  }


  // ============================================================
  // MAD 계산
  //
  // MAD = median(|x - median(x)|)
  // ============================================================

  function calculateMAD(values, medianValue) {

    if (
      !values ||
      values.length === 0 ||
      medianValue === null
    ) {

      return null;

    }


    const deviations =
      values.map(
        value =>
          Math.abs(
            value -
            medianValue
          )
      );


    return calculateMedian(
      deviations
    );

  }


  // ============================================================
  // MAD 기반 이상치 제거
  //
  // robust_z =
  // 0.6745 × |x - median| / MAD
  //
  // robust_z > threshold 제거
  //
  // MAD가 0이면 이상치 제거하지 않음
  // ============================================================

  function removeMADOutliers(
    items,
    valueSelector,
    threshold
  ) {

    if (
      !items ||
      items.length === 0
    ) {

      return {

        kept: [],

        rejected: [],

        median: null,

        mad: null

      };

    }


    const values =
      items
        .map(
          valueSelector
        )
        .filter(
          value =>
            Number.isFinite(value)
        );


    const median =
      calculateMedian(
        values
      );


    const mad =
      calculateMAD(
        values,
        median
      );


    // ----------------------------------------------------------
    // MAD가 0이면
    //
    // 모든 값이 거의 동일하다고 판단
    //
    // 그대로 유지
    // ----------------------------------------------------------

    if (
      mad === null ||
      mad === 0
    ) {

      return {

        kept:
          [...items],

        rejected:
          [],

        median,

        mad

      };

    }


    const kept = [];

    const rejected = [];


    items.forEach(
      item => {

        const value =
          valueSelector(
            item
          );


        if (
          !Number.isFinite(value)
        ) {

          rejected.push(
            item
          );

          return;

        }


        const robustZ =
          (
            0.6745 *
            Math.abs(
              value -
              median
            )
          ) /
          mad;


        if (
          robustZ >
          threshold
        ) {

          rejected.push(
            item
          );

        } else {

          kept.push(
            item
          );

        }

      }
    );


    return {

      kept,

      rejected,

      median,

      mad

    };

  }


  // ============================================================
  // 날짜 문자열 생성
  //
  // sample_datetime 우선
  //
  // 없으면 서버 수신 시간 사용
  // ============================================================

  function getGrowthDate(
    sampleDatetime
  ) {

    const date =
      sampleDatetime
        ? new Date(
            sampleDatetime
          )
        : new Date();


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      const now =
        new Date();


      return now
        .toISOString()
        .slice(
          0,
          10
        );

    }


    return date
      .toISOString()
      .slice(
        0,
        10
      );

  }


  // ============================================================
  // 성장 Sample 저장 함수
  //
  // growth_sample이 있을 때만 호출
  //
  // 받은 Raw 데이터를 그대로 SQLite에 저장
  // ============================================================

  function saveGrowthSample(
    growthSample
  ) {

    try {

      if (
        !growthSample ||
        typeof growthSample !==
          'object'
      ) {

        return null;

      }


      const sampleDatetime =
        growthSample.datetime ||
        growthSample.timestamp ||
        new Date().toISOString();


      const date =
        getGrowthDate(
          sampleDatetime
        );


      const result =
        insertGrowthSample.run({

          received_at:
            new Date()
              .toISOString(),

          sample_datetime:
            sampleDatetime,

          date,

          event_id:
            Number(
              growthSample.event_id ??
              0
            ),

          body_length_px:
            Number(
              growthSample.body_length_px ??
              growthSample.length_px ??
              0
            ),

          bbox_w:
            Number(
              growthSample.bbox_w ??
              0
            ),

          bbox_h:
            Number(
              growthSample.bbox_h ??
              0
            ),

          head_x:
            Number(
              growthSample.head_x ??
              0
            ),

          head_y:
            Number(
              growthSample.head_y ??
              0
            ),

          tail_x:
            Number(
              growthSample.tail_x ??
              0
            ),

          tail_y:
            Number(
              growthSample.tail_y ??
              0
            ),

          pose_conf:
            Number(
              growthSample.pose_conf ??
              growthSample.confidence ??
              0
            ),

          side_tilt_deg:
            Number(
              growthSample.side_tilt_deg ??
              0
            ),

          raw_json:
            JSON.stringify(
              growthSample
            )

        });


      return result.lastInsertRowid;

    } catch (error) {

      console.error(
        '❌ 성장 Sample 저장 오류:',
        error
      );


      return null;

    }

  }


// ============================================================
// 특정 날짜 성장 분석
//
// 전체 흐름:
//
// Raw Sample
//      ↓
// Event별 그룹화
//      ↓
// Event Sample >= 3
//      ↓
// Sample MAD
//      ↓
// Event Relative MAD
//      ↓
// Geometry QC
//      ↓
// Event 간 MAD
//      ↓
// Daily Median
// ============================================================

function calculateDailyGrowth(
  targetDate
) {

  // ----------------------------------------------------------
  // 해당 날짜 Raw Sample 조회
  // ----------------------------------------------------------

  const rawSamples =
    yoloDb.prepare(`
      SELECT
        *
      FROM
        growth_samples
      WHERE
        date = ?
      ORDER BY
        sample_datetime ASC
    `).all(
      targetDate
    );


  const rawSampleCount =
    rawSamples.length;


  // ----------------------------------------------------------
  // 데이터가 없는 경우
  // ----------------------------------------------------------

  if (
    rawSampleCount === 0
  ) {

    return {

      success: false,

      reason:
        '해당 날짜에 성장 Sample이 없습니다.',

      date:
        targetDate

    };

  }


  // ----------------------------------------------------------
  // event_id별 그룹화
  // ----------------------------------------------------------

  const eventMap =
    new Map();


  rawSamples.forEach(
    sample => {

      const eventId =
        sample.event_id;


      if (
        !eventMap.has(
          eventId
        )
      ) {

        eventMap.set(
          eventId,
          []
        );

      }


      eventMap
        .get(
          eventId
        )
        .push(
          sample
        );

    }
  );


  const rawEventCount =
    eventMap.size;


  let rejectedSampleOutliers = 0;

  let rejectedUnstableEvents = 0;

  let rejectedGeometryEvents = 0;

  let rejectedDailyOutliers = 0;


  // ----------------------------------------------------------
  // Event별 분석
  // ----------------------------------------------------------

  const eventResults = [];


  eventMap.forEach(
    (
      samples,
      eventId
    ) => {

      // ------------------------------------------------------
      // body_length_px 유효값만 사용
      // ------------------------------------------------------

      const validSamples =
        samples.filter(
          sample =>
            Number.isFinite(
              Number(
                sample.body_length_px
              )
            ) &&
            Number(
              sample.body_length_px
            ) > 0
        );


      // ------------------------------------------------------
      // Sample 3개 미만이면 제외
      // ------------------------------------------------------

      if (
        validSamples.length <
        MIN_EVENT_SAMPLE_COUNT
      ) {

        rejectedUnstableEvents++;

        return;

      }


      let filteredSamples =
        validSamples;


      // ------------------------------------------------------
      // Sample이 5개 이상이면
      //
      // MAD 이상치 제거
      // ------------------------------------------------------

      if (
        validSamples.length >= 5
      ) {

        const result =
          removeMADOutliers(
            validSamples,
            sample =>
              Number(
                sample.body_length_px
              ),
            SAMPLE_ROBUST_Z_THRESHOLD
          );


        filteredSamples =
          result.kept;


        rejectedSampleOutliers +=
          result.rejected.length;

      }


      // ------------------------------------------------------
      // 이상치 제거 후 Sample이 3개 미만이면 제외
      // ------------------------------------------------------

      if (
        filteredSamples.length <
        MIN_EVENT_SAMPLE_COUNT
      ) {

        rejectedUnstableEvents++;

        return;

      }


      // ------------------------------------------------------
      // Event Length 값
      // ------------------------------------------------------

      const lengths =
        filteredSamples.map(
          sample =>
            Number(
              sample.body_length_px
            )
        );


      const eventMedian =
        calculateMedian(
          lengths
        );


      const eventMAD =
        calculateMAD(
          lengths,
          eventMedian
        );


      const relativeMAD =
        eventMedian > 0
          ? eventMAD /
            eventMedian
          : Infinity;


      // ------------------------------------------------------
      // Relative MAD 검사
      //
      // 4% 초과 제거
      // ------------------------------------------------------

      if (
        relativeMAD >
        EVENT_RELATIVE_MAD_THRESHOLD
      ) {

        rejectedUnstableEvents++;

        return;

      }


      // ------------------------------------------------------
      // Geometry 대표값 계산
      // ------------------------------------------------------

      const bboxWidths =
        filteredSamples
          .map(
            sample =>
              Number(
                sample.bbox_w
              )
          )
          .filter(
            value =>
              Number.isFinite(
                value
              ) &&
              value > 0
          );


      const representativeBBoxW =
        calculateMedian(
          bboxWidths
        );


      // ------------------------------------------------------
      // body_length_px / bbox_w
      //
      // Sample별 비율 계산 후 중앙값 사용
      // ------------------------------------------------------

      const lengthRatios =
        filteredSamples
          .map(
            sample => {

              const length =
                Number(
                  sample.body_length_px
                );


              const bboxW =
                Number(
                  sample.bbox_w
                );


              if (
                !Number.isFinite(
                  length
                ) ||
                !Number.isFinite(
                  bboxW
                ) ||
                bboxW <= 0
              ) {

                return null;

              }


              return (
                length /
                bboxW
              );

            }
          )
          .filter(
            value =>
              Number.isFinite(
                value
              )
          );


      const representativeRatio =
        calculateMedian(
          lengthRatios
        );


      // ------------------------------------------------------
      // Geometry QC
      //
      // bbox_w:
      // 167.3 ~ 190.5
      //
      // body_length_px / bbox_w:
      // 0.543 ~ 0.609
      // ------------------------------------------------------

      const bboxPass =
        representativeBBoxW !==
          null &&
        representativeBBoxW >=
          GEOMETRY_BBOX_W_MIN &&
        representativeBBoxW <=
          GEOMETRY_BBOX_W_MAX;


      const ratioPass =
        representativeRatio !==
          null &&
        representativeRatio >=
          GEOMETRY_LENGTH_RATIO_MIN &&
        representativeRatio <=
          GEOMETRY_LENGTH_RATIO_MAX;


      if (
        !bboxPass ||
        !ratioPass
      ) {

        rejectedGeometryEvents++;

        return;

      }


      // ------------------------------------------------------
      // 최종 Stable + Geometry 통과 Event 저장
      // ------------------------------------------------------

      eventResults.push({

        event_id:
          eventId,

        sample_count:
          filteredSamples.length,

        event_median_px:
          eventMedian,

        event_mad_px:
          eventMAD,

        relative_mad:
          relativeMAD,

        bbox_w:
          representativeBBoxW,

        length_ratio:
          representativeRatio

      });

    }
  );


  // ----------------------------------------------------------
  // Geometry 통과 Event 개수
  // ----------------------------------------------------------

  const geometryPassEventCount =
    eventResults.length;


  // ----------------------------------------------------------
  // stable_event_count
  //
  // Geometry 이전의 안정 Event 수를 별도로 계산
  //
  // 현재 계산 구조에서는
  // 통과 Event + Geometry 탈락 Event
  // ----------------------------------------------------------

  const stableEventCount =
    geometryPassEventCount +
    rejectedGeometryEvents;


  // ----------------------------------------------------------
  // Daily Event MAD 검사
  //
  // Event가 5개 이상일 때만 수행
  // ----------------------------------------------------------

  let finalEvents =
    [...eventResults];


  if (
    eventResults.length >= 5
  ) {

    const result =
      removeMADOutliers(
        eventResults,
        event =>
          event.event_median_px,
        EVENT_ROBUST_Z_THRESHOLD
      );


    finalEvents =
      result.kept;


    rejectedDailyOutliers =
      result.rejected.length;

  }


  // ----------------------------------------------------------
  // 최종 사용 Event
  // ----------------------------------------------------------

  const usedEventCount =
    finalEvents.length;


  // ----------------------------------------------------------
  // 최종 Event가 없는 경우
  // ----------------------------------------------------------

  if (
    usedEventCount === 0
  ) {

    const summary = {

      success:
        false,

      date:
        targetDate,

      daily_length_px:
        null,

      daily_length_mm:
        null,

      event_mad_px:
        null,

      event_mad_mm:
        null,

      raw_sample_count:
        rawSampleCount,

      raw_event_count:
        rawEventCount,

      stable_event_count:
        stableEventCount,

      geometry_pass_event_count:
        geometryPassEventCount,

      used_event_count:
        0,

      rejected_sample_outliers:
        rejectedSampleOutliers,

      rejected_unstable_events:
        rejectedUnstableEvents,

      rejected_geometry_events:
        rejectedGeometryEvents,

      rejected_daily_outliers:
        rejectedDailyOutliers,

      quality_flag:
        'NO_VALID_DATA',

      model_version:
        GROWTH_MODEL_VERSION

    };


    saveDailyGrowthSummary(
      summary
    );


    return summary;

  }


  // ----------------------------------------------------------
  // 최종 Event Median 목록
  // ----------------------------------------------------------

  const finalEventMedians =
    finalEvents.map(
      event =>
        event.event_median_px
    );


  // ----------------------------------------------------------
  // Daily Median
  // ----------------------------------------------------------

  const dailyLengthPx =
    calculateMedian(
      finalEventMedians
    );


  // ----------------------------------------------------------
  // Event Median들의 MAD
  //
  // 일일 측정값 변동성 확인용
  // ----------------------------------------------------------

  const dailyEventMAD =
    calculateMAD(
      finalEventMedians,
      dailyLengthPx
    );


  // ----------------------------------------------------------
  // mm 변환
  // ----------------------------------------------------------

  const dailyLengthMm =
    dailyLengthPx *
    PIXEL_TO_MM;


  const eventMadMm =
    dailyEventMAD *
    PIXEL_TO_MM;


  // ----------------------------------------------------------
  // Quality Flag
  // ----------------------------------------------------------

  let qualityFlag =
    'HIGH';


  if (
    usedEventCount < 3
  ) {

    qualityFlag =
      'LOW';

  } else if (
    usedEventCount < 5
  ) {

    qualityFlag =
      'MEDIUM';

  }


  // ----------------------------------------------------------
  // 최종 Summary
  // ----------------------------------------------------------

  const summary = {

    success:
      true,

    date:
      targetDate,

    daily_length_px:
      dailyLengthPx,

    daily_length_mm:
      dailyLengthMm,

    event_mad_px:
      dailyEventMAD,

    event_mad_mm:
      eventMadMm,

    raw_sample_count:
      rawSampleCount,

    raw_event_count:
      rawEventCount,

    stable_event_count:
      stableEventCount,

    geometry_pass_event_count:
      geometryPassEventCount,

    used_event_count:
      usedEventCount,

    rejected_sample_outliers:
      rejectedSampleOutliers,

    rejected_unstable_events:
      rejectedUnstableEvents,

    rejected_geometry_events:
      rejectedGeometryEvents,

    rejected_daily_outliers:
      rejectedDailyOutliers,

    quality_flag:
      qualityFlag,

    model_version:
      GROWTH_MODEL_VERSION

  };


  // ----------------------------------------------------------
  // Daily Summary 저장
  // ----------------------------------------------------------

  saveDailyGrowthSummary(
    summary
  );


  return summary;

}


// ============================================================
// Daily Growth Summary 저장
//
// 같은 날짜가 이미 존재하면 UPDATE
// ============================================================

function saveDailyGrowthSummary(
  summary
) {

  try {

    yoloDb.prepare(`
      INSERT INTO daily_growth (

        date,

        daily_length_px,

        daily_length_mm,

        event_mad_px,

        event_mad_mm,

        raw_sample_count,

        raw_event_count,

        stable_event_count,

        geometry_pass_event_count,

        used_event_count,

        rejected_sample_outliers,

        rejected_unstable_events,

        rejected_geometry_events,

        rejected_daily_outliers,

        quality_flag,

        model_version,

        calculated_at

      )

      VALUES (

        @date,

        @daily_length_px,

        @daily_length_mm,

        @event_mad_px,

        @event_mad_mm,

        @raw_sample_count,

        @raw_event_count,

        @stable_event_count,

        @geometry_pass_event_count,

        @used_event_count,

        @rejected_sample_outliers,

        @rejected_unstable_events,

        @rejected_geometry_events,

        @rejected_daily_outliers,

        @quality_flag,

        @model_version,

        @calculated_at

      )

      ON CONFLICT(date)

      DO UPDATE SET

        daily_length_px =
          excluded.daily_length_px,

        daily_length_mm =
          excluded.daily_length_mm,

        event_mad_px =
          excluded.event_mad_px,

        event_mad_mm =
          excluded.event_mad_mm,

        raw_sample_count =
          excluded.raw_sample_count,

        raw_event_count =
          excluded.raw_event_count,

        stable_event_count =
          excluded.stable_event_count,

        geometry_pass_event_count =
          excluded.geometry_pass_event_count,

        used_event_count =
          excluded.used_event_count,

        rejected_sample_outliers =
          excluded.rejected_sample_outliers,

        rejected_unstable_events =
          excluded.rejected_unstable_events,

        rejected_geometry_events =
          excluded.rejected_geometry_events,

        rejected_daily_outliers =
          excluded.rejected_daily_outliers,

        quality_flag =
          excluded.quality_flag,

        model_version =
          excluded.model_version,

        calculated_at =
          excluded.calculated_at

    `).run({

      ...summary,

      calculated_at:
        new Date()
          .toISOString()

    });

  } catch (error) {

    console.error(
      '❌ Daily Growth Summary 저장 오류:',
      error
    );

  }

}

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
    
    /*
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
    */


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

app.post("/api/feed", async (req, res) => {
    try {
        console.log("[FEED] 먹이 급여 명령 요청");

        // TODO: Raspberry Pi에 모터 작동 명령 전달

        res.json({
            success: true,
            message: "먹이 급여 명령을 전송했습니다."
        });

    } catch (error) {
        console.error("[FEED] 먹이 급여 실패:", error);

        res.status(500).json({
            success: false,
            message: "먹이 급여에 실패했습니다."
        });
    }
});

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
      /*
      console.log(
        '📡 센서 데이터 수신'
      );

      console.log(
        `   수온: ${sensorData.temperature}°C`
      );

      console.log(
        `   pH: ${sensorData.ph}`
      );
      */

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
// YOLO
//   ↓
// POST /posi
//   ↓
// Node.js
//   ├─ YOLO 데이터 SQLite 저장
//   ├─ growth_sample Raw SQLite 저장
//   └─ WebSocket
//          ↓
//       React Dashboard
//
// ============================================================

app.post(
  '/posi',
  (req, res) => {

    const yoloData =
      req.body;


    const data =
      Array.isArray(
        yoloData
      )
        ? yoloData[0]
        : yoloData;


    // ========================================================
    // 기존 Dashboard용 Payload
    //
    // 기존 기능 유지
    // ========================================================

    const payload = {

      center_norm:
        Array.isArray(
          data?.center_norm
        )
          ? data.center_norm
          : [0.5, 0.5],


      move_direction:
        data?.move_direction ||
        'none',


      pose_direction:
        data?.pose_direction ||
        'none',


      // ======================================================
      // YOLO Keypoints
      // ======================================================

      keypoints: {

        head:
          Array.isArray(
            data?.keypoints?.head
          )
            ? data.keypoints.head
            : [0.5, 0.5],


        tail:
          Array.isArray(
            data?.keypoints?.tail
          )
            ? data.keypoints.tail
            : [0.5, 0.5]

      },


      state:
        data?.state ||
        'tracked',


      abnormal:
        Boolean(
          data?.abnormal
        )

    };


    // ========================================================
    // YOLO 데이터 DB 저장
    //
    // 기존 기능 유지
    // ========================================================

    try {

      insertYoloData.run({

        timestamp:
          new Date()
            .toISOString(),


        center_x:
          Number(
            payload.center_norm[0]
          ),


        center_y:
          Number(
            payload.center_norm[1]
          ),


        move_direction:
          payload.move_direction,


        pose_direction:
          payload.pose_direction,


        head_x:
          Number(
            payload.keypoints.head[0]
          ),


        head_y:
          Number(
            payload.keypoints.head[1]
          ),


        tail_x:
          Number(
            payload.keypoints.tail[0]
          ),


        tail_y:
          Number(
            payload.keypoints.tail[1]
          ),


        state:
          payload.state,


        abnormal:
          payload.abnormal
            ? 1
            : 0

      });

    } catch (error) {

      console.error(
        '❌ YOLO 데이터 DB 저장 오류:',
        error
      );

    }


    // ========================================================
    // 성장 데이터 Raw 저장
    //
    // growth_sample이 null이면 저장하지 않음
    //
    // 값이 있을 때만 원본 그대로 저장
    // ========================================================

    try {

      const growthSample =
        data?.growth_sample;


      if (
        growthSample &&
        typeof growthSample ===
          'object'
      ) {

        saveGrowthSample(
          growthSample
        );

      }

    } catch (error) {

      console.error(
        '❌ 성장 데이터 처리 오류:',
        error
      );

    }


    // ========================================================
    // 기존 WebSocket 전송
    //
    // Dashboard 실시간 물고기 위치
    // 기존 기능 유지
    // ========================================================

    const message =
      JSON.stringify(
        payload
      );


    wss.clients.forEach(
      client => {

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


    // ========================================================
    // 응답
    // ========================================================

    res
      .status(200)
      .send('OK');

  }
);


// ============================================================
// 특정 날짜 성장 Raw Sample 조회
//
// 예:
// GET /api/growth/raw?date=2026-09-06
// ============================================================

app.get(
  '/api/growth/raw',
  (req, res) => {

    try {

      const date =
        req.query.date;


      if (
        !date
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            error:
              'date가 필요합니다.'

          });

      }


      const rows =
        yoloDb.prepare(`
          SELECT
            *
          FROM
            growth_samples
          WHERE
            date = ?
          ORDER BY
            sample_datetime ASC
        `).all(
          date
        );


      res.json({

        success:
          true,

        count:
          rows.length,

        data:
          rows

      });

    } catch (error) {

      console.error(
        '❌ 성장 Raw 데이터 조회 오류:',
        error
      );


      res
        .status(500)
        .json({

          success:
            false,

          error:
            error.message

        });

    }

  }
);

// ============================================================
// 특정 날짜 성장 분석
//
// 예:
//
// GET /api/growth/analyze?date=2026-09-06
//
// 또는 날짜를 안 넣으면 오늘 날짜 분석
// ============================================================

app.get(
  '/api/growth/analyze',
  (req, res) => {

    try {

      const date =
        req.query.date ||
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );


      const result =
        calculateDailyGrowth(
          date
        );


      res.json(
        result
      );

    } catch (error) {

      console.error(
        '❌ 성장 분석 오류:',
        error
      );


      res
        .status(500)
        .json({

          success:
            false,

          error:
            error.message

        });

    }

  }
);

// ============================================================
// 일일 성장 결과 조회
//
// GET /api/growth/daily
// ============================================================

app.get(
  '/api/growth/daily',
  (req, res) => {

    try {

      const rows =
        yoloDb.prepare(`
          SELECT
            *
          FROM
            daily_growth
          ORDER BY
            date ASC
        `).all();


      res.json({

        success:
          true,

        count:
          rows.length,

        data:
          rows

      });

    } catch (error) {

      console.error(
        '❌ 일일 성장 데이터 조회 오류:',
        error
      );


      res
        .status(500)
        .json({

          success:
            false,

          error:
            error.message

        });

    }

  }
);

// ============================================================
// 일일 활동량 결과 조회
//
// GET /api/activity/daily
// ============================================================

app.get(
  '/api/activity/daily',
  (req, res) => {

    try {

      const rows =
        yoloDb.prepare(`
          SELECT
            *
          FROM
            daily_activity
          ORDER BY
            date ASC
        `).all();


      res.json({

        success:
          true,

        count:
          rows.length,

        data:
          rows

      });

    } catch (
      error
    ) {

      console.error(
        '❌ 일일 활동량 데이터 조회 오류:',
        error
      );


      res
        .status(
          500
        )
        .json({

          success:
            false,

          error:
            error.message

        });

    }

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

    yoloDb.close();


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

    // ================================================
    // 매일 00:05 전날 성장 데이터 자동 계산 시작
    // ================================================

    scheduleDailyGrowthCalculation();

  }
);