const Database = require('better-sqlite3');

const db = new Database('./sensor.db');

console.log('========================================');
console.log('1년치 테스트 데이터 생성 시작');
console.log('========================================');

// ======================================================
// 설정
// ======================================================

// 최근 365일
const TOTAL_DAYS = 365;

// 10분마다 1개 데이터
const INTERVAL_MINUTES = 10;

// 현재 시간
const endTime = new Date();

// 365일 전
const startTime = new Date(
  endTime.getTime() -
    TOTAL_DAYS *
      24 *
      60 *
      60 *
      1000
);

// ======================================================
// 기존 데이터 개수
// ======================================================

const beforeCount =
  db
    .prepare(
      'SELECT COUNT(*) AS count FROM sensor_data'
    )
    .get();

console.log(
  `기존 데이터: ${beforeCount.count}개`
);

// ======================================================
// INSERT 준비
// ======================================================

const insert =
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
  `);

// ======================================================
// 더미 데이터 생성
// ======================================================

const insertMany =
  db.transaction(() => {

    let current =
      new Date(startTime);

    let count = 0;

    while (
      current <= endTime
    ) {

      const timestamp =
        current.toISOString();

      const millis =
        current.getTime();

      // --------------------------------------------------
      // 1. 수온
      //
      // 계절에 따른 변화
      //
      // 겨울 → 낮음
      // 여름 → 높음
      //
      // 기본값 약 25도
      // --------------------------------------------------

      const dayOfYear =
        Math.floor(
          (
            current -
            new Date(
              current.getFullYear(),
              0,
              0
            )
          ) /
          (
            24 *
            60 *
            60 *
            1000
          )
        );

      const seasonalTemperature =
        Math.sin(
          (
            2 *
            Math.PI *
            (
              dayOfYear -
              100
            )
          ) /
          365
        ) *
        1.2;

      // 하루 동안의 작은 변화
      const dailyTemperature =
        Math.sin(
          (
            2 *
            Math.PI *
            (
              current.getHours() +
              current.getMinutes() / 60
            )
          ) /
          24
        ) *
        0.3;

      // 작은 센서 오차
      const temperatureNoise =
        (
          Math.random() -
          0.5
        ) *
        0.2;

      const temperature =
        Number(
          (
            25 +
            seasonalTemperature +
            dailyTemperature +
            temperatureNoise
          ).toFixed(2)
        );

      // --------------------------------------------------
      // 2. pH
      //
      // 6.5 ~ 7.3 정도
      // --------------------------------------------------

      const phSeasonal =
        Math.sin(
          (
            2 *
            Math.PI *
            dayOfYear
          ) /
          365
        ) *
        0.15;

      const phDaily =
        Math.sin(
          (
            2 *
            Math.PI *
            (
              current.getHours() +
              current.getMinutes() / 60
            )
          ) /
          24
        ) *
        0.05;

      const phNoise =
        (
          Math.random() -
          0.5
        ) *
        0.04;

      const ph =
        Number(
          (
            6.9 +
            phSeasonal +
            phDaily +
            phNoise
          ).toFixed(2)
        );

      // --------------------------------------------------
      // 3. 나머지 센서 값
      //
      // 그래프에는 사용하지 않지만
      // DB INSERT를 위해 기본값 입력
      // --------------------------------------------------

      const phVoltage = null;
      const tds = null;
      const tdsVoltage = null;
      const turbidityVoltage = null;
      const turbidityDelta = null;
      const turbidityWarning = 0;

      // 수위 센서는 테스트하지 않음
      const waterLevelDetected = null;

      // --------------------------------------------------
      // INSERT
      // --------------------------------------------------

      insert.run(
        timestamp,
        millis,
        temperature,
        ph,
        phVoltage,
        tds,
        tdsVoltage,
        turbidityVoltage,
        turbidityDelta,
        turbidityWarning,
        waterLevelDetected
      );

      count++;

      // 다음 10분
      current =
        new Date(
          current.getTime() +
          INTERVAL_MINUTES *
            60 *
            1000
        );
    }

    return count;
  });

// ======================================================
// 실행
// ======================================================

const insertedCount =
  insertMany();

console.log(
  `더미 데이터 ${insertedCount}개 생성 완료`
);

// ======================================================
// 결과 확인
// ======================================================

const afterCount =
  db
    .prepare(
      'SELECT COUNT(*) AS count FROM sensor_data'
    )
    .get();

console.log(
  `현재 전체 데이터: ${afterCount.count}개`
);

// 가장 오래된 데이터
const oldest =
  db
    .prepare(`
      SELECT
        timestamp,
        temperature,
        ph
      FROM sensor_data
      ORDER BY timestamp ASC
      LIMIT 1
    `)
    .get();

// 가장 최근 데이터
const newest =
  db
    .prepare(`
      SELECT
        timestamp,
        temperature,
        ph
      FROM sensor_data
      ORDER BY timestamp DESC
      LIMIT 1
    `)
    .get();

console.log('');
console.log('----------------------------------------');
console.log('가장 오래된 데이터');
console.log(oldest);

console.log('');
console.log('가장 최근 데이터');
console.log(newest);

console.log('----------------------------------------');
console.log('테스트 데이터 생성 완료');
console.log('----------------------------------------');

db.close();
