const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('decoration layers preserve old layouts, persist per account and reject invalid saves', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE user_fish (user_id INTEGER PRIMARY KEY, decorations_json TEXT DEFAULT '[]');
    INSERT INTO user_fish (user_id) VALUES (1), (2);`);
  const server = readFileSync(path.join(__dirname, '../server.cjs'), 'utf8').replace(/\r\n/g, '\n');
  const start = server.indexOf('const MAX_DECORATIONS =');
  const end = server.indexOf('\n// ============================================================', start);
  let handlers;
  vm.runInNewContext(server.slice(start, end), {
    app: { post(url, ...route) { assert.equal(url, '/api/aquarium-decorations'); handlers = route; } },
    requireAuth(req, res, next) { return req.session.userId ? next() : res.status(401).json({ success: false }); },
    getUserFishStmt: db.prepare('SELECT * FROM user_fish WHERE user_id = ?'),
    updateDecorationsStmt: db.prepare('UPDATE user_fish SET decorations_json = @decorations_json WHERE user_id = @user_id'),
  });
  const request = (decorations, userId = 1, ownerUserId = undefined) => {
    const result = { status: 200 };
    const req = { session: { userId }, body: { decorations, ownerUserId } };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
    let index = 0;
    const next = () => handlers[index++]?.(req, res, next);
    next();
    return result;
  };
  const read = userId => JSON.parse(db.prepare('SELECT decorations_json FROM user_fish WHERE user_id = ?').get(userId).decorations_json);
  const legacy = { id: 'plant-1', type: 'plant', src: '/plant.png', x: 12, y: 90, sway: true };
  assert.equal(request([legacy]).status, 200);
  assert.deepEqual(read(1), [legacy], 'Missing layer remains compatible');
  const layout = [{ ...legacy, layer: 'back' }, { ...legacy, id: 'structure-1', layer: 'middle' }, { ...legacy, id: 'plant-2', layer: 'front' }];
  assert.equal(request(layout).status, 200);
  assert.deepEqual(read(1), layout, 'All three layers and array order survive serialization');
  assert.deepEqual(read(2), [], 'Another account is unchanged');
  for (const layer of ['unknown', null, 1, {}, ['front']]) {
    assert.equal(request([{ ...legacy, layer }]).status, 400);
    assert.deepEqual(read(1), layout, 'Invalid layers cannot overwrite saved data');
  }
  assert.equal(request([], null).status, 401);
  assert.equal(request([], 2, 1).status, 409, 'A stale owner cannot write to a new login session');
  assert.deepEqual(read(2), []);
  assert.equal(request([], 3).status, 400, 'An account without a fish cannot save');
  assert.equal(request(Array(101).fill(legacy)).status, 400);
  assert.equal(request([]).status, 200);
  assert.deepEqual(read(1), [], 'Deleting all decorations is persisted');
});
