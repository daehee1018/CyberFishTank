const path = require('path');
const Database = require('better-sqlite3');

// ======================================================
// 설정
// ======================================================

// DB 위치
const DB_PATH = path.join(
  __dirname,
  'yolo.db'
);

// 활동량 계산 기준

// 1초 이상 데이터 그룹화
const SAMPLE_INTERVAL_SEC = 1;

// 최대 허용 시간 간격
const MAX_TIME_GAP_SEC = 2;

// 최소 이동거리
const MIN_DISTANCE = 0.003;

// 최대 허용 속도
const MAX_SPEED = 0.30;

// Quality 기준
const HIGH_SAMPLE_COUNT = 1000;
const MEDIUM_SAMPLE_COUNT = 300;

// 모델 버전
const MODEL_VERSION = 'activity-v1';


// ======================================================
// 유틸 함수
// ======================================================

// 평균 계산
function mean(values) {

  if (!values.length) {
    return 0;
  }

  return values.reduce(
    (sum, value) => sum + value,
    0
  ) / values.length;
}


// ======================================================
// DB 연결
// ======================================================

const db = new Database(
  DB_PATH
);


// ======================================================
// daily_activity 테이블 생성
// ======================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_activity (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    date TEXT NOT NULL UNIQUE,

    total_distance REAL,

    average_speed REAL,

    max_speed REAL,

    raw_sample_count INTEGER DEFAULT 0,

    used_sample_count INTEGER DEFAULT 0,

    rejected_noise_count INTEGER DEFAULT 0,

    rejected_gap_count INTEGER DEFAULT 0,

    rejected_speed_count INTEGER DEFAULT 0,

    quality_flag TEXT,

    model_version TEXT,

    calculated_at TEXT NOT NULL

  )
`);


// ======================================================
// 날짜 입력
// ======================================================

const targetDate =
  process.argv[2];


// 날짜가 없으면 종료
if (!targetDate) {

  console.error(
    '\n❌ 날짜를 입력해주세요.\n'
  );

  console.log(
    '예시:'
  );

  console.log(
    'node calculate_activity.cjs 2026-09-06\n'
  );

  process.exit(1);
}


// ======================================================
// 시작 로그
// ======================================================

console.log(
  '\n============================================================'
);

console.log(
  '🐟 물고기 활동량 Daily 계산'
);

console.log(
  '============================================================'
);

console.log(
  `\n📅 대상 날짜: ${targetDate}`
);

console.log(
  `🗄️ DB 위치: ${DB_PATH}`
);

console.log(
  '\n============================================================\n'
);


// ======================================================
// 해당 날짜 YOLO 데이터 조회
// ======================================================

const rows = db.prepare(`
  SELECT

    timestamp,

    center_x,

    center_y

  FROM yolo_data

  WHERE

    date(timestamp) = ?

    AND state = 'tracked'

    AND abnormal = 0

    AND center_x IS NOT NULL

    AND center_y IS NOT NULL

  ORDER BY timestamp ASC
`).all(
  targetDate
);


// ======================================================
// Raw Sample 확인
// ======================================================

const rawSampleCount =
  rows.length;

console.log(
  `📊 Raw Sample 수: ${rawSampleCount}개`
);


// 데이터가 없으면 종료
if (
  rawSampleCount === 0
) {

  console.log(
    '\n❌ 해당 날짜의 활동 데이터가 없습니다.'
  );

  db.close();

  process.exit(0);
}


// ======================================================
// 1초 단위 그룹화
// ======================================================

console.log(
  '\n📦 1초 단위 좌표 그룹화 시작...'
);


// Map 생성
const secondGroups =
  new Map();


// 각 데이터를 초 단위로 그룹화
for (
  const row of rows
) {

  const date =
    new Date(
      row.timestamp
    );

  // Unix Time 기준 초 단위
  const secondKey =
    Math.floor(
      date.getTime() / 1000
    );

  // 그룹이 없으면 생성
  if (
    !secondGroups.has(
      secondKey
    )
  ) {

    secondGroups.set(
      secondKey,
      []
    );

  }


  secondGroups
    .get(
      secondKey
    )
    .push(
      {
        x: Number(
          row.center_x
        ),

        y: Number(
          row.center_y
        ),

        timestamp:
          row.timestamp
      }
    );
}


// ======================================================
// 1초 대표 좌표 생성
// ======================================================

const sampledPoints =
  [];


for (
  const [
    secondKey,
    points
  ]
  of secondGroups
) {

  const x =
    mean(
      points.map(
        point =>
          point.x
      )
    );

  const y =
    mean(
      points.map(
        point =>
          point.y
      )
    );

  sampledPoints.push(
    {
      timestamp:
        secondKey * 1000,

      x,

      y,

      sampleCount:
        points.length
    }
  );
}


// 시간순 정렬
sampledPoints.sort(
  (
    a,
    b
  ) =>
    a.timestamp -
    b.timestamp
);


console.log(
  `📍 1초 대표 좌표: ${sampledPoints.length}개`
);


// ======================================================
// 활동량 계산
// ======================================================

let totalDistance =
  0;

let totalSpeed =
  0;

let speedCount =
  0;

let maxSpeed =
  0;


// 제외 카운트

let rejectedNoiseCount =
  0;

let rejectedGapCount =
  0;

let rejectedSpeedCount =
  0;


// 실제 사용 이동 구간

let usedSampleCount =
  0;


// 이전 좌표

let previousPoint =
  null;


// ======================================================
// 이동거리 계산
// ======================================================

for (
  const point of sampledPoints
) {

  // 첫 번째 데이터
  if (
    previousPoint === null
  ) {

    previousPoint =
      point;

    continue;
  }


  // 시간 차이
  const timeDiffSec =
    (
      point.timestamp -
      previousPoint.timestamp
    )
    /
    1000;


  // 시간 공백 검사
  if (
    timeDiffSec >
    MAX_TIME_GAP_SEC
  ) {

    rejectedGapCount++;

    previousPoint =
      point;

    continue;
  }


  // 이동거리 계산

  const dx =
    point.x -
    previousPoint.x;

  const dy =
    point.y -
    previousPoint.y;


  const distance =
    Math.sqrt(
      dx * dx +
      dy * dy
    );


  // 노이즈 제거

  if (
    distance <
    MIN_DISTANCE
  ) {

    rejectedNoiseCount++;

    previousPoint =
      point;

    continue;
  }


  // 속도 계산

  const speed =
    distance /
    timeDiffSec;


  // 비정상 속도 제거

  if (
    speed >
    MAX_SPEED
  ) {

    rejectedSpeedCount++;

    previousPoint =
      point;

    continue;
  }


  // 활동량 누적

  totalDistance +=
    distance;


  totalSpeed +=
    speed;


  speedCount++;


  usedSampleCount++;


  // 최고 속도

  if (
    speed >
    maxSpeed
  ) {

    maxSpeed =
      speed;

  }


  previousPoint =
    point;
}


// ======================================================
// 평균 속도
// ======================================================

const averageSpeed =
  speedCount > 0
    ?
      totalSpeed /
      speedCount
    :
      0;


// ======================================================
// Quality 계산
// ======================================================

let qualityFlag;


if (
  usedSampleCount >=
  HIGH_SAMPLE_COUNT
) {

  qualityFlag =
    'HIGH';

} else if (
  usedSampleCount >=
  MEDIUM_SAMPLE_COUNT
) {

  qualityFlag =
    'MEDIUM';

} else {

  qualityFlag =
    'LOW';

}


// ======================================================
// 결과 출력
// ======================================================

console.log(
  '\n============================================================'
);

console.log(
  '🐟 Daily Activity 계산 완료'
);

console.log(
  '============================================================\n'
);

console.log(
  `📅 날짜: ${targetDate}`
);

console.log(
  `\n🏊 총 활동량: ${totalDistance.toFixed(4)}`
);

console.log(
  `⚡ 평균 속도: ${averageSpeed.toFixed(4)} / sec`
);

console.log(
  `🚀 최대 속도: ${maxSpeed.toFixed(4)} / sec`
);


console.log(
  '\n📊 데이터 통계'
);

console.log(
  '========================'
);

console.log(
  `Raw Sample: ${rawSampleCount}개`
);

console.log(
  `1초 Sample: ${sampledPoints.length}개`
);

console.log(
  `사용 이동 구간: ${usedSampleCount}개`
);


console.log(
  '\n❌ 제외 데이터'
);

console.log(
  '========================'
);

console.log(
  `노이즈 제거: ${rejectedNoiseCount}개`
);

console.log(
  `시간 공백 제거: ${rejectedGapCount}개`
);

console.log(
  `속도 이상 제거: ${rejectedSpeedCount}개`
);


console.log(
  `\n🏷️ Quality: ${qualityFlag}`
);

console.log(
  `🤖 Model Version: ${MODEL_VERSION}`
);


// ======================================================
// DB 저장
// ======================================================

const calculatedAt =
  new Date()
    .toISOString();


// 기존 날짜 데이터 확인

const existing =
  db.prepare(`
    SELECT id

    FROM daily_activity

    WHERE date = ?
  `)
  .get(
    targetDate
  );


// 데이터 저장

if (
  existing
) {

  db.prepare(`
    UPDATE daily_activity

    SET

      total_distance = ?,

      average_speed = ?,

      max_speed = ?,

      raw_sample_count = ?,

      used_sample_count = ?,

      rejected_noise_count = ?,

      rejected_gap_count = ?,

      rejected_speed_count = ?,

      quality_flag = ?,

      model_version = ?,

      calculated_at = ?

    WHERE date = ?
  `)
  .run(

    totalDistance,

    averageSpeed,

    maxSpeed,

    rawSampleCount,

    usedSampleCount,

    rejectedNoiseCount,

    rejectedGapCount,

    rejectedSpeedCount,

    qualityFlag,

    MODEL_VERSION,

    calculatedAt,

    targetDate
  );


  console.log(
    '\n🔄 기존 활동량 데이터를 업데이트했습니다.'
  );

} else {

  db.prepare(`
    INSERT INTO daily_activity (

      date,

      total_distance,

      average_speed,

      max_speed,

      raw_sample_count,

      used_sample_count,

      rejected_noise_count,

      rejected_gap_count,

      rejected_speed_count,

      quality_flag,

      model_version,

      calculated_at

    )

    VALUES (

      ?,

      ?,

      ?,

      ?,

      ?,

      ?,

      ?,

      ?,

      ?,

      ?,

      ?,

      ?

    )
  `)
  .run(

    targetDate,

    totalDistance,

    averageSpeed,

    maxSpeed,

    rawSampleCount,

    usedSampleCount,

    rejectedNoiseCount,

    rejectedGapCount,

    rejectedSpeedCount,

    qualityFlag,

    MODEL_VERSION,

    calculatedAt
  );


  console.log(
    '\n💾 새로운 활동량 데이터를 저장했습니다.'
  );

}


console.log(
  `📅 저장 날짜: ${targetDate}`
);


console.log(
  '\n============================================================\n'
);


// ======================================================
// DB 연결 종료
// ======================================================

db.close();