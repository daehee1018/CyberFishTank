const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');


// ============================================================
// 데이터베이스 연결
// ============================================================

const dbPath = path.join(
  __dirname,
  'yolo.db'
);

const db = new Database(dbPath);


console.log('');
console.log('============================================');
console.log('🐟 성장 데이터 CSV Import 시작');
console.log('============================================');
console.log(`📁 DB 위치: ${dbPath}`);
console.log('============================================');


// ============================================================
// Import할 CSV 파일
//
// 현재 폴더에 아래 파일들이 있어야 함
// ============================================================

const csvFiles = [

  'growth_samples_2026-09-04.csv',

  'growth_samples_2026-09-05.csv',

  'growth_samples_2026-09-06.csv'

];


// ============================================================
// growth_samples 테이블 확인
// ============================================================

db.prepare(`
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


console.log(
  '✅ growth_samples 테이블 확인 완료'
);


// ============================================================
// CSV 한 줄 파싱
//
// CSV 안에는 growth_roi처럼
// 쉼표가 포함된 문자열이 있기 때문에
// 단순 split(",")을 사용하면 안 됨.
// ============================================================

function parseCsvLine(line) {

  const result = [];

  let current = '';

  let inQuotes = false;


  for (
    let i = 0;
    i < line.length;
    i++
  ) {

    const char =
      line[i];


    // --------------------------------------------------------
    // 따옴표 처리
    // --------------------------------------------------------

    if (
      char === '"'
    ) {

      // CSV 내부의 ""
      // 처리
      if (
        inQuotes &&
        line[i + 1] === '"'
      ) {

        current += '"';

        i++;

      } else {

        inQuotes =
          !inQuotes;

      }

    }


    // --------------------------------------------------------
    // 쉼표
    //
    // 따옴표 밖의 쉼표만
    // 컬럼 구분자로 사용
    // --------------------------------------------------------

    else if (
      char === ',' &&
      !inQuotes
    ) {

      result.push(
        current
      );

      current = '';

    }


    // --------------------------------------------------------
    // 일반 문자
    // --------------------------------------------------------

    else {

      current +=
        char;

    }

  }


  // 마지막 값 추가

  result.push(
    current
  );


  return result;

}


// ============================================================
// 문자열 → 숫자 변환
//
// 빈 값이면 null
// ============================================================

function toNumber(value) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return null;

  }


  const number =
    Number(value);


  if (
    Number.isNaN(number)
  ) {

    return null;

  }


  return number;

}


// ============================================================
// INSERT SQL
// ============================================================

const insertGrowthSample =
  db.prepare(`
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
// CSV 파일 Import 함수
// ============================================================

function importCsvFile(
  fileName
) {

  const filePath =
    path.join(
      __dirname,
      fileName
    );


  // ----------------------------------------------------------
  // 파일 존재 확인
  // ----------------------------------------------------------

  if (
    !fs.existsSync(
      filePath
    )
  ) {

    console.log('');
    console.log(
      `⚠️ 파일 없음: ${fileName}`
    );

    return 0;

  }


  console.log('');
  console.log(
    `📥 Import 시작: ${fileName}`
  );


  // ----------------------------------------------------------
  // 파일 읽기
  // ----------------------------------------------------------

  const content =
    fs.readFileSync(
      filePath,
      'utf8'
    );


  const lines =
    content
      .split(/\r?\n/)
      .filter(
        line =>
          line.trim() !== ''
      );


  // ----------------------------------------------------------
  // 데이터가 없는 경우
  // ----------------------------------------------------------

  if (
    lines.length < 2
  ) {

    console.log(
      '⚠️ Import할 데이터가 없습니다.'
    );

    return 0;

  }


  // ----------------------------------------------------------
  // Header 읽기
  // ----------------------------------------------------------

  const headers =
    parseCsvLine(
      lines[0]
    );


  // 컬럼 이름 → index

  const headerIndex =
    {};


  headers.forEach(
    (
      header,
      index
    ) => {

      headerIndex[
        header.trim()
      ] =
        index;

    }
  );


  // ----------------------------------------------------------
  // 필수 컬럼 확인
  // ----------------------------------------------------------

  const requiredColumns = [

    'datetime',

    'date',

    'event_id',

    'body_length_px',

    'bbox_w',

    'bbox_h',

    'head_x',

    'head_y',

    'tail_x',

    'tail_y',

    'pose_conf',

    'side_tilt_deg'

  ];


  for (
    const column of
    requiredColumns
  ) {

    if (
      headerIndex[
        column
      ] === undefined
    ) {

      console.log(
        `❌ 필수 컬럼 없음: ${column}`
      );

      return 0;

    }

  }


  // ----------------------------------------------------------
  // Transaction
  //
  // 대량 Import 속도 향상
  // ----------------------------------------------------------

  let importedCount =
    0;


  const importTransaction =
    db.transaction(
      () => {

        for (
          let i = 1;
          i < lines.length;
          i++
        ) {

          const values =
            parseCsvLine(
              lines[i]
            );


          // --------------------------------------------------
          // CSV 원본 데이터를
          // JSON 형태로 변환
          // --------------------------------------------------

          const rawData =
            {};


          headers.forEach(
            (
              header,
              index
            ) => {

              rawData[
                header.trim()
              ] =
                values[index] ??
                null;

            }
          );


          // --------------------------------------------------
          // DB 저장 데이터
          // --------------------------------------------------

          const growthData = {

            // Import한 시간

            received_at:
              new Date()
                .toISOString(),


            // 실제 측정 시간

            sample_datetime:
              values[
                headerIndex.datetime
              ] ||
              null,


            // 날짜

            date:
              values[
                headerIndex.date
              ] ||
              null,


            // Event ID

            event_id:
              toNumber(
                values[
                  headerIndex.event_id
                ]
              ),


            // 몸 길이

            body_length_px:
              toNumber(
                values[
                  headerIndex.body_length_px
                ]
              ),


            // Bounding Box

            bbox_w:
              toNumber(
                values[
                  headerIndex.bbox_w
                ]
              ),


            bbox_h:
              toNumber(
                values[
                  headerIndex.bbox_h
                ]
              ),


            // Head 좌표

            head_x:
              toNumber(
                values[
                  headerIndex.head_x
                ]
              ),


            head_y:
              toNumber(
                values[
                  headerIndex.head_y
                ]
              ),


            // Tail 좌표

            tail_x:
              toNumber(
                values[
                  headerIndex.tail_x
                ]
              ),


            tail_y:
              toNumber(
                values[
                  headerIndex.tail_y
                ]
              ),


            // Pose Confidence

            pose_conf:
              toNumber(
                values[
                  headerIndex.pose_conf
                ]
              ),


            // 측면 기울기

            side_tilt_deg:
              toNumber(
                values[
                  headerIndex.side_tilt_deg
                ]
              ),


            // CSV 전체 원본 데이터 저장

            raw_json:
              JSON.stringify(
                rawData
              )

          };


          // --------------------------------------------------
          // DB INSERT
          // --------------------------------------------------

          insertGrowthSample.run(
            growthData
          );


          importedCount++;

        }

      }
    );


  // Transaction 실행

  importTransaction();


  console.log(
    `   ✅ ${importedCount}개 데이터 Import 완료`
  );


  return importedCount;

}


// ============================================================
// 전체 Import 실행
// ============================================================

let totalImported =
  0;


for (
  const fileName of
  csvFiles
) {

  const count =
    importCsvFile(
      fileName
    );


  totalImported +=
    count;

}


// ============================================================
// 최종 DB 데이터 개수
// ============================================================

const totalCount =
  db.prepare(`
    SELECT COUNT(*) AS count
    FROM growth_samples
  `).get();


// ============================================================
// 완료
// ============================================================

console.log('');
console.log('============================================');
console.log('🎉 성장 데이터 CSV Import 완료');
console.log('============================================');

console.log(
  `📥 이번 Import 데이터: ${totalImported}개`
);

console.log(
  `🗄️ 현재 DB 전체 데이터: ${totalCount.count}개`
);

console.log('============================================');
console.log('');


// ============================================================
// DB 종료
// ============================================================

db.close();