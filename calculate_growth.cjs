const path = require('path');
const Database = require('better-sqlite3');


// ============================================================
// 설정
// ============================================================

// 데이터베이스 위치
const DB_PATH = path.join(
  __dirname,
  'yolo.db'
);


// ------------------------------------------------------------
// Event 최소 Sample 수
// ------------------------------------------------------------

const MIN_EVENT_SAMPLES = 3;


// ------------------------------------------------------------
// Event 내부 Sample MAD 이상치 제거
//
// Sample이 5개 이상일 때만 적용
// robust z > 3.5 제거
// ------------------------------------------------------------

const MIN_SAMPLES_FOR_SAMPLE_MAD = 5;

const SAMPLE_MAD_Z_THRESHOLD = 3.5;


// ------------------------------------------------------------
// Event 안정성 기준
//
// Relative MAD = MAD / Median
//
// 4% 이하만 Stable
// ------------------------------------------------------------

const MAX_RELATIVE_MAD = 0.04;


// ------------------------------------------------------------
// Geometry QC
//
// 현재 임시 고정 기준
// ------------------------------------------------------------

const MIN_BBOX_W = 167.3;

const MAX_BBOX_W = 190.5;


const MIN_LENGTH_BBOX_RATIO = 0.543;

const MAX_LENGTH_BBOX_RATIO = 0.609;


// ------------------------------------------------------------
// Event 간 이상치 제거
//
// Event가 5개 이상일 때만 적용
// ------------------------------------------------------------

const MIN_EVENTS_FOR_DAILY_MAD = 5;

const EVENT_MAD_Z_THRESHOLD = 3.5;


// ------------------------------------------------------------
// Pixel → mm 환산
//
// 60 mm ≈ 170 px
// ------------------------------------------------------------

const CYLINDER_LENGTH_MM = 60;

const CYLINDER_LENGTH_PX = 170;

const PIXEL_TO_MM =
  CYLINDER_LENGTH_MM /
  CYLINDER_LENGTH_PX;


// ------------------------------------------------------------
// 모델 버전
// ------------------------------------------------------------

const MODEL_VERSION =
  'growth-qc-v1';


// ============================================================
// 날짜 인자 확인
// ============================================================

const targetDate =
  process.argv[2];


if (!targetDate) {

  console.log('');
  console.log('사용법:');
  console.log('');
  console.log(
    'node calculate_growth.cjs YYYY-MM-DD'
  );
  console.log('');
  console.log('예시:');
  console.log('');
  console.log(
    'node calculate_growth.cjs 2026-09-06'
  );
  console.log('');

  process.exit(1);

}


// ============================================================
// 날짜 형식 간단 검사
// ============================================================

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;


if (!datePattern.test(targetDate)) {

  console.error(
    '❌ 날짜 형식이 올바르지 않습니다.'
  );

  console.error(
    '예: 2026-09-06'
  );

  process.exit(1);

}


// ============================================================
// SQLite 연결
// ============================================================

const db =
  new Database(DB_PATH);


console.log('');
console.log(
  '============================================================'
);

console.log(
  '🐟 물고기 성장 데이터 Daily 계산'
);

console.log(
  '============================================================'
);

console.log(
  `📅 대상 날짜: ${targetDate}`
);

console.log(
  `🗄️ DB 위치: ${DB_PATH}`
);

console.log(
  '============================================================'
);


// ============================================================
// daily_growth 테이블 생성
// ============================================================

db.prepare(`
  CREATE TABLE IF NOT EXISTS daily_growth (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    date TEXT NOT NULL UNIQUE,

    daily_length_px REAL,

    daily_length_mm REAL,

    event_mad_px REAL,

    event_mad_mm REAL,

    raw_sample_count INTEGER DEFAULT 0,

    raw_event_count INTEGER DEFAULT 0,

    stable_event_count INTEGER DEFAULT 0,

    geometry_pass_event_count INTEGER DEFAULT 0,

    used_event_count INTEGER DEFAULT 0,

    rejected_sample_outliers INTEGER DEFAULT 0,

    rejected_unstable_events INTEGER DEFAULT 0,

    rejected_geometry_events INTEGER DEFAULT 0,

    rejected_daily_outliers INTEGER DEFAULT 0,

    quality_flag TEXT,

    model_version TEXT,

    calculated_at TEXT NOT NULL
  )
`).run();


console.log(
  '✅ daily_growth 테이블 확인 완료'
);


// ============================================================
// 유틸리티 함수
// ============================================================


// ------------------------------------------------------------
// 숫자 배열 Median
// ------------------------------------------------------------

function median(values) {

  if (
    !Array.isArray(values) ||
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
    sorted.length % 2 === 1
  ) {

    return sorted[middle];

  }


  return (
    sorted[middle - 1] +
    sorted[middle]
  ) / 2;

}


// ------------------------------------------------------------
// MAD 계산
//
// MAD = median(
//   |각 값 - median|
// )
// ------------------------------------------------------------

function mad(values) {

  const med =
    median(values);


  if (
    med === null
  ) {

    return null;

  }


  const deviations =
    values
      .filter(
        value =>
          Number.isFinite(value)
      )
      .map(
        value =>
          Math.abs(
            value - med
          )
      );


  return median(
    deviations
  );

}


// ------------------------------------------------------------
// robust z-score 계산
// ------------------------------------------------------------

function robustZScore(
  value,
  med,
  madValue
) {

  // ----------------------------------------------------------
  // MAD가 0인 경우
  //
  // 모든 값이 거의 동일한 경우이므로
  // median과 다른 값만 Infinity로 처리
  // ----------------------------------------------------------

  if (
    madValue === 0
  ) {

    if (
      value === med
    ) {

      return 0;

    }


    return Infinity;

  }


  if (
    madValue === null ||
    madValue === undefined
  ) {

    return 0;

  }


  return (
    0.6745 *
    Math.abs(
      value - med
    )
  ) /
  madValue;

}


// ------------------------------------------------------------
// 숫자 반올림
// ------------------------------------------------------------

function roundNumber(
  value,
  digits = 4
) {

  if (
    !Number.isFinite(value)
  ) {

    return null;

  }


  const factor =
    10 ** digits;


  return (
    Math.round(
      value * factor
    ) /
    factor
  );

}


// ============================================================
// Raw Growth Sample 조회
// ============================================================

const rawSamples =
  db.prepare(`
    SELECT

      id,

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

    FROM growth_samples

    WHERE date = ?

    ORDER BY

      event_id ASC,

      sample_datetime ASC,

      id ASC

  `).all(
    targetDate
  );


console.log('');
console.log(
  `📊 Raw Sample 수: ${rawSamples.length}개`
);


// ============================================================
// 데이터가 없는 경우
// ============================================================

if (
  rawSamples.length === 0
) {

  console.log('');

  console.log(
    '⚠️ 해당 날짜의 성장 데이터가 없습니다.'
  );

  db.close();

  process.exit(0);

}


// ============================================================
// Event별 그룹화
// ============================================================

const eventMap =
  new Map();


for (
  const sample of rawSamples
) {

  // event_id가 없는 데이터는
  // Event 계산 대상에서 제외

  if (
    sample.event_id === null ||
    sample.event_id === undefined
  ) {

    continue;

  }


  const eventId =
    sample.event_id;


  if (
    !eventMap.has(eventId)
  ) {

    eventMap.set(
      eventId,
      []
    );

  }


  eventMap
    .get(eventId)
    .push(sample);

}


const rawEventCount =
  eventMap.size;


console.log(
  `📦 Raw Event 수: ${rawEventCount}개`
);


// ============================================================
// 통계 카운터
// ============================================================

let rejectedSampleOutliers =
  0;


let rejectedUnstableEvents =
  0;


let rejectedGeometryEvents =
  0;


let rejectedDailyOutliers =
  0;


let stableEventCount =
  0;


let geometryPassEventCount =
  0;


// ============================================================
// Event 처리
// ============================================================

const stableEvents =
  [];


// ------------------------------------------------------------
// 모든 Event 순회
// ------------------------------------------------------------

for (
  const [
    eventId,
    samples
  ] of eventMap
) {


  console.log('');

  console.log(
    `------------------------------------------------------------`
  );

  console.log(
    `🐟 Event ${eventId}`
  );

  console.log(
    `   Raw Sample: ${samples.length}개`
  );


  // ==========================================================
  // 1. 최소 Sample 수 검사
  // ==========================================================

  if (
    samples.length <
    MIN_EVENT_SAMPLES
  ) {

    rejectedUnstableEvents++;

    console.log(
      `   ❌ 제외: Sample 부족 (${MIN_EVENT_SAMPLES}개 미만)`
    );

    continue;

  }


  // ==========================================================
  // body_length_px 유효 데이터만 사용
  // ==========================================================

  let validSamples =
    samples.filter(
      sample =>
        Number.isFinite(
          sample.body_length_px
        ) &&
        sample.body_length_px > 0
    );


  if (
    validSamples.length <
    MIN_EVENT_SAMPLES
  ) {

    rejectedUnstableEvents++;

    console.log(
      '   ❌ 제외: 유효한 body_length_px 부족'
    );

    continue;

  }


  // ==========================================================
  // 2. Event 내부 Sample MAD 이상치 제거
  // ==========================================================

  if (
    validSamples.length >=
    MIN_SAMPLES_FOR_SAMPLE_MAD
  ) {

    const lengths =
      validSamples.map(
        sample =>
          sample.body_length_px
      );


    const eventMedianBefore =
      median(
        lengths
      );


    const eventMadBefore =
      mad(
        lengths
      );


    const filteredSamples =
      validSamples.filter(
        sample => {

          const z =
            robustZScore(
              sample.body_length_px,
              eventMedianBefore,
              eventMadBefore
            );


          if (
            z >
            SAMPLE_MAD_Z_THRESHOLD
          ) {

            rejectedSampleOutliers++;

            return false;

          }


          return true;

        }
      );


    console.log(
      `   Sample MAD: ${roundNumber(eventMadBefore)}`
    );

    console.log(
      `   MAD 후 Sample: ${filteredSamples.length}개`
    );


    validSamples =
      filteredSamples;

  }


  // ----------------------------------------------------------
  // MAD 이후 Sample 수 다시 검사
  // ----------------------------------------------------------

  if (
    validSamples.length <
    MIN_EVENT_SAMPLES
  ) {

    rejectedUnstableEvents++;

    console.log(
      '   ❌ 제외: MAD 이후 Sample 부족'
    );

    continue;

  }


  // ==========================================================
  // 3. Event Median
  // ==========================================================

  const eventLengths =
    validSamples.map(
      sample =>
        sample.body_length_px
    );


  const eventMedian =
    median(
      eventLengths
    );


  const eventMad =
    mad(
      eventLengths
    );


  // ==========================================================
  // 4. Relative MAD
  //
  // Relative MAD = MAD / Median
  // ==========================================================

  const relativeMad =
    eventMedian > 0
      ? eventMad /
        eventMedian
      : Infinity;


  console.log(
    `   Event Median: ${roundNumber(eventMedian)} px`
  );

  console.log(
    `   Event MAD: ${roundNumber(eventMad)} px`
  );

  console.log(
    `   Relative MAD: ${roundNumber(relativeMad * 100, 2)}%`
  );


  // ==========================================================
  // Event 안정성 검사
  // ==========================================================

  if (
    relativeMad >
    MAX_RELATIVE_MAD
  ) {

    rejectedUnstableEvents++;

    console.log(
      '   ❌ 제외: Relative MAD 4% 초과'
    );

    continue;

  }


  stableEventCount++;


  console.log(
    '   ✅ Stable Event'
  );


  // ==========================================================
  // 5. Geometry QC
  //
  // Event 대표 bbox_w
  // → Event 내부 Median 사용
  // ==========================================================

  const bboxWidths =
    validSamples
      .map(
        sample =>
          sample.bbox_w
      )
      .filter(
        value =>
          Number.isFinite(value) &&
          value > 0
      );


  const bboxWMedian =
    median(
      bboxWidths
    );


  // ----------------------------------------------------------
  // body_length_px / bbox_w
  //
  // Sample별 ratio를 만든 뒤
  // Event Median을 대표값으로 사용
  // ----------------------------------------------------------

  const lengthBboxRatios =
    validSamples
      .filter(
        sample =>
          Number.isFinite(
            sample.body_length_px
          ) &&
          Number.isFinite(
            sample.bbox_w
          ) &&
          sample.bbox_w > 0
      )
      .map(
        sample =>
          sample.body_length_px /
          sample.bbox_w
      );


  const lengthBboxRatioMedian =
    median(
      lengthBboxRatios
    );


  console.log(
    `   bbox_w Median: ${roundNumber(bboxWMedian)} px`
  );

  console.log(
    `   Length/bbox_w: ${roundNumber(lengthBboxRatioMedian)}`
  );


  // ==========================================================
  // bbox_w 검사
  // ==========================================================

  const bboxPass =

    bboxWMedian !== null &&

    bboxWMedian >=
    MIN_BBOX_W &&

    bboxWMedian <=
    MAX_BBOX_W;


  // ==========================================================
  // length / bbox_w 검사
  // ==========================================================

  const ratioPass =

    lengthBboxRatioMedian !== null &&

    lengthBboxRatioMedian >=
    MIN_LENGTH_BBOX_RATIO &&

    lengthBboxRatioMedian <=
    MAX_LENGTH_BBOX_RATIO;


  if (
    !bboxPass ||
    !ratioPass
  ) {

    rejectedGeometryEvents++;

    console.log(
      '   ❌ Geometry QC 탈락'
    );

    if (
      !bboxPass
    ) {

      console.log(
        `      bbox_w 기준: ${MIN_BBOX_W} ~ ${MAX_BBOX_W}`
      );

    }


    if (
      !ratioPass
    ) {

      console.log(
        `      Ratio 기준: ${MIN_LENGTH_BBOX_RATIO} ~ ${MAX_LENGTH_BBOX_RATIO}`
      );

    }


    continue;

  }


  geometryPassEventCount++;


  console.log(
    '   ✅ Geometry QC 통과'
  );


  // ==========================================================
  // 최종 Stable Event 저장
  // ==========================================================

  stableEvents.push({

    event_id:
      eventId,

    sample_count:
      validSamples.length,

    event_median:
      eventMedian,

    event_mad:
      eventMad,

    relative_mad:
      relativeMad,

    bbox_w_median:
      bboxWMedian,

    length_bbox_ratio:
      lengthBboxRatioMedian

  });

}


// ============================================================
// Geometry QC 이후 Event 확인
// ============================================================

console.log('');

console.log(
  '============================================================'
);

console.log(
  '📊 Event QC 결과'
);

console.log(
  '============================================================'
);

console.log(
  `Raw Event: ${rawEventCount}개`
);

console.log(
  `Stable Event: ${stableEventCount}개`
);

console.log(
  `Geometry Pass Event: ${geometryPassEventCount}개`
);

console.log(
  '============================================================'
);


// ============================================================
// 최종 Event 목록
// ============================================================

let finalEvents =
  [...stableEvents];


// ============================================================
// Event 간 MAD 이상치 제거
// ============================================================

if (
  finalEvents.length >=
  MIN_EVENTS_FOR_DAILY_MAD
) {

  const eventMedians =
    finalEvents.map(
      event =>
        event.event_median
    );


  const dailyMedianBefore =
    median(
      eventMedians
    );


  const dailyMadBefore =
    mad(
      eventMedians
    );


  console.log('');

  console.log(
    '📊 Event 간 MAD 이상치 검사'
  );

  console.log(
    `   Event Median 중앙값: ${roundNumber(dailyMedianBefore)} px`
  );

  console.log(
    `   Event Median MAD: ${roundNumber(dailyMadBefore)} px`
  );


  finalEvents =
    finalEvents.filter(
      event => {

        const z =
          robustZScore(
            event.event_median,
            dailyMedianBefore,
            dailyMadBefore
          );


        if (
          z >
          EVENT_MAD_Z_THRESHOLD
        ) {

          rejectedDailyOutliers++;

          console.log(
            `   ❌ Event ${event.event_id} 제거 (robust z: ${roundNumber(z)})`
          );

          return false;

        }


        return true;

      }
    );


} else {

  console.log('');

  console.log(
    `ℹ️ Event가 ${MIN_EVENTS_FOR_DAILY_MAD}개 미만이라 Event 간 MAD 검사를 건너뜁니다.`
  );

}


// ============================================================
// 최종 Event가 없는 경우
// ============================================================

if (
  finalEvents.length === 0
) {

  console.log('');

  console.log(
    '⚠️ 최종적으로 사용할 Event가 없습니다.'
  );


  // ----------------------------------------------------------
  // 기존 날짜 결과 삭제
  // ----------------------------------------------------------

  db.prepare(`
    DELETE FROM daily_growth
    WHERE date = ?
  `).run(
    targetDate
  );


  db.prepare(`
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

  `).run({

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
      rawSamples.length,

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
      'NO_VALID_EVENT',

    model_version:
      MODEL_VERSION,

    calculated_at:
      new Date().toISOString()

  });


  console.log(
    '💾 Daily 결과 저장 완료 (NO_VALID_EVENT)'
  );


  db.close();

  process.exit(0);

}


// ============================================================
// 최종 Daily Median 계산
// ============================================================

const finalEventMedians =
  finalEvents.map(
    event =>
      event.event_median
  );


const dailyLengthPx =
  median(
    finalEventMedians
  );


const eventMadPx =
  mad(
    finalEventMedians
  );


const dailyLengthMm =
  dailyLengthPx *
  PIXEL_TO_MM;


const eventMadMm =
  eventMadPx *
  PIXEL_TO_MM;


// ============================================================
// Quality Flag
// ============================================================

let qualityFlag =
  'GOOD';


if (
  finalEvents.length < 3
) {

  qualityFlag =
    'LOW';

}

else if (
  finalEvents.length < 5
) {

  qualityFlag =
    'MEDIUM';

}


// ============================================================
// 기존 날짜 결과 삭제
//
// 같은 날짜를 다시 계산할 수 있도록
// 기존 결과를 먼저 삭제
// ============================================================

db.prepare(`
  DELETE FROM daily_growth

  WHERE date = ?
`).run(
  targetDate
);


// ============================================================
// Daily 결과 저장
// ============================================================

const insertDailyGrowth =
  db.prepare(`

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

  `);


insertDailyGrowth.run({

  date:
    targetDate,

  daily_length_px:
    roundNumber(
      dailyLengthPx,
      4
    ),

  daily_length_mm:
    roundNumber(
      dailyLengthMm,
      4
    ),

  event_mad_px:
    roundNumber(
      eventMadPx,
      4
    ),

  event_mad_mm:
    roundNumber(
      eventMadMm,
      4
    ),

  raw_sample_count:
    rawSamples.length,

  raw_event_count:
    rawEventCount,

  stable_event_count:
    stableEventCount,

  geometry_pass_event_count:
    geometryPassEventCount,

  used_event_count:
    finalEvents.length,

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
    MODEL_VERSION,

  calculated_at:
    new Date().toISOString()

});


// ============================================================
// 최종 결과 출력
// ============================================================

console.log('');

console.log(
  '============================================================'
);

console.log(
  '🐟 Daily Growth 계산 완료'
);

console.log(
  '============================================================'
);

console.log(
  `📅 날짜: ${targetDate}`
);

console.log('');

console.log(
  `📏 Daily Length: ${roundNumber(dailyLengthPx, 2)} px`
);

console.log(
  `📏 Daily Length: ${roundNumber(dailyLengthMm, 2)} mm`
);

console.log('');

console.log(
  `📊 최종 사용 Event: ${finalEvents.length}개`
);

console.log(
  `📊 Raw Sample: ${rawSamples.length}개`
);

console.log(
  `📦 Raw Event: ${rawEventCount}개`
);

console.log(
  `✅ Stable Event: ${stableEventCount}개`
);

console.log(
  `📐 Geometry Pass: ${geometryPassEventCount}개`
);

console.log('');

console.log(
  `❌ Sample 이상치 제거: ${rejectedSampleOutliers}개`
);

console.log(
  `❌ Unstable Event 제거: ${rejectedUnstableEvents}개`
);

console.log(
  `❌ Geometry Event 제거: ${rejectedGeometryEvents}개`
);

console.log(
  `❌ Daily Event 이상치 제거: ${rejectedDailyOutliers}개`
);

console.log('');

console.log(
  `🏷️ Quality: ${qualityFlag}`
);

console.log(
  `🤖 Model Version: ${MODEL_VERSION}`
);

console.log(
  '============================================================'
);

console.log('');


// ============================================================
// SQLite 연결 종료
// ============================================================

db.close();