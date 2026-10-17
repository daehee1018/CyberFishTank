const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const Database = require('better-sqlite3');

// 실제 급식기나 운영 DB에 접속하지 않고 서버의 급식기 라우트를 실행한다.
const serverSource = readFileSync(path.join(__dirname, '../server.cjs'), 'utf8');
const feederSource = serverSource.slice(
  serverSource.indexOf('const FEEDER_MAX_FEEDS ='),
  serverSource.indexOf("\napp.post(\n  '/api/sensor-data'"),
);
const authSource = serverSource.slice(
  serverSource.indexOf('function requireAuth('),
  serverSource.indexOf('function requireAdmin('),
);

function setup(t) {
  const authDb = new Database(':memory:');
  t.after(() => authDb.close());
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post'].map((method) => [
    method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers),
  ]));
  vm.runInNewContext(`${authSource}\n${feederSource}`, {
    authDb, app, console: { log() {} },
    requireSensorKey(req, res, next) {
      if (!req.sensorUserId) return res.status(401).json({ success: false });
      next();
    },
  });

  function request(method, url, { userId = 1, body = {}, query = {}, sensorUserId } = {}) {
    const result = { status: 200, body: null };
    const req = { session: { userId }, headers: {}, body, query, sensorUserId };
    const res = {
      status(code) { result.status = code; return this; },
      json(value) { result.body = JSON.parse(JSON.stringify(value)); return this; },
      end() { return this; },
    };
    const handlers = routes.get(`${method} ${url}`);
    assert(handlers, `Route exists: ${method} ${url}`);
    let index = 0;
    const next = () => handlers[index++]?.(req, res, next);
    next();
    return result;
  }

  const insert = authDb.prepare(`INSERT INTO feeder_commands
    (user_id, command, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?)`);
  function record(completedAt, { userId = 1, command = 'FEED', status = 'completed' } = {}) {
    insert.run(userId, command, status, completedAt, completedAt);
  }
  const history = (month, userId = 1) => request('get', '/api/feeder/history', { userId, query: { month } });
  return { authDb, request, record, history };
}

test('fresh database starts and returns empty monthly history', (t) => {
  const { history } = setup(t);
  assert.deepEqual(history('2026-10'), {
    status: 200, body: { success: true, month: '2026-10', days: [] },
  });
});

test('history counts only successful FEED commands, grouped by Korean date and account', (t) => {
  const { record, history } = setup(t);
  record('2026-09-30T14:59:59.999Z'); // 한국 시간 9월 30일
  record('2026-09-30T15:00:00.000Z'); // 한국 시간 10월 1일
  record('2026-10-01T00:00:00.000Z');
  record('2026-10-31T14:59:59.999Z'); // 한국 시간 10월 31일
  record('2026-10-31T15:00:00.000Z'); // 한국 시간 11월 1일
  record('2026-10-02T00:00:00.000Z', { userId: 2 });
  record('2026-10-03T00:00:00.000Z', { command: 'RESET' });
  for (const status of ['queued', 'processing', 'failed']) {
    record('2026-10-04T00:00:00.000Z', { status });
  }
  assert.deepEqual(history('2026-10').body.days, [
    { date: '2026-10-01', count: 2 }, { date: '2026-10-31', count: 1 },
  ]);
  assert.deepEqual(history('2026-10', 2).body.days, [{ date: '2026-10-02', count: 1 }]);
  assert.deepEqual(history('2026-09').body.days, [{ date: '2026-09-30', count: 1 }]);
  assert.deepEqual(history('2026-11').body.days, [{ date: '2026-11-01', count: 1 }]);
});

test('history handles leap days and December/January boundaries', (t) => {
  const { record, history } = setup(t);
  record('2024-02-28T15:00:00.000Z');
  record('2024-02-29T15:00:00.000Z');
  record('2024-12-31T14:59:59.999Z');
  record('2024-12-31T15:00:00.000Z');
  assert.deepEqual(history('2024-02').body.days, [{ date: '2024-02-29', count: 1 }]);
  assert.deepEqual(history('2024-03').body.days, [{ date: '2024-03-01', count: 1 }]);
  assert.deepEqual(history('2024-12').body.days, [{ date: '2024-12-31', count: 1 }]);
  assert.deepEqual(history('2025-01').body.days, [{ date: '2025-01-01', count: 1 }]);
});

test('monthly history requires login and a valid month', (t) => {
  const { request, history } = setup(t);
  assert.equal(history('2026-10', null).status, 401);
  for (const month of [undefined, '', '2026-1', '2026-00', '2026-13', '2026-10-01', ['2026-10'], '0000-01']) {
    assert.equal(history(month).status, 400, `Invalid month: ${month}`);
  }
  assert.equal(request('get', '/api/feeder/history').status, 400);
});

test('existing feed, claim, result, lock and reset flow keeps completed history', (t) => {
  const { request, authDb } = setup(t);
  const koreaMonth = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
  }).format(new Date());
  const counts = () => request('get', '/api/feeder/history', { query: { month: koreaMonth } })
    .body.days.reduce((sum, day) => sum + day.count, 0);

  for (const count of [1, 2]) {
    const queued = request('post', '/api/feeder/feed');
    assert.equal(queued.status, 202);
    assert.equal(counts(), count - 1, 'Queued feed is not a completed feed');
    assert.equal(request('post', '/api/feeder/feed').status, 409);
    const claimed = request('get', '/api/feeder/command', { sensorUserId: 1 });
    assert.equal(claimed.body.id, queued.body.command.id);
    assert.equal(request('get', '/api/feeder/command', { sensorUserId: 1 }).status, 204);
    assert.equal(counts(), count - 1, 'Processing feed is not a completed feed');
    const body = { command_id: claimed.body.id, command: 'FEED', success: true,
      feed_count: count, angle: count * 60, locked: count === 2 };
    assert.equal(request('post', '/api/feeder/result', { sensorUserId: 1, body }).status, 200);
    assert.equal(counts(), count);
    assert.equal(request('post', '/api/feeder/result', { sensorUserId: 1, body }).status, 409);
    assert.equal(counts(), count, 'Repeated result does not duplicate history');
  }
  const lastFeedAt = request('get', '/api/feeder/status').body.last_feed_at;
  assert(lastFeedAt);
  assert.equal(request('get', '/api/feeder/status').body.locked, true);
  assert.equal(request('post', '/api/feeder/feed').status, 409);
  request('post', '/api/feeder/reset');
  const reset = request('get', '/api/feeder/command', { sensorUserId: 1 });
  assert.equal(request('post', '/api/feeder/result', { sensorUserId: 1, body: {
    command_id: reset.body.id, command: 'RESET', success: true, feed_count: 0, angle: 0, locked: false,
  } }).status, 200);
  assert.equal(counts(), 2, 'Reset preserves history');
  assert.equal(request('get', '/api/feeder/status').body.last_feed_at, lastFeedAt);
  assert.equal(request('get', '/api/feeder/status').body.feed_count, 0);

  request('post', '/api/feeder/feed');
  const failed = request('get', '/api/feeder/command', { sensorUserId: 1 });
  assert.equal(request('post', '/api/feeder/result', { sensorUserId: 1, body: {
    command_id: failed.body.id, command: 'FEED', success: false, error: 'timeout',
  } }).status, 200);
  assert.equal(counts(), 2, 'Failed feed is excluded');
  assert.equal(request('get', '/api/feeder/status').body.last_feed_at, lastFeedAt);
  assert.equal(authDb.prepare("SELECT COUNT(*) AS count FROM feeder_commands WHERE status = 'failed'").get().count, 1);
});
