const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { exec, execFile } = require('child_process');
const Database = require('better-sqlite3');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();

// ============================================================
// CORS
//
// 프론트엔드(다른 도메인/포트)에서 로그인 쿠키를 주고받으려면
// origin을 '*'가 아닌 요청 origin 자체로 지정하고
// credentials를 허용해야 함.
//
// ALLOWED_ORIGINS 환경변수(콤마 구분)로 배포 도메인을 제한할 수 있음.
// 지정하지 않으면 요청 origin을 그대로 허용(개발 편의용).
// ============================================================

const allowedOrigins =
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, origin);
      return;
    }
    callback(new Error('CORS로 차단된 요청입니다.'));
  },
  credentials: true,
}));

// 기본 100kb로는 웹캠 프레임(base64 JPEG)을 못 받아서 늘려둔다.
app.use(express.json({ limit: '10mb' }));

// /api/*는 항상 최신 상태를 반영해야 한다 (로그인/물고기/카메라
// 설정 여부로 라우팅을 결정하는데, 브라우저가 오래된 응답을
// 캐시해서 보여주면 가입 직후 상태에 갇히는 버그가 생겼었다).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// ============================================================
// 로그인 세션
// ============================================================

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(session({
  name: 'cft.sid',
  secret: process.env.SESSION_SECRET || 'cyberfishtank-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));


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
// 계정 SQLite 데이터베이스
//
// sensor.db / database.sqlite와 별도 파일로 분리.
// (센서 DB는 이미 git에 커밋된 이력이 있어, 비밀번호 해시가
//  섞여 들어가지 않도록 계정 정보는 항상 별도 DB에 보관한다)
// ============================================================

const authDbPath = path.join(__dirname, 'auth.db');

const authDb = new Database(authDbPath);

console.log('');
console.log('============================================');
console.log('🔐 계정 SQLite 데이터베이스 연결');
console.log('============================================');
console.log(`📁 DB 위치: ${authDbPath}`);
console.log('============================================');

authDb.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    created_at TEXT NOT NULL
  )
`).run();

console.log('✅ users 테이블 확인 완료');

// 개인 센서 하드웨어(RP2040 등)가 계정을 식별할 때 쓰는 키.
// 로그인 세션과 달리 오래 켜져있는 장치용이라 만료 없는 고정 키로 둔다.
try {
  authDb.prepare('ALTER TABLE users ADD COLUMN sensor_key TEXT').run();
  console.log('✅ users.sensor_key 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}

// 물고기 선택처럼 카메라 연결도 필수 단계로 만들기 위한 플래그.
// admin(물리 어항 소유자)은 대상이 아니라 항상 완료 취급한다.
try {
  authDb.prepare('ALTER TABLE users ADD COLUMN camera_configured INTEGER DEFAULT 0').run();
  console.log('✅ users.camera_configured 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}
try {
  authDb.prepare(`UPDATE users SET camera_configured = 1 WHERE role = 'admin'`).run();
} catch (error) {
  console.error('❌ admin camera_configured 백필 오류:', error);
}

const getUserByUsernameStmt = authDb.prepare(`
  SELECT id, username, password_hash, role, camera_configured FROM users WHERE username = ?
`);

const getUserByIdStmt = authDb.prepare(`
  SELECT id, username, role, camera_configured FROM users WHERE id = ?
`);

const setCameraConfiguredStmt = authDb.prepare(`
  UPDATE users SET camera_configured = 1 WHERE id = ?
`);

const getUserBySensorKeyStmt = authDb.prepare(`
  SELECT id, username, role FROM users WHERE sensor_key = ?
`);

const getSensorKeyStmt = authDb.prepare(`
  SELECT sensor_key FROM users WHERE id = ?
`);

const setSensorKeyStmt = authDb.prepare(`
  UPDATE users SET sensor_key = ? WHERE id = ?
`);

const insertUserStmt = authDb.prepare(`
  INSERT INTO users (username, password_hash, role, created_at)
  VALUES (@username, @password_hash, @role, @created_at)
`);

const listUsersStmt = authDb.prepare(`
  SELECT id, username, role, created_at FROM users ORDER BY id ASC
`);

const deleteUserStmt = authDb.prepare(`
  DELETE FROM users WHERE id = ?
`);

const countAdminsStmt = authDb.prepare(`
  SELECT COUNT(*) AS count FROM users WHERE role = 'admin'
`);

// ============================================================
// 유저별 물고기(어항) 설정
//
// 유저마다 자신만의 물고기 종류/이름을 가짐.
// 센서/YOLO 데이터는 실제 물리 어항 하나를 공유하지만,
// 이 값은 로그인한 계정별로 개별 저장된다.
// ============================================================

authDb.prepare(`
  CREATE TABLE IF NOT EXISTS user_fish (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    species TEXT NOT NULL,
    fish_name TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`).run();

console.log('✅ user_fish 테이블 확인 완료');

// 색상 틴트(hue-rotate 각도) / 액세서리(이모지) 같은 가벼운
// 코스메틱 커스터마이징. AI 사진 변환(스타일 후보 선택)과는
// 별개로, 어떤 스프라이트를 쓰든 항상 위에 겹쳐 적용된다.
try {
  authDb.prepare('ALTER TABLE user_fish ADD COLUMN color_hue INTEGER NOT NULL DEFAULT 0').run();
  console.log('✅ user_fish.color_hue 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}

try {
  authDb.prepare("ALTER TABLE user_fish ADD COLUMN accessory TEXT NOT NULL DEFAULT ''").run();
  console.log('✅ user_fish.accessory 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}

// 어항 배경 테마(기본/밤/할로윈/크리스마스). 물고기가 아니라
// 어항 전체에 적용되지만, 계정별 설정이라 같은 테이블에 둔다.
try {
  authDb.prepare("ALTER TABLE user_fish ADD COLUMN tank_theme TEXT NOT NULL DEFAULT 'default'").run();
  console.log('✅ user_fish.tank_theme 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}

// 바닥재(자갈/모래) 색상. 실제 어항에서도 흔한 커스터마이징이라
// 새 이미지 없이 색상 프리셋만으로 구현한다.
try {
  authDb.prepare("ALTER TABLE user_fish ADD COLUMN substrate_color TEXT NOT NULL DEFAULT 'natural'").run();
  console.log('✅ user_fish.substrate_color 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}

// 현재 화면에 쓰이는 AI 생성 그래픽이 어느 폴더(fish_sprites/{userId}/{dir})에
// 있는지. 비어있으면 옛날 방식(fish_sprites/{userId}/ 바로 아래)을 그대로 쓴다.
try {
  authDb.prepare("ALTER TABLE user_fish ADD COLUMN active_graphic_dir TEXT NOT NULL DEFAULT ''").run();
  console.log('✅ user_fish.active_graphic_dir 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}

// 어항 장식(집/수초/동굴/구조물) 배치. 예전엔 브라우저
// localStorage에만 저장돼서 기기/브라우저를 바꾸면 안 보였다.
// JSON 배열을 그대로 문자열로 저장한다.
try {
  authDb.prepare("ALTER TABLE user_fish ADD COLUMN decorations_json TEXT NOT NULL DEFAULT '[]'").run();
  console.log('✅ user_fish.decorations_json 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}

// ============================================================
// 저장된 AI 물고기 그래픽 목록
//
// 예전엔 스타일을 새로 고를 때마다 fish_sprites/{userId}/를
// 덮어써서 이전 결과가 사라졌다. 이제 매번 새 폴더에 생성하고
// 이 테이블에 기록해서, 나중에 다시 골라 쓸 수 있게 한다.
// ============================================================

authDb.prepare(`
  CREATE TABLE IF NOT EXISTS fish_graphics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    style_name TEXT NOT NULL,
    dir_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

console.log('✅ fish_graphics 테이블 확인 완료');

const getUserFishStmt = authDb.prepare(`
  SELECT species, fish_name, color_hue, accessory, tank_theme, substrate_color, active_graphic_dir, decorations_json FROM user_fish WHERE user_id = ?
`);

const upsertUserFishStmt = authDb.prepare(`
  INSERT INTO user_fish (user_id, species, fish_name, updated_at)
  VALUES (@user_id, @species, @fish_name, @updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    species = excluded.species,
    fish_name = excluded.fish_name,
    updated_at = excluded.updated_at
`);

const updateUserFishAppearanceStmt = authDb.prepare(`
  UPDATE user_fish SET color_hue = @color_hue, accessory = @accessory WHERE user_id = @user_id
`);

const updateTankThemeStmt = authDb.prepare(`
  UPDATE user_fish SET tank_theme = @tank_theme WHERE user_id = @user_id
`);

const updateSubstrateColorStmt = authDb.prepare(`
  UPDATE user_fish SET substrate_color = @substrate_color WHERE user_id = @user_id
`);

const updateActiveGraphicDirStmt = authDb.prepare(`
  UPDATE user_fish SET active_graphic_dir = @active_graphic_dir WHERE user_id = @user_id
`);

const updateDecorationsStmt = authDb.prepare(`
  UPDATE user_fish SET decorations_json = @decorations_json WHERE user_id = @user_id
`);

const insertFishGraphicStmt = authDb.prepare(`
  INSERT INTO fish_graphics (user_id, style_name, dir_name, created_at)
  VALUES (@user_id, @style_name, @dir_name, @created_at)
`);

const listFishGraphicsStmt = authDb.prepare(`
  SELECT id, style_name, dir_name, created_at FROM fish_graphics
  WHERE user_id = ?
  ORDER BY id DESC
`);

const getFishGraphicStmt = authDb.prepare(`
  SELECT id, style_name, dir_name, created_at FROM fish_graphics
  WHERE id = ? AND user_id = ?
`);

const deleteFishGraphicStmt = authDb.prepare(`
  DELETE FROM fish_graphics WHERE id = ? AND user_id = ?
`);

const ACCESSORY_OPTIONS = ['', 'hat', 'crown', 'ribbon', 'sunglasses', 'flower'];
const TANK_THEME_OPTIONS = ['default', 'night', 'halloween', 'christmas'];
const SUBSTRATE_COLOR_OPTIONS = ['natural', 'white', 'black', 'pink', 'blue'];

// ============================================================
// 최초 실행 시 관리자 계정 자동 생성
//
// ADMIN_USERNAME / ADMIN_PASSWORD 환경변수로 지정 가능.
// 지정하지 않으면 admin / admin1234로 생성되며,
// 배포 시 반드시 환경변수로 바꾸거나 로그인 후 비밀번호를
// 변경해야 한다.
// ============================================================

function seedDefaultAdmin() {
  const existingAdminCount = countAdminsStmt.get().count;

  if (existingAdminCount > 0) {
    return;
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';

  insertUserStmt.run({
    username,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'admin',
    created_at: new Date().toISOString(),
  });

  console.log('');
  console.log('============================================');
  console.log('🔐 기본 관리자 계정 생성됨');
  console.log(`   아이디: ${username}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`   비밀번호: ${password} (기본값 - 로그인 후 반드시 변경하세요)`);
  }
  console.log('============================================');
}

seedDefaultAdmin();

// ============================================================
// 관리자 계정의 기본 물고기 데이터 보장
//
// 로그인 기능을 붙이기 전까지 앱이 전역으로 쓰던
// 기본 물고기(베타 / Nemo)를 관리자 계정 소유로 이관한다.
// ============================================================

function ensureAdminHasFishDefault() {
  const admin = getUserByUsernameStmt.get(process.env.ADMIN_USERNAME || 'admin');

  if (!admin || getUserFishStmt.get(admin.id)) {
    return;
  }

  upsertUserFishStmt.run({
    user_id: admin.id,
    species: 'betta',
    fish_name: 'Nemo',
    updated_at: new Date().toISOString(),
  });

  console.log('🐟 관리자 계정 기본 물고기(베타 / Nemo) 데이터 생성됨');
}

ensureAdminHasFishDefault();

// ============================================================
// 인증 미들웨어
// ============================================================

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    // 임시 진단 로그. 원인 찾히면 제거할 것.
    console.log(
      `🔍 [AUTH FAIL] ${req.method} ${req.originalUrl} | cookie-header=${req.headers.cookie ? 'O' : 'X'} | sessionID=${req.sessionID} | UA=${(req.headers['user-agent'] || '').slice(0, 60)}`
    );
    return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ success: false, error: '관리자만 접근할 수 있습니다.' });
  }
  next();
}

// 센서 장치(RP2040 등)용 인증. 브라우저 세션이 아니라
// X-Sensor-Key 헤더로 계정을 식별한다.
function requireSensorKey(req, res, next) {
  const key = req.header('X-Sensor-Key');

  if (!key) {
    return res.status(401).json({ success: false, error: '센서 키가 필요합니다.' });
  }

  const user = getUserBySensorKeyStmt.get(key);

  if (!user) {
    return res.status(401).json({ success: false, error: '유효하지 않은 센서 키입니다.' });
  }

  req.sensorUserId = user.id;
  next();
}

// ============================================================
// 인증 라우트
// ============================================================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' });
  }

  const user = getUserByUsernameStmt.get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      cameraConfigured: Boolean(user.camera_configured),
    },
  });
});

app.post('/api/signup', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' });
  }

  if (password.length < 4) {
    return res.status(400).json({ success: false, error: '비밀번호는 4자 이상이어야 합니다.' });
  }

  if (getUserByUsernameStmt.get(username)) {
    return res.status(409).json({ success: false, error: '이미 존재하는 아이디입니다.' });
  }

  // 자기 자신에게 admin 권한을 줄 수 없도록 회원가입은 항상 'user' 역할로 생성
  const result = insertUserStmt.run({
    username,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'user',
    created_at: new Date().toISOString(),
  });

  const userId = Number(result.lastInsertRowid);

  req.session.userId = userId;
  req.session.role = 'user';

  res.json({
    success: true,
    user: { id: userId, username, role: 'user', cameraConfigured: false },
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cft.sid');
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
  }

  const user = getUserByIdStmt.get(req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      cameraConfigured: Boolean(user.camera_configured),
    },
  });
});

// ============================================================
// 유저별 물고기 라우트
// ============================================================

app.get('/api/fish', requireAuth, (req, res) => {
  const row = getUserFishStmt.get(req.session.userId);

  let decorations = [];

  if (row?.decorations_json) {
    try {
      const parsed = JSON.parse(row.decorations_json);
      decorations = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      decorations = [];
    }
  }

  res.json({
    success: true,
    fish: row
      ? {
          species: row.species,
          fishName: row.fish_name,
          colorHue: row.color_hue,
          accessory: row.accessory,
          tankTheme: row.tank_theme,
          substrateColor: row.substrate_color,
          activeGraphicDir: row.active_graphic_dir,
          decorations,
        }
      : null,
  });
});

app.post('/api/fish', requireAuth, (req, res) => {
  const { species, fishName } = req.body || {};

  if (!species || !fishName) {
    return res.status(400).json({ success: false, error: '물고기 종류와 이름을 입력해주세요.' });
  }

  upsertUserFishStmt.run({
    user_id: req.session.userId,
    species,
    fish_name: fishName,
    updated_at: new Date().toISOString(),
  });

  res.json({ success: true, fish: { species, fishName } });
});

// ============================================================
// 물고기 색상 틴트 / 액세서리 (가벼운 코스메틱 커스터마이징)
//
// AI 사진 변환(스타일 후보 선택)과 별개로, 어떤 스프라이트를
// 쓰든 프론트에서 CSS로 겹쳐 적용한다. 물고기(species)를 먼저
// 선택해야 user_fish 행이 존재하므로, 그 전에는 저장할 수 없다.
// ============================================================

app.post('/api/fish/appearance', requireAuth, (req, res) => {
  const { colorHue, accessory } = req.body || {};

  const normalizedHue = Number(colorHue);

  if (!Number.isFinite(normalizedHue) || normalizedHue < 0 || normalizedHue > 360) {
    return res.status(400).json({ success: false, error: '색상 값이 올바르지 않습니다.' });
  }

  const normalizedAccessory = typeof accessory === 'string' ? accessory : '';

  if (!ACCESSORY_OPTIONS.includes(normalizedAccessory)) {
    return res.status(400).json({ success: false, error: '지원하지 않는 액세서리입니다.' });
  }

  const existing = getUserFishStmt.get(req.session.userId);

  if (!existing) {
    return res.status(400).json({ success: false, error: '먼저 물고기를 선택해주세요.' });
  }

  updateUserFishAppearanceStmt.run({
    user_id: req.session.userId,
    color_hue: Math.round(normalizedHue),
    accessory: normalizedAccessory,
  });

  res.json({
    success: true,
    fish: { colorHue: Math.round(normalizedHue), accessory: normalizedAccessory },
  });
});

// ============================================================
// 어항 배경 테마 (기본/밤/할로윈/크리스마스)
//
// 물고기가 아니라 어항 전체에 적용되는 설정이라 별도 엔드포인트로
// 분리한다. 마찬가지로 물고기를 먼저 선택해야 저장할 수 있다.
// ============================================================

app.post('/api/tank-theme', requireAuth, (req, res) => {
  const { theme } = req.body || {};

  if (!TANK_THEME_OPTIONS.includes(theme)) {
    return res.status(400).json({ success: false, error: '지원하지 않는 테마입니다.' });
  }

  const existing = getUserFishStmt.get(req.session.userId);

  if (!existing) {
    return res.status(400).json({ success: false, error: '먼저 물고기를 선택해주세요.' });
  }

  updateTankThemeStmt.run({
    user_id: req.session.userId,
    tank_theme: theme,
  });

  res.json({ success: true, tankTheme: theme });
});

// ============================================================
// 바닥재(자갈/모래) 색상
// ============================================================

app.post('/api/tank-substrate', requireAuth, (req, res) => {
  const { substrateColor } = req.body || {};

  if (!SUBSTRATE_COLOR_OPTIONS.includes(substrateColor)) {
    return res.status(400).json({ success: false, error: '지원하지 않는 바닥재 색상입니다.' });
  }

  const existing = getUserFishStmt.get(req.session.userId);

  if (!existing) {
    return res.status(400).json({ success: false, error: '먼저 물고기를 선택해주세요.' });
  }

  updateSubstrateColorStmt.run({
    user_id: req.session.userId,
    substrate_color: substrateColor,
  });

  res.json({ success: true, substrateColor });
});

// ============================================================
// 어항 장식(집/수초/동굴/구조물) 배치
//
// 예전엔 브라우저 localStorage에만 저장돼서 기기/브라우저를
// 바꾸면 안 보였다. 다른 코스메틱 설정과 마찬가지로 서버에
// 저장한다. 드래그/크기조절 중에는 매 프레임 저장하지 않고
// 클라이언트가 디바운스해서 보낸다.
// ============================================================

const MAX_DECORATIONS = 100;

app.post('/api/aquarium-decorations', requireAuth, (req, res) => {
  const { decorations } = req.body || {};

  if (!Array.isArray(decorations) || decorations.length > MAX_DECORATIONS) {
    return res.status(400).json({ success: false, error: '장식 데이터가 올바르지 않습니다.' });
  }

  const isValidDecoration = (item) =>
    item &&
    typeof item.id === 'string' &&
    typeof item.type === 'string' &&
    typeof item.src === 'string' &&
    Number.isFinite(item.x) &&
    Number.isFinite(item.y);

  if (!decorations.every(isValidDecoration)) {
    return res.status(400).json({ success: false, error: '장식 데이터가 올바르지 않습니다.' });
  }

  const existing = getUserFishStmt.get(req.session.userId);

  if (!existing) {
    return res.status(400).json({ success: false, error: '먼저 물고기를 선택해주세요.' });
  }

  updateDecorationsStmt.run({
    user_id: req.session.userId,
    decorations_json: JSON.stringify(decorations),
  });

  res.json({ success: true });
});

// ============================================================
// 계정별 웹캠 프레임 → AI 추론 서버(fish-ai, 127.0.0.1:5001) 중계
//
// 브라우저 → (여기) → fish_ai_server.py(YOLO 탐지/추적/자세) → 결과 저장 + 응답
// ============================================================

app.post('/api/camera/frame', requireAuth, async (req, res) => {
  const { image } = req.body || {};

  if (!image) {
    return res.status(400).json({ success: false, error: '이미지가 없습니다.' });
  }

  let result;

  try {
    const inferResponse = await fetch('http://127.0.0.1:5001/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: String(req.session.userId),
        image,
      }),
    });

    if (!inferResponse.ok) {
      return res.status(502).json({ success: false, error: 'AI 서버 응답 오류' });
    }

    result = await inferResponse.json();
  } catch (error) {
    console.error('❌ 카메라 프레임 추론 요청 실패:', error);
    return res.status(502).json({ success: false, error: 'AI 서버에 연결할 수 없습니다.' });
  }

  const fish = result?.fish;

  if (result?.success && fish) {
    const userId = req.session.userId;

    try {
      insertYoloDataForUser.run({
        timestamp: new Date().toISOString(),
        center_x: fish.center_norm?.[0] ?? null,
        center_y: fish.center_norm?.[1] ?? null,
        move_direction: fish.move_direction ?? null,
        pose_direction: fish.pose_direction ?? null,
        head_x: fish.keypoints?.head?.[0] ?? null,
        head_y: fish.keypoints?.head?.[1] ?? null,
        tail_x: fish.keypoints?.tail?.[0] ?? null,
        tail_y: fish.keypoints?.tail?.[1] ?? null,
        state: fish.state ?? null,
        abnormal: fish.abnormal ? 1 : 0,
        user_id: userId,
      });
    } catch (dbError) {
      console.error('❌ 개인 카메라 YOLO 데이터 저장 오류:', dbError);
    }

    // 성장(몸길이) 원본 샘플 저장. calculate_growth.cjs가 나중에
    // 이걸 모아서 daily_growth로 집계한다.
    if (
      Number.isFinite(fish.body_length_px) &&
      fish.pose_conf > 0 &&
      Array.isArray(fish.bbox)
    ) {
      const [x1, y1, x2, y2] = fish.bbox;

      saveGrowthSample({
        datetime: new Date().toISOString(),
        event_id: 0,
        body_length_px: fish.body_length_px,
        bbox_w: x2 - x1,
        bbox_h: y2 - y1,
        head_x: fish.keypoints?.head?.[0] ?? null,
        head_y: fish.keypoints?.head?.[1] ?? null,
        tail_x: fish.keypoints?.tail?.[0] ?? null,
        tail_y: fish.keypoints?.tail?.[1] ?? null,
        pose_conf: fish.pose_conf,
        side_tilt_deg: 0,
      }, userId);
    }

    // 배뒤집힘이 3분 이상 지속될 때만 알림 (그 외 이상행동은 알림 없음)
    handleAbnormalBehaviorAlert(
      userId,
      fish.abnormal ? fish.abnormal_reason : null
    );

    // 이 계정으로 로그인된 다른 기기(예: 폰)도 같은 데이터를 보게
    // /posi와 동일한 형태로 WebSocket 브로드캐스트한다.
    // AppContext가 owner_user_id로 필터링해서 본인 계정에만 적용한다.
    const broadcastMessage = JSON.stringify({
      owner_user_id: req.session.userId,
      center_norm: fish.center_norm ?? [0.5, 0.5],
      move_direction: fish.move_direction ?? 'none',
      pose_direction: fish.pose_direction ?? 'none',
      keypoints: {
        head: fish.keypoints?.head ?? [0.5, 0.5],
        tail: fish.keypoints?.tail ?? [0.5, 0.5],
      },
      state: fish.state ?? 'tracked',
      abnormal: Boolean(fish.abnormal),
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(broadcastMessage);
      }
    });
  }

  res.json(result);
});

// ============================================================
// 카메라 연결 완료 표시
//
// 물고기 선택처럼 카메라 연결도 필수 단계다. 브라우저에서
// getUserMedia로 실제 카메라 권한을 받은 뒤 이 엔드포인트를
// 호출하면, 이후로는 /select-fish처럼 이 단계를 다시 안 거친다.
// ============================================================

app.post('/api/camera/confirm-setup', requireAuth, (req, res) => {
  setCameraConfiguredStmt.run(req.session.userId);
  res.json({ success: true });
});

// ============================================================
// 개인 센서(RP2040 등) 연동 키
//
// 이 계정 소유의 센서 장치가 /api/sensor-data를 보낼 때
// X-Sensor-Key 헤더에 이 값을 넣어서 어느 계정 것인지 식별한다.
// ============================================================

app.get('/api/sensor-key', requireAuth, (req, res) => {
  let row = getSensorKeyStmt.get(req.session.userId);

  if (!row || !row.sensor_key) {
    const newKey = crypto.randomBytes(24).toString('hex');
    setSensorKeyStmt.run(newKey, req.session.userId);
    row = { sensor_key: newKey };
  }

  res.json({ success: true, sensorKey: row.sensor_key });
});

app.post('/api/sensor-key/rotate', requireAuth, (req, res) => {
  const newKey = crypto.randomBytes(24).toString('hex');
  setSensorKeyStmt.run(newKey, req.session.userId);
  res.json({ success: true, sensorKey: newKey });
});

// ============================================================
// 사용자 관리 라우트 (관리자 전용)
// ============================================================

app.get('/api/users', requireAdmin, (req, res) => {
  res.json({ success: true, users: listUsersStmt.all() });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};

  if (!username || !password || !['admin', 'user'].includes(role)) {
    return res.status(400).json({
      success: false,
      error: '아이디, 비밀번호, 역할(admin/user)을 모두 입력해주세요.',
    });
  }

  if (getUserByUsernameStmt.get(username)) {
    return res.status(409).json({ success: false, error: '이미 존재하는 아이디입니다.' });
  }

  const result = insertUserStmt.run({
    username,
    password_hash: bcrypt.hashSync(password, 10),
    role,
    created_at: new Date().toISOString(),
  });

  res.json({
    success: true,
    user: { id: Number(result.lastInsertRowid), username, role },
  });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const targetUser = getUserByIdStmt.get(targetId);

  if (!targetUser) {
    return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
  }

  if (targetId === req.session.userId) {
    return res.status(400).json({ success: false, error: '본인 계정은 삭제할 수 없습니다.' });
  }

  if (targetUser.role === 'admin' && countAdminsStmt.get().count <= 1) {
    return res.status(400).json({ success: false, error: '마지막 관리자 계정은 삭제할 수 없습니다.' });
  }

  deleteUserStmt.run(targetId);

  res.json({ success: true });
});

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
  console.log('🐟 자동 성장 데이터 계산 시작 (전체 계정)');
  console.log(`📅 대상 날짜: ${targetDate}`);
  console.log('============================================');

  const scriptPath =
    path.join(
      __dirname,
      'calculate_growth.cjs'
    );

  // 계정마다 각자 소유의 성장 샘플을 따로 집계한다.
  runScriptForAllUsers(scriptPath, targetDate, '성장');

}

// 등록된 모든 계정에 대해 순서대로(동시에 같은 DB 파일에
// 쓰지 않도록) 배치 스크립트를 실행한다.
function runScriptForAllUsers(scriptPath, targetDate, label) {

  const users = listUsersStmt.all();
  let index = 0;

  const runNext = () => {

    if (index >= users.length) {

      console.log(
        `✅ ${label} 계산 완료 (전체 ${users.length}개 계정)`
      );

      return;

    }

    const user = users[index];
    index += 1;

    execFile(
      'node',
      [scriptPath, targetDate, String(user.id)],
      (error, stdout, stderr) => {

        if (error) {

          console.error(
            `❌ ${label} 계산 실패 (계정: ${user.username}):`,
            error.message
          );

        } else {

          if (stderr) {
            console.error(`⚠️ ${label} 계산 경고 (계정: ${user.username}):`, stderr);
          }

          console.log(`--- ${label} 계산 (계정: ${user.username}) ---`);
          console.log(stdout);

        }

        runNext();

      }
    );

  };

  runNext();

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
    '🏊 자동 활동량 데이터 계산 시작 (전체 계정)'
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


  // 계정마다 각자 소유의 yolo_data를 따로 집계한다.
  runScriptForAllUsers(scriptPath, targetDate, '활동량');

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

// 계정별 센서 하드웨어 분리를 위해 user_id 추가.
// 기존(admin 물리 센서) 데이터는 admin 계정으로 이전한다.
const sensorMigrationAdmin =
  getUserByUsernameStmt.get(process.env.ADMIN_USERNAME || 'admin');
const sensorMigrationAdminId =
  sensorMigrationAdmin ? sensorMigrationAdmin.id : null;

try {
  db.prepare('ALTER TABLE sensor_data ADD COLUMN user_id INTEGER').run();
  console.log('✅ sensor_data.user_id 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}
try {
  db.prepare('UPDATE sensor_data SET user_id = ? WHERE user_id IS NULL')
    .run(sensorMigrationAdminId);
} catch (error) {
  console.error('❌ sensor_data user_id 백필 오류:', error);
}

// ============================================================
// 알람 데이터 테이블 추가 (sensor.db)
// ============================================================
db.prepare(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    time TEXT NOT NULL,
    detail TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

try {
  db.prepare('ALTER TABLE alerts ADD COLUMN user_id INTEGER').run();
  console.log('✅ alerts.user_id 컬럼 추가됨');
} catch (error) {
  // 이미 있으면 예외. 정상 상황.
}
try {
  db.prepare('UPDATE alerts SET user_id = ? WHERE user_id IS NULL')
    .run(sensorMigrationAdminId);
} catch (error) {
  console.error('❌ alerts user_id 백필 오류:', error);
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS alert_processing_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sensor_id INTEGER NOT NULL DEFAULT 0
  )
`).run();

db.prepare(`
  INSERT OR IGNORE INTO alert_processing_state (id, last_sensor_id)
  VALUES (1, 0)
`).run();

console.log('✅ alerts 테이블 확인 완료');

const insertAlertStmt = db.prepare(`
  INSERT INTO alerts (title, time, detail, type, created_at, user_id)
  VALUES (@title, @time, @detail, @type, @created_at, @user_id)
`);

const getLastProcessedSensorIdStmt = db.prepare(`
  SELECT last_sensor_id
  FROM alert_processing_state
  WHERE id = 1
`);

const updateLastProcessedSensorIdStmt = db.prepare(`
  UPDATE alert_processing_state
  SET last_sensor_id = ?
  WHERE id = 1
`);

const getLatestAlertByTypeStmt = db.prepare(`
  SELECT id, title, time, detail, type
  FROM alerts
  WHERE type = ? AND user_id = ?
  ORDER BY id DESC
  LIMIT 1
`);

// ============================================================
// 알람 디바운싱(쿨다운)
//
// 기본은 5분이지만, 다 같은 무게가 아니다. 수온/pH는 살짝
// 벗어난 채로 몇 시간씩 유지되는 일이 흔한데 5분마다 계속
// 재알림하면(실측: 하루 7시간 만에 최근 100개 알림 한도를
// 다 채워버려 정작 오래된 기록이 안 보이는 문제가 생겼다)
// 정작 중요한 배뒤집힘/수위저하/물갈이 알림이 묻힌다. 중요도가
// 낮은 타입은 쿨다운을 길게, 급한 타입은 짧게 유지한다.
// ============================================================
const ALERT_COOLDOWN = 5 * 60 * 1000;

const ALERT_COOLDOWN_OVERRIDES = {
  // 수온/pH: 응급 상황이 아니라 서서히 벗어나는 값이라, 벗어난
  // 상태가 지속돼도 1시간에 한 번만 다시 알린다.
  'temperature-increase': 60 * 60 * 1000,
  'temperature-decrease': 60 * 60 * 1000,
  'ph-increase': 60 * 60 * 1000,
  'ph-decrease': 60 * 60 * 1000,
  // 물갈이 권장: 센서 저장 주기(10분)마다 "위험" 지속 스트릭이
  // 계속 조건을 만족해서 createAlertIfAllowed가 계속 불리는데,
  // 기본 쿨다운(5분)은 10분보다 짧아 매번 통과돼 버린다 —
  // 그대로 두면 물갈이 안 해도 10분마다 계속 알림이 쌓인다.
  // 한 번 알렸으면 6시간은 다시 안 알린다.
  'water-quality-warning': 6 * 60 * 60 * 1000,
  // 수위저하/배뒤집힘은 응급이라 기본값(5분) 그대로 빠르게 유지한다.
};

function getAlertCooldown(type) {
  return ALERT_COOLDOWN_OVERRIDES[type] ?? ALERT_COOLDOWN;
}

const lastAlertTimeByType = new Map();

const findRecentAlertStmt = db.prepare(`
  SELECT id, created_at
  FROM alerts
  WHERE type = ?
    AND user_id = ?
    AND created_at >= ?
  ORDER BY id DESC
  LIMIT 1
`);

// 최근 알람 조회 성능을 위한 인덱스
// 기존 alerts 테이블이 있어도 안전하게 추가됨.
db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_alerts_type_created_at
  ON alerts (type, created_at)
`).run();

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

// 계정별 웹캠 연동(카메라 선택 기능)을 위해 user_id 컬럼을 추가한다.
// 기존 물리 어항 데이터는 user_id가 NULL로 남아 공용으로 취급된다.
try {
  yoloDb.prepare('ALTER TABLE yolo_data ADD COLUMN user_id INTEGER').run();
  console.log('✅ yolo_data.user_id 컬럼 추가됨');
} catch (error) {
  // 이미 컬럼이 있으면 SQLite가 예외를 던진다. 정상 상황이므로 무시.
}

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
// 계정별 성장/활동량 데이터 분리 마이그레이션
//
// 지금까지 이 프로젝트는 물리 어항 하나만 다뤄서
// growth_samples / daily_growth / daily_activity가 전부
// 계정 구분 없이 저장됐다. 이제 계정마다 카메라를 붙일 수
// 있으므로, 기존 데이터는 전부 admin(물리 어항 소유자) 것으로
// 이전하고 앞으로는 user_id로 나눈다.
// ============================================================

const migrationAdminUser =
  getUserByUsernameStmt.get(process.env.ADMIN_USERNAME || 'admin');
const migrationAdminId =
  migrationAdminUser ? migrationAdminUser.id : null;

// yolo_data: 컬럼은 이미 위에서 추가했다. 기존(물리 어항) 행만
// 소유자가 비어있으므로 admin으로 채운다.
try {
  yoloDb.prepare('UPDATE yolo_data SET user_id = ? WHERE user_id IS NULL').run(migrationAdminId);
} catch (error) {
  console.error('❌ yolo_data user_id 백필 오류:', error);
}

// growth_samples: user_id 컬럼 추가 + 기존 데이터 admin으로 백필
try {
  yoloDb.prepare('ALTER TABLE growth_samples ADD COLUMN user_id INTEGER').run();
  console.log('✅ growth_samples.user_id 컬럼 추가됨');
} catch (error) {
  // 이미 컬럼이 있으면 예외. 정상 상황.
}
try {
  yoloDb.prepare('UPDATE growth_samples SET user_id = ? WHERE user_id IS NULL').run(migrationAdminId);
} catch (error) {
  console.error('❌ growth_samples user_id 백필 오류:', error);
}

// date UNIQUE 였던 daily_growth / daily_activity를
// (date, user_id) UNIQUE로 재구성한다. SQLite는 제약조건을
// 직접 못 바꿔서 테이블을 새로 만들고 데이터를 옮긴다.
function migrateDailySummaryTableToPerUser(tableName, createSql) {
  const columns = yoloDb.prepare(`PRAGMA table_info(${tableName})`).all();

  if (columns.length === 0) {
    // 테이블이 아직 없으면(최초 실행) 새 스키마로 바로 생성
    yoloDb.prepare(createSql).run();
    return;
  }

  if (columns.some((c) => c.name === 'user_id')) {
    // 이미 마이그레이션됨
    return;
  }

  console.log(`🔧 ${tableName} 테이블을 계정별 구조로 마이그레이션 중...`);

  const oldColumnNames = columns.map((c) => c.name).join(', ');

  yoloDb.prepare(`ALTER TABLE ${tableName} RENAME TO ${tableName}_old_singleuser`).run();
  yoloDb.prepare(createSql).run();
  yoloDb.prepare(`
    INSERT INTO ${tableName} (${oldColumnNames}, user_id)
    SELECT ${oldColumnNames}, ? FROM ${tableName}_old_singleuser
  `).run(migrationAdminId);
  yoloDb.prepare(`DROP TABLE ${tableName}_old_singleuser`).run();

  console.log(`✅ ${tableName} 마이그레이션 완료 (기존 데이터는 admin 계정 소유로 이전됨)`);
}

// ============================================================
// 일일 성장 Summary 테이블
//
// 하루 최종 대표 성장값 저장
// ============================================================

const DAILY_GROWTH_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS daily_growth (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    date TEXT NOT NULL,

    user_id INTEGER,

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

    calculated_at TEXT NOT NULL,

    UNIQUE(date, user_id)

  )
`;

migrateDailySummaryTableToPerUser('daily_growth', DAILY_GROWTH_CREATE_SQL);

console.log('✅ daily_growth 테이블 확인 완료');

// daily_activity는 calculate_activity.cjs가 만들지만, 이미 존재하는
// (물리 어항 시절) 테이블이면 여기서도 계정별 구조로 옮겨준다.
const DAILY_ACTIVITY_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS daily_activity (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    date TEXT NOT NULL,

    user_id INTEGER,

    total_distance REAL,

    total_distance_px REAL,

    total_distance_cm REAL,

    average_speed REAL,

    max_speed REAL,

    raw_sample_count INTEGER DEFAULT 0,

    used_sample_count INTEGER DEFAULT 0,

    rejected_noise_count INTEGER DEFAULT 0,

    rejected_gap_count INTEGER DEFAULT 0,

    rejected_speed_count INTEGER DEFAULT 0,

    quality_flag TEXT,

    model_version TEXT,

    calculated_at TEXT NOT NULL,

    UNIQUE(date, user_id)

  )
`;

migrateDailySummaryTableToPerUser('daily_activity', DAILY_ACTIVITY_CREATE_SQL);

console.log('✅ daily_activity 테이블 확인 완료');


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
  requireAuth,
  (req, res) => {

    const {
      selectedStyle
    } = req.body;

    if (!selectedStyle) {

      return res.status(400).json({
        error: '선택된 스타일이 없습니다.'
      });

    }

    // 경로 조작(path traversal) 방지: 파일명만 사용
    const safeStyleName = path.basename(selectedStyle);

    const inputPath =
      path.join(
        __dirname,
        'public',
        'fish_10_candidates',
        safeStyleName
      );

    // 예전엔 fish_sprites/{userId}/를 매번 덮어써서 이전에 만든
    // 그래픽이 사라졌다. 이제 매번 새 폴더(타임스탬프)에 생성해서
    // fish_graphics 테이블에 기록해두고, 나중에 다시 골라 쓸 수
    // 있게 한다.
    const dirName = `${Date.now()}_${safeStyleName.replace(/\.png$/i, '')}`;

    const outDir =
      path.join(
        __dirname,
        'public',
        'fish_sprites',
        String(req.session.userId),
        dirName
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

        const userId = req.session.userId;
        const nowIso = new Date().toISOString();

        const result = insertFishGraphicStmt.run({
          user_id: userId,
          style_name: safeStyleName,
          dir_name: dirName,
          created_at: nowIso,
        });

        // 물고기(species)를 아직 선택 안 한 계정은 user_fish 행이
        // 없을 수 있다 — 그 경우 "활성 그래픽"만 못 정할 뿐, 생성
        // 자체와 목록 기록은 그대로 성공 처리한다.
        if (getUserFishStmt.get(userId)) {
          updateActiveGraphicDirStmt.run({
            user_id: userId,
            active_graphic_dir: dirName,
          });
        }

        return res.json({
          success: true,
          graphic: {
            id: Number(result.lastInsertRowid),
            styleName: safeStyleName,
            dirName,
            createdAt: nowIso,
          },
        });

      }
    );

  }
);

// ============================================================
// 저장된 AI 물고기 그래픽 목록 / 선택 / 삭제
// ============================================================

// dir_name=''은 "버전 폴더 없이 쓰는 상태"를 뜻한다 — 이 기능
// (버전 관리) 이전에 개인 그래픽을 만들어뒀다면
// fish_sprites/{userId}/fish_right.png가 실제로 있어서 그걸
// 보여주고, 한 번도 만든 적 없으면 Fish2D가 알아서 사이트
// 공용 기본 이미지로 대체한다. 어느 쪽이든 "선택 가능한 항목"
// 으로 목록에 항상 하나는 있어야 사용자가 원래대로 되돌릴 수
// 있어서, 파일 존재 여부와 무관하게 dir_name='' 행을 보장해준다.
function ensureDefaultGraphicRecorded(userId) {
  const alreadyRecorded = authDb
    .prepare(`SELECT id FROM fish_graphics WHERE user_id = ? AND dir_name = ''`)
    .get(userId);

  if (alreadyRecorded) {
    return;
  }

  const legacyImagePath = path.join(
    __dirname,
    'public',
    'fish_sprites',
    String(userId),
    'fish_right.png'
  );

  const createdAt = fs.existsSync(legacyImagePath)
    ? fs.statSync(legacyImagePath).mtime.toISOString()
    : new Date(0).toISOString();

  insertFishGraphicStmt.run({
    user_id: userId,
    style_name: '기본 그래픽',
    dir_name: '',
    created_at: createdAt,
  });
}

app.get('/api/fish/graphics', requireAuth, (req, res) => {
  ensureDefaultGraphicRecorded(req.session.userId);

  const rows = listFishGraphicsStmt.all(req.session.userId);

  res.json({
    success: true,
    graphics: rows.map((row) => ({
      id: row.id,
      styleName: row.style_name,
      dirName: row.dir_name,
      createdAt: row.created_at,
    })),
  });
});

app.post('/api/fish/graphics/select', requireAuth, (req, res) => {
  const { graphicId } = req.body || {};

  const graphic = getFishGraphicStmt.get(Number(graphicId), req.session.userId);

  if (!graphic) {
    return res.status(404).json({ success: false, error: '그래픽을 찾을 수 없습니다.' });
  }

  if (!getUserFishStmt.get(req.session.userId)) {
    return res.status(400).json({ success: false, error: '먼저 물고기를 선택해주세요.' });
  }

  updateActiveGraphicDirStmt.run({
    user_id: req.session.userId,
    active_graphic_dir: graphic.dir_name,
  });

  res.json({ success: true, activeGraphicDir: graphic.dir_name });
});

app.delete('/api/fish/graphics/:id', requireAuth, (req, res) => {
  const graphic = getFishGraphicStmt.get(Number(req.params.id), req.session.userId);

  if (!graphic) {
    return res.status(404).json({ success: false, error: '그래픽을 찾을 수 없습니다.' });
  }

  deleteFishGraphicStmt.run(graphic.id, req.session.userId);

  const userSpriteDir = path.join(
    __dirname,
    'public',
    'fish_sprites',
    String(req.session.userId)
  );

  if (graphic.dir_name) {
    // 버전 폴더라 그 폴더만 통째로 지워도 안전하다.
    fs.rm(path.join(userSpriteDir, graphic.dir_name), { recursive: true, force: true }, (error) => {
      if (error) {
        console.error('❌ 그래픽 폴더 삭제 실패:', error);
      }
    });
  } else {
    // "기존 그래픽"(dir_name='')은 fish_sprites/{userId}/ 바로
    // 아래 흩어져 있는 파일들이다. 이 디렉터리엔 다른 버전
    // 폴더들도 같이 들어있으니, 디렉터리 자체를 지우면 안 되고
    // 느슨한 png 파일들만 골라서 지운다.
    fs.readdir(userSpriteDir, { withFileTypes: true }, (error, entries) => {
      if (error) {
        console.error('❌ 기존 그래픽 파일 조회 실패:', error);
        return;
      }

      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .forEach((entry) => {
          fs.unlink(path.join(userSpriteDir, entry.name), (unlinkError) => {
            if (unlinkError) {
              console.error('❌ 기존 그래픽 파일 삭제 실패:', unlinkError);
            }
          });
        });
    });
  }

  // 지금 쓰고 있던 그래픽을 지웠으면 기본값(옛날 방식 경로)으로 되돌린다.
  const userFishRow = getUserFishStmt.get(req.session.userId);

  if (userFishRow?.active_graphic_dir === graphic.dir_name) {
    updateActiveGraphicDirStmt.run({
      user_id: req.session.userId,
      active_graphic_dir: '',
    });
  }

  res.json({ success: true });
});


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


// 계정별로 따로 관리한다 (계정마다 자기 센서 하드웨어를 가질 수 있음).

// 계정별 마지막 DB 저장 시간
const lastSensorSaveTimeByUser = new Map();

// 계정별로 10분 동안 들어온 데이터 중 가장 최신 데이터를 임시 보관
const pendingSensorDataByUser = new Map();


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

      water_level_detected,

      user_id

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

      @water_level_detected,

      @user_id

    )
  `);

// ============================================================
// YOLO 데이터 INSERT SQL
//
// 물리 어항(/posi, admin 소유)과 개인 카메라(/api/camera/frame) 모두
// 이 문 하나로 저장하고, user_id로 소유 계정을 구분한다.
// ============================================================

const insertYoloDataForUser =
  yoloDb.prepare(`
    INSERT INTO yolo_data (
      timestamp, center_x, center_y, move_direction, pose_direction,
      head_x, head_y, tail_x, tail_y, state, abnormal, user_id
    )
    VALUES (
      @timestamp, @center_x, @center_y, @move_direction, @pose_direction,
      @head_x, @head_y, @tail_x, @tail_y, @state, @abnormal, @user_id
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

        raw_json,

        user_id

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

        @raw_json,

        @user_id

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
    growthSample,
    userId
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
            ),

          user_id:
            userId ?? null

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
  targetDate,
  userId
) {

  // ----------------------------------------------------------
  // 해당 날짜 Raw Sample 조회 (계정별)
  // ----------------------------------------------------------

  const rawSamples =
    yoloDb.prepare(`
      SELECT
        *
      FROM
        growth_samples
      WHERE
        date = ?
        AND user_id = ?
      ORDER BY
        sample_datetime ASC
    `).all(
      targetDate,
      userId
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

      user_id:
        userId,

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

    user_id:
      userId,

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

        user_id,

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

        @user_id,

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

      ON CONFLICT(date, user_id)

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

function saveSensorData(data, userId) {

  try {

    const result =
      insertSensorData.run({
        ...data,
        user_id: userId,
      });


    lastSensorSaveTimeByUser.set(
      userId,
      Date.now()
    );

    handlePollutionAlert(
      userId,
      data.turbidity_voltage,
      data.tds
    );


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

function formatAlertTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 이상행동 중 "배뒤집힘"만 알림 대상이고, 그마저도 3분 이상
// 연속으로 지속될 때만 울린다 (놓침/급가속/저활동은 알림 없음).
const FLIPPED_POSE_ALERT_DURATION = 3 * 60 * 1000;
const flippedPoseSinceByUser = new Map();

function handleAbnormalBehaviorAlert(userId, abnormalReason) {
  if (abnormalReason !== 'flipped_pose') {
    flippedPoseSinceByUser.delete(userId);
    return;
  }

  const now = Date.now();
  const startedAt = flippedPoseSinceByUser.get(userId);

  if (startedAt === undefined) {
    flippedPoseSinceByUser.set(userId, now);
    return;
  }

  if (now - startedAt >= FLIPPED_POSE_ALERT_DURATION) {
    createAlertIfAllowed({
      type: 'fish-flipped-pose',
      title: '배뒤집힘 지속 경고',
      detail: '물고기가 3분 이상 뒤집힌 자세로 감지되고 있습니다.',
      eventTime: new Date().toISOString(),
      userId
    });
  }
}

// ============================================================
// 물갈이 추천 알림
//
// 대시보드의 오염도 미리보기(정상/주의/위험)와 같은 z-score
// 기준을 서버에서도 계산해서, "위험" 등급이 한 번이 아니라
// 어느 정도 지속될 때만 알림을 남긴다. 센서 저장 주기가
// 10분이라 3번 연속(30분)으로 잡는다 — flipped_pose(3분)보다
// 훨씬 느슨한 건, 수질 변화는 자세 이상보다 천천히 움직이는
// 신호라서다.
// ============================================================

const POLLUTION_ALERT_SUSTAINED_SAVES = 3;
const pollutionDangerStreakByUser = new Map();

function handlePollutionAlert(userId, turbidityVoltage, tds) {
  const { baseline } = computePollutionBaseline(userId);

  if (!baseline) {
    pollutionDangerStreakByUser.delete(userId);
    return;
  }

  const severity = computePollutionSeverity(baseline, turbidityVoltage, tds);

  if (severity !== 2) {
    pollutionDangerStreakByUser.delete(userId);
    return;
  }

  const streak = (pollutionDangerStreakByUser.get(userId) || 0) + 1;
  pollutionDangerStreakByUser.set(userId, streak);

  if (streak >= POLLUTION_ALERT_SUSTAINED_SAVES) {
    createAlertIfAllowed({
      type: 'water-quality-warning',
      title: '물갈이 권장',
      detail: '탁도/TDS가 평소보다 크게 벗어난 상태가 계속되고 있습니다. 물갈이를 권장합니다.',
      eventTime: new Date().toISOString(),
      userId
    });
  }
}

function createAlertIfAllowed({
  title,
  detail,
  type,
  eventTime,
  userId,
  skipCooldown = false
}) {
  const eventDate = new Date(eventTime);
  const eventTimeMs = eventDate.getTime();

  if (!Number.isFinite(eventTimeMs)) {
    return null;
  }

  // 디바운스/조회는 계정별로 나눠야 서로 안 섞인다.
  const debounceKey = `${userId}:${type}`;
  const cooldown = getAlertCooldown(type);

  if (!skipCooldown) {

    // ============================================================
    // 1. 메모리 기반 디바운싱
    // ============================================================

    const lastMemoryTime = lastAlertTimeByType.get(debounceKey);

    if (
      lastMemoryTime !== undefined &&
      eventTimeMs - lastMemoryTime < cooldown
    ) {
      return null;
    }

    // ============================================================
    // 2. DB 기반 디바운싱
    // 서버 재시작 후에도 중복 방지
    // ============================================================

    const latestAlert = getLatestAlertByTypeStmt.get(type, userId);

    if (latestAlert) {
      const latestTimeMs = new Date(latestAlert.time).getTime();

      if (
        Number.isFinite(latestTimeMs) &&
        eventTimeMs >= latestTimeMs &&
        eventTimeMs - latestTimeMs < cooldown
      ) {
        lastAlertTimeByType.set(debounceKey, latestTimeMs);
        return null;
      }
    }

  }

  // ============================================================
  // 3. 알람 저장
  // ============================================================

  const formattedTime = formatAlertTime(eventDate);

  const result = insertAlertStmt.run({
    title,
    time: formattedTime,
    detail,
    type,
    created_at: new Date().toISOString(),
    user_id: userId
  });

  const newAlert = {
    id: Number(result.lastInsertRowid),
    title,
    time: formattedTime,
    detail,
    type
  };

  lastAlertTimeByType.set(debounceKey, eventTimeMs);

  // ============================================================
  // 4. WebSocket 브로드캐스트 (본인 계정에만 적용되도록 owner 포함)
  // ============================================================

  const alertMessage = JSON.stringify({
    type: 'alert',
    owner_user_id: userId,
    alert: newAlert
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(alertMessage);
    }
  });

  return newAlert;
}

function evaluateSensorAlert(sensorData, userId) {
  const eventTime = sensorData.timestamp || new Date().toISOString();

  const temperature =
  sensorData.temperature === null ||
  sensorData.temperature === undefined
    ? NaN
    : Number(sensorData.temperature);

  const ph =
    sensorData.ph === null ||
    sensorData.ph === undefined
      ? NaN
      : Number(sensorData.ph);

  const waterLevel =
    sensorData.water_level_detected === null ||
    sensorData.water_level_detected === undefined ||
    sensorData.water_level_detected === ''
      ? NaN
      : Number(sensorData.water_level_detected);

  // ============================================================
  // 수온
  // ============================================================

  if (Number.isFinite(temperature)) {
    if (temperature > 26) {
      createAlertIfAllowed({
        type: 'temperature-increase',
        title: '수온 상승 경고',
        detail: '수온이/가 기준에서 벗어났습니다. 적정 기준: 24 ~ 26도',
        eventTime,
        userId
      });
    } else if (temperature < 24) {
      createAlertIfAllowed({
        type: 'temperature-decrease',
        title: '수온 저하 경고',
        detail: '수온이/가 기준에서 벗어났습니다. 적정 기준: 24 ~ 26도',
        eventTime,
        userId
      });
    }
  }

  // ============================================================
  // pH
  // ============================================================

  if (Number.isFinite(ph)) {
    if (ph > 7) {
      createAlertIfAllowed({
        type: 'ph-increase',
        title: 'pH 상승 경고',
        detail: 'pH이/가 기준에서 벗어났습니다. 적정 기준: 6 ~ 7',
        eventTime,
        userId
      });
    } else if (ph < 6) {
      createAlertIfAllowed({
        type: 'ph-decrease',
        title: 'pH 하락 경고',
        detail: 'pH이/가 기준에서 벗어났습니다. 적정 기준: 6 ~ 7',
        eventTime,
        userId
      });
    }
  }

  // ============================================================
  // 수위
  // ============================================================

  if (
    Number.isFinite(waterLevel) &&
    waterLevel === 0
  ) {
    createAlertIfAllowed({
      type: 'water-decrease',
      title: '수위 저하 경고',
      detail: '수위가 기준보다 낮습니다.',
      eventTime,
      userId
    });
  }
}

function processStoredSensorAlerts() {
  try {
    // ============================================================
    // 마지막 처리 ID 조회
    // ============================================================

    const state = getLastProcessedSensorIdStmt.get();

    const lastSensorId = state
      ? Number(state.last_sensor_id)
      : 0;

    // ============================================================
    // 아직 처리하지 않은 센서 데이터 조회
    // ============================================================

    const rows = db.prepare(`
      SELECT
        id,
        timestamp,
        temperature,
        ph,
        water_level_detected,
        user_id
      FROM sensor_data
      WHERE id > ?
      ORDER BY id ASC
    `).all(lastSensorId);

    if (rows.length === 0) {
      console.log('ℹ️ 처리할 과거 센서 데이터가 없습니다.');
      return;
    }

    console.log(
      `🔍 과거 센서 데이터 ${rows.length}개 알람 검사 시작`
    );

    let latestProcessedId = lastSensorId;

    // ============================================================
    // 시간 순서대로 알람 검사
    // ============================================================

    for (const row of rows) {
      evaluateSensorAlert({
        timestamp: row.timestamp,
        temperature: row.temperature,
        ph: row.ph,
        water_level_detected:
          row.water_level_detected
      }, row.user_id);

      latestProcessedId = Number(row.id);
    }

    // ============================================================
    // 마지막 처리 ID 저장
    // ============================================================

    updateLastProcessedSensorIdStmt.run(
      latestProcessedId
    );

    console.log(
      `✅ 과거 센서 데이터 알람 처리 완료 (ID: ${latestProcessedId})`
    );

  } catch (error) {
    console.error(
      '❌ 과거 센서 알람 처리 오류:',
      error
    );
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
  requireSensorKey,
  (req, res) => {

    try {

      const userId = req.sensorUserId;

      const sensorData =
        normalizeSensorData(
          req.body
        );

      evaluateSensorAlert(sensorData, userId);

      // --------------------------------------------------------
      // 서버에는 보정된 센서 데이터 표시
      // --------------------------------------------------------

      /*
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
      */

      // --------------------------------------------------------
      // 항상 가장 최근 데이터로 교체
      //
      // 3초마다 들어오는 데이터 중
      // 가장 최신 데이터만 유지
      // --------------------------------------------------------

      pendingSensorDataByUser.set(
        userId,
        sensorData
      );

      // --------------------------------------------------------
      // WebSocket으로 최신 센서 데이터 전송
      //
      // Python
      //   ↓
      // Node.js
      //   ↓
      // WebSocket
      //   ↓
      // React AppContext
      //
      // DB 저장 주기와 관계없이
      // 센서가 들어올 때마다 최신 데이터를 전송
      // owner_user_id를 넣어서 본인 계정에만 반영되게 한다.
      // --------------------------------------------------------

      const sensorMessage =
        JSON.stringify({
          ...sensorData,
          owner_user_id: userId,
        });


      wss.clients.forEach(
        client => {

          if (
            client.readyState ===
            WebSocket.OPEN
          ) {

            client.send(
              sensorMessage
            );

          }

        }
      );

      // --------------------------------------------------------
      // DB 저장 여부 확인 (계정별)
      // --------------------------------------------------------

      const now =
        Date.now();

      const lastSaveTime =
        lastSensorSaveTimeByUser.get(userId) || 0;

      const elapsed =
        now -
        lastSaveTime;

      const pendingForUser =
        pendingSensorDataByUser.get(userId);


      // --------------------------------------------------------
      // 이 계정의 첫 번째 데이터라면 즉시 저장
      // --------------------------------------------------------

      if (
        lastSaveTime === 0
      ) {

        const savedSensorId =
          saveSensorData(
            pendingForUser,
            userId
          );

        if (savedSensorId !== null) {

          updateLastProcessedSensorIdStmt.run(
            Number(savedSensorId)
          );

        }

        pendingSensorDataByUser.delete(userId);

      }


      // --------------------------------------------------------
      // 마지막 저장 후 10분이 지났다면 저장
      // --------------------------------------------------------

      else if (
        elapsed >=
        SENSOR_SAVE_INTERVAL
      ) {

        if (
          pendingForUser
        ) {

          const savedSensorId =
            saveSensorData(
              pendingForUser,
              userId
            );

          if (
            savedSensorId !== null
          ) {

            updateLastProcessedSensorIdStmt.run(
              Number(savedSensorId)
            );

          }

          pendingSensorDataByUser.delete(userId);

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
  requireAuth,
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

          WHERE user_id = ?

          ORDER BY timestamp ASC

        `).all(req.session.userId);


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
  requireAuth,
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

          WHERE user_id = ?

          ORDER BY timestamp DESC

          LIMIT 1

        `).get(req.session.userId);


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
// 오염도 판정용 기준선 (탁도/TDS)
//
// 절대 기준값(예: "TDS 150ppm 이상은 위험")은 이 센서의 실제
// 캘리브레이션을 모르는 상태에서는 근거가 없다. 대신 이 어항
// 자체의 전체 이력 평균/표준편차를 기준선으로 삼아 "평소보다
// 얼마나 벗어났는지"로 오염도를 상대평가한다.
// ============================================================

const POLLUTION_BASELINE_MIN_SAMPLES = 20;

// 알림 시스템(서버)과 대시보드 미리보기(클라이언트)가 같은 기준선을
// 써야 하므로 쿼리를 함수로 분리해서 공유한다.
function computePollutionBaseline(userId) {
  const row =
    db.prepare(`
      SELECT
        COUNT(*) AS sample_count,
        AVG(turbidity_voltage) AS turbidity_mean,
        AVG(turbidity_voltage * turbidity_voltage) AS turbidity_sq_mean,
        AVG(tds) AS tds_mean,
        AVG(tds * tds) AS tds_sq_mean
      FROM sensor_data
      WHERE user_id = ?
    `).get(userId);

  const sampleCount = row?.sample_count || 0;

  if (sampleCount < POLLUTION_BASELINE_MIN_SAMPLES) {
    return { sampleCount, baseline: null };
  }

  const turbidityVariance =
    Math.max(0, row.turbidity_sq_mean - row.turbidity_mean ** 2);

  const tdsVariance =
    Math.max(0, row.tds_sq_mean - row.tds_mean ** 2);

  return {
    sampleCount,
    baseline: {
      turbidity: {
        mean: row.turbidity_mean,
        std: Math.sqrt(turbidityVariance),
      },
      tds: {
        mean: row.tds_mean,
        std: Math.sqrt(tdsVariance),
      },
    },
  };
}

// 클라이언트(Dashboard)의 z-score → 오염도 등급 판정과 동일한
// 공식. 서버 알림도 같은 기준으로 판단해야 앱에 보이는 표시와
// 실제로 알림이 뜨는 조건이 어긋나지 않는다.
function computePollutionSeverity(baseline, turbidityVoltage, tds) {
  const zScoreToSeverity = (z) =>
    z === null ? null : z < 1 ? 0 : z < 2.5 ? 1 : 2;

  const turbidityZ =
    turbidityVoltage === null ||
    turbidityVoltage === undefined ||
    !baseline?.turbidity ||
    baseline.turbidity.std < 0.001
      ? null
      : Math.abs(turbidityVoltage - baseline.turbidity.mean) / baseline.turbidity.std;

  const tdsZ =
    tds === null || tds === undefined || !baseline?.tds || baseline.tds.std < 0.001
      ? null
      : Math.max(0, (tds - baseline.tds.mean) / baseline.tds.std);

  const turbiditySeverity = zScoreToSeverity(turbidityZ);
  const tdsSeverity = zScoreToSeverity(tdsZ);

  if (turbiditySeverity === null && tdsSeverity === null) {
    return null;
  }

  return Math.max(turbiditySeverity ?? 0, tdsSeverity ?? 0);
}

app.get(
  '/api/sensor-data/pollution-baseline',
  requireAuth,
  (req, res) => {

    try {

      const { sampleCount, baseline } = computePollutionBaseline(req.session.userId);

      res.json({
        success: true,
        sampleCount,
        baseline,
      });

    } catch (error) {

      console.error('❌ 오염도 기준선 조회 오류:', error);

      res.status(500).json({
        success: false,
        error: error.message,
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
  requireAuth,
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

          WHERE user_id = ?

          ORDER BY timestamp DESC

          LIMIT ?

        `).all(req.session.userId, limit);


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
  requireAuth,
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

          WHERE user_id = ?

          AND timestamp >= ?

          AND timestamp <= ?

          ORDER BY timestamp ASC

        `).all(
          req.session.userId,
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
  requireAuth,
  (req, res) => {

    try {

      const result =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM sensor_data
          WHERE user_id = ?
        `).get(req.session.userId);


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
// 알람 저장 및 조회 API
// ============================================================
app.post('/api/alerts', requireAuth, (req, res) => {
  try {
    const { title, time, detail, type } = req.body || {};
    const userId = req.session.userId;

    // 필수값 및 문자열 형식 최소 검증
    if (
      typeof title !== 'string' || !title.trim() ||
      typeof time !== 'string' || !time.trim() ||
      typeof detail !== 'string' || !detail.trim() ||
      typeof type !== 'string' || !type.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: '필수 항목이 누락되었거나 형식이 올바르지 않습니다.'
      });
    }

    const nowMs = Date.now();
    const debounceKey = `${userId}:${type}`;
    const lastAlertTime = lastAlertTimeByType.get(debounceKey);

    // --------------------------------------------------------
    // 1차: 메모리 기반 5분 디바운싱
    // --------------------------------------------------------
    if (
      lastAlertTime !== undefined &&
      nowMs - lastAlertTime < ALERT_COOLDOWN
    ) {
      return res.status(200).json({
        success: false,
        duplicate: true,
        message: '동일한 알람이 5분 이내에 이미 발생했습니다.'
      });
    }

    // --------------------------------------------------------
    // 2차: DB 기반 최근 5분 중복 확인
    // 서버 재시작 후에도 중복 저장을 방지함.
    // --------------------------------------------------------
    const cooldownStart = new Date(nowMs - ALERT_COOLDOWN).toISOString();
    const recentAlert = findRecentAlertStmt.get(type, userId, cooldownStart);

    if (recentAlert) {
      lastAlertTimeByType.set(debounceKey, nowMs);

      return res.status(200).json({
        success: false,
        duplicate: true,
        message: '동일한 알람이 최근 5분 이내에 저장되어 있습니다.'
      });
    }

    const createdAt = new Date(nowMs).toISOString();

    const result = insertAlertStmt.run({
      title: title.trim(),
      time: time.trim(),
      detail: detail.trim(),
      type: type.trim(),
      created_at: createdAt,
      user_id: userId
    });

    // 저장 성공 후에만 마지막 알람 시간을 갱신
    lastAlertTimeByType.set(debounceKey, nowMs);

    const newAlert = {
      id: Number(result.lastInsertRowid),
      title: title.trim(),
      time: time.trim(),
      detail: detail.trim(),
      type: type.trim()
    };

    // WebSocket으로 연결된 모든 클라이언트에게 실시간 브로드캐스트
    const alertMessage = JSON.stringify({
      type: 'alert',
      owner_user_id: userId,
      alert: newAlert
    });

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(alertMessage);
      }
    });

    return res.status(201).json({
      success: true,
      data: newAlert
    });
  } catch (error) {
    console.error('❌ 알람 저장 오류:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/alerts', requireAuth, (req, res) => {
  try {
    // 예전엔 100개였는데, 수온/pH 쿨다운이 짧았을 때(고쳤음) 하루치
    // 스팸만으로도 100개가 꽉 차서 과거 기록이 안 보였다. 넉넉하게 늘림.
    const rows = db.prepare(`
      SELECT id, title, time, detail, type
      FROM alerts
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 500
    `).all(req.session.userId);

    return res.json(rows);
  } catch (error) {
    console.error('❌ 알람 조회 오류:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// 알림 테스트 발송 (admin 전용)
//
// 실제로는 각 알림마다 지속 조건(3분/30분 등)이나 쿨다운을
// 기다려야 뜨는데, 개발 중에 알림 파이프라인(생성 → WebSocket
// → 화면 표시) 전체가 제대로 동작하는지 바로 확인하기 위한
// 디버그용 엔드포인트. 쿨다운도 건너뛰어서 반복 테스트해도
// 매번 뜬다. server.cjs에서 실제로 만들어내는 알림 종류와
// 1:1로 맞춰둔다 — 새 알림 종류를 추가하면 여기도 같이 추가할 것.
// ============================================================

const DEBUG_ALERT_DEFINITIONS = {
  'temperature-increase': {
    title: '수온 상승 경고',
    detail: '[테스트] 수온이/가 기준에서 벗어났습니다. 적정 기준: 24 ~ 26도',
  },
  'temperature-decrease': {
    title: '수온 저하 경고',
    detail: '[테스트] 수온이/가 기준에서 벗어났습니다. 적정 기준: 24 ~ 26도',
  },
  'ph-increase': {
    title: 'pH 상승 경고',
    detail: '[테스트] pH이/가 기준에서 벗어났습니다. 적정 기준: 6 ~ 7',
  },
  'ph-decrease': {
    title: 'pH 하락 경고',
    detail: '[테스트] pH이/가 기준에서 벗어났습니다. 적정 기준: 6 ~ 7',
  },
  'water-decrease': {
    title: '수위 저하 경고',
    detail: '[테스트] 수위가 기준보다 낮습니다.',
  },
  'fish-flipped-pose': {
    title: '배뒤집힘 지속 경고',
    detail: '[테스트] 물고기가 3분 이상 뒤집힌 자세로 감지되고 있습니다.',
  },
  'water-quality-warning': {
    title: '물갈이 권장',
    detail: '[테스트] 탁도/TDS가 평소보다 크게 벗어난 상태가 계속되고 있습니다. 물갈이를 권장합니다.',
  },
};

app.post('/api/debug/trigger-alert', requireAdmin, (req, res) => {
  const { type } = req.body || {};
  const definition = DEBUG_ALERT_DEFINITIONS[type];

  if (!definition) {
    return res.status(400).json({ success: false, error: '지원하지 않는 알림 종류입니다.' });
  }

  const alert = createAlertIfAllowed({
    type,
    title: definition.title,
    detail: definition.detail,
    eventTime: new Date().toISOString(),
    userId: req.session.userId,
    skipCooldown: true,
  });

  res.json({ success: true, alert });
});


// ============================================================
// 물리 어항 Live Render용 원본 프레임
//
// admin의 추적 스크립트(fish_growth_v3_daily_mad_db_catchup.py)가
// 주기적으로 현재 화면을 보내면 저장해뒀다가, 대시보드
// "Live Render"가 그걸 보여준다. 좌표 전송(/posi)과는 완전히
// 별개 파이프라인이라 서로 영향을 주지 않는다.
// ============================================================

let latestLiveCameraFrame = null; // { image, timestamp }

app.post('/api/live-camera-frame', (req, res) => {
  const { image } = req.body || {};

  if (!image) {
    return res.status(400).json({ success: false, error: '이미지가 없습니다.' });
  }

  latestLiveCameraFrame = {
    image,
    timestamp: Date.now(),
  };

  const owner = getUserByUsernameStmt.get(process.env.ADMIN_USERNAME || 'admin');

  const message = JSON.stringify({
    type: 'live_frame',
    owner_user_id: owner ? owner.id : null,
    image,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  res.json({ success: true });
});

app.get('/api/live-camera-frame', requireAuth, (req, res) => {
  res.json({
    success: true,
    image: latestLiveCameraFrame ? latestLiveCameraFrame.image : null,
    timestamp: latestLiveCameraFrame ? latestLiveCameraFrame.timestamp : null,
  });
});

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

    // 이 물리 어항(카메라)은 admin 계정 소유로 취급한다.
    // 다른 계정은 이 값을 받지 않고, 본인 카메라를 켰을 때만
    // 자기 데이터를 받는다 (프론트 AppContext에서 owner_user_id로 필터링).
    const physicalTankOwner =
      getUserByUsernameStmt.get(
        process.env.ADMIN_USERNAME || 'admin'
      );

    const payload = {

      owner_user_id:
        physicalTankOwner
          ? physicalTankOwner.id
          : null,

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
        ),

      abnormal_reason:
        data?.abnormal_reason ||
        null

    };


    // ========================================================
    // YOLO 데이터 DB 저장
    //
    // 기존 기능 유지
    // ========================================================

    try {

      insertYoloDataForUser.run({

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
            : 0,

        user_id:
          payload.owner_user_id

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
          growthSample,
          physicalTankOwner
            ? physicalTankOwner.id
            : null
        );

      }

    } catch (error) {

      console.error(
        '❌ 성장 데이터 처리 오류:',
        error
      );

    }

    // ========================================================
    // 배뒤집힘이 3분 이상 지속될 때만 알림 (그 외 이상행동은 알림 없음)
    // ========================================================

    if (physicalTankOwner) {
      handleAbnormalBehaviorAlert(
        physicalTankOwner.id,
        payload.abnormal ? payload.abnormal_reason : null
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
  requireAuth,
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
          date,
          req.session.userId
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
  requireAuth,
  (req, res) => {

    try {

      const rows =
        yoloDb.prepare(`
          SELECT
            *
          FROM
            daily_growth
          WHERE
            user_id = ?
          ORDER BY
            date ASC
        `).all(req.session.userId);


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
  requireAuth,
  (req, res) => {

    try {

      const rows =
        yoloDb.prepare(`
          SELECT
            *
          FROM
            daily_activity
          WHERE
            user_id = ?
          ORDER BY
            date ASC
        `).all(req.session.userId);


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

    // ⭐ 이전에 저장된 센서 데이터 중
    // 아직 알람 처리하지 않은 데이터 검사
    processStoredSensorAlerts();

  }
);