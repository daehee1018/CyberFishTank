const Database = require('better-sqlite3');

const db = new Database('sensor.db');

console.log('============================================');
console.log('🗄️ SQLite 데이터베이스 시작');
console.log('============================================');

// ============================================================
// 센서 데이터 테이블 생성
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

console.log('============================================');
console.log('📁 DB 파일: sensor.db');
console.log('============================================');

db.close();