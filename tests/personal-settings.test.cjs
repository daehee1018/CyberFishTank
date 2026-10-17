const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { DEFAULT_SENSOR_RANGES, validateSensorRanges, createSensorSettingsStore, sensorAlertsForValues, isValidRgb } = require('../sensor-settings.cjs');
const server = readFileSync(path.join(__dirname, '../server.cjs'), 'utf8');

function setup(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users VALUES (1), (2);
    CREATE TABLE user_fish (user_id INTEGER PRIMARY KEY, color_hue INTEGER DEFAULT 0,
      accessory TEXT DEFAULT '', accessory_x REAL, accessory_y REAL);`);
  // Execute the production migration and handlers against an isolated database.
  const migration = server.slice(server.indexOf('// Preserve legacy hue'), server.indexOf('const getUserFishStmt ='));
  const update = server.match(/const updateUserFishAppearanceStmt = authDb\.prepare\(`[\s\S]*?`\);/)[0];
  const appearanceStart = server.indexOf("app.post('/api/fish/appearance'");
  const appearance = server.slice(appearanceStart, server.indexOf('\n// ============================================================', appearanceStart));
  const sensorStart = server.indexOf('const sensorSettingsStore =');
  const sensorRoutes = server.slice(sensorStart, server.indexOf("app.get('/api/sensor-key'", sensorStart));
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post'].map(method => [method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers)]));
  const messages = [];
  const context = { authDb: db, app, isValidRgb, createSensorSettingsStore,
    wss: { clients: [{ readyState: 1, send: message => messages.push(JSON.parse(message)) }] }, WebSocket: { OPEN: 1 },
    ACCESSORY_OPTIONS: ['', 'hat', 'crown', 'ribbon', 'sunglasses', 'flower'],
    pollutionDangerStreakByUser: new Map(),
    getUserFishStmt: db.prepare('SELECT * FROM user_fish WHERE user_id = ?'),
    requireAuth(req, res, next) { if (!req.session.userId) return res.status(401).json({ success: false }); next(); },
  };
  vm.runInNewContext(`${migration}\n${migration}\n${update}\n${appearance}\n${sensorRoutes}`, context);
  function request(method, url, body = {}, userId = 1) {
    const result = { status: 200, body: null };
    const req = { session: { userId }, body };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = JSON.parse(JSON.stringify(body)); return this; } };
    const handlers = routes.get(`${method} ${url}`);
    let index = 0;
    const next = () => handlers[index++]?.(req, res, next);
    next();
    return result;
  }
  return { db, request, messages };
}

test('sensor ranges persist per account and require authentication', t => {
  const { db, request, messages } = setup(t);
  assert.equal(request('get', '/api/sensor-settings', {}, null).status, 401);
  assert.equal(request('post', '/api/sensor-settings', { ranges: DEFAULT_SENSOR_RANGES }, null).status, 401);
  assert.deepEqual(request('get', '/api/sensor-settings').body.ranges, DEFAULT_SENSOR_RANGES);
  const custom = { ...DEFAULT_SENSOR_RANGES, temperatureMin: 20, temperatureMax: 28, phMin: 5.5, phMax: 7.5 };
  assert.equal(request('post', '/api/sensor-settings', { ranges: custom }).status, 200);
  assert.deepEqual(messages[0], { type: 'sensor_settings', owner_user_id: 1, ranges: custom });
  assert.deepEqual(createSensorSettingsStore(db).get(1), custom, 'Reloaded store retains settings');
  assert.deepEqual(request('get', '/api/sensor-settings', {}, 2).body.ranges, DEFAULT_SENSOR_RANGES);
  for (const changes of [{ temperatureMin: 28, temperatureMax: 20 }, { phMax: 15 }, { phMin: '' }, { temperatureMax: null }, { pollutionWarningZ: 3 }, { pollutionDangerZ: 0 }]) {
    assert.equal(request('post', '/api/sensor-settings', { ranges: { ...custom, ...changes } }).status, 400);
  }
  assert.deepEqual(request('get', '/api/sensor-settings').body.ranges, custom, 'Invalid saves do not overwrite settings');
  assert.equal(validateSensorRanges({ ...custom, phMin: NaN }), false);
});

test('sensor alerts use configured boundaries, ignore missing values and retain binary water detection', () => {
  const custom = { ...DEFAULT_SENSOR_RANGES, temperatureMin: 20, temperatureMax: 28, phMin: 5.5, phMax: 7.5 };
  assert.deepEqual(sensorAlertsForValues({ temperature: 28, ph: 5.5, water_level_detected: '1' }, custom), []);
  assert.deepEqual(sensorAlertsForValues({ temperature: 27, ph: 7.2 }, custom), []);
  const alerts = sensorAlertsForValues({ temperature: 29, ph: 5, water_level_detected: '0' }, custom);
  assert.deepEqual(alerts.map(row => row.type), ['temperature-increase', 'ph-decrease', 'water-decrease']);
  assert.match(alerts[0].detail, /20 ~ 28/);
  assert.match(alerts[1].detail, /5.5 ~ 7.5/);
  assert.deepEqual(sensorAlertsForValues({ temperature: null, ph: '', water_level_detected: null }, custom), []);
  assert.equal(sensorAlertsForValues({ temperature: 27 }, DEFAULT_SENSOR_RANGES)[0].type, 'temperature-increase');
});

test('RGB migration is repeatable and appearance saves preserve legacy colors, position and account isolation', t => {
  const { db, request } = setup(t);
  db.exec("INSERT INTO user_fish (user_id, color_hue) VALUES (1, 270), (2, 40)");
  const body = { colorHue: 0, colorRgb: { r: 255, g: 0, b: 128 }, accessory: 'crown', accessoryX: 23, accessoryY: 45 };
  assert.equal(request('post', '/api/fish/appearance', body, null).status, 401);
  assert.deepEqual(request('post', '/api/fish/appearance', body).body.fish, body);
  let row = db.prepare('SELECT * FROM user_fish WHERE user_id = 1').get();
  assert.deepEqual(JSON.parse(row.color_rgb), body.colorRgb);
  assert.equal(row.accessory_x, 23);
  assert.equal(db.prepare('SELECT color_rgb FROM user_fish WHERE user_id = 2').get().color_rgb, null);
  for (const colorRgb of [{ r: -1, g: 0, b: 0 }, { r: 256, g: 0, b: 0 }, { r: 1.5, g: 0, b: 0 }, { r: '2', g: 0, b: 0 }, {}, [1, 2, 3]]) {
    assert.equal(request('post', '/api/fish/appearance', { ...body, colorRgb }).status, 400);
  }
  const { colorRgb, ...legacy } = body;
  request('post', '/api/fish/appearance', legacy);
  assert.deepEqual(JSON.parse(db.prepare('SELECT color_rgb FROM user_fish WHERE user_id = 1').get().color_rgb), colorRgb, 'Older clients retain saved RGB');
  request('post', '/api/fish/appearance', { ...body, colorRgb: null });
  row = db.prepare('SELECT * FROM user_fish WHERE user_id = 1').get();
  assert.equal(row.color_rgb, null, 'Original color restores the unfiltered sprite');
});

test('pollution sensitivity uses saved thresholds and still requires three consecutive danger samples', () => {
  const start = server.indexOf('function computePollutionSeverity(');
  const severity = server.slice(start, server.indexOf('\napp.get(', start));
  const handlerStart = server.indexOf('const POLLUTION_ALERT_SUSTAINED_SAVES =');
  const handler = server.slice(handlerStart, server.indexOf('\nfunction createAlertIfAllowed(', handlerStart));
  const alerts = [];
  const custom = { ...DEFAULT_SENSOR_RANGES, pollutionWarningZ: 0.5, pollutionDangerZ: 1.5 };
  const baseline = { turbidity: { mean: 5, std: 1 }, tds: { mean: 100, std: 10 } };
  const context = vm.createContext({ DEFAULT_SENSOR_RANGES, sensorSettingsStore: { get: () => custom },
    computePollutionBaseline: () => ({ baseline }), createAlertIfAllowed: value => alerts.push(value) });
  vm.runInContext(`${severity}\n${handler}`, context);
  assert.equal(context.computePollutionSeverity(baseline, 7, 100), 1);
  assert.equal(context.computePollutionSeverity(baseline, 7, 100, custom), 2);
  for (let i = 0; i < 2; i++) context.handlePollutionAlert(1, 7, 100);
  assert.equal(alerts.length, 0);
  context.handlePollutionAlert(1, 5, 100);
  for (let i = 0; i < 2; i++) context.handlePollutionAlert(1, 7, 100);
  assert.equal(alerts.length, 0, 'Normal readings reset the streak');
  context.handlePollutionAlert(1, 7, 100);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].userId, 1);
});
