const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { registerRigRoutes, validRig } = require('../fish-rig.cjs');

test('rig routes verify ownership/hash, isolate graphic settings, reject malformed rigs and preserve previous save', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cft-rig-'));
  const publicDir = path.join(dir, 'public');
  mkdirSync(path.join(publicDir, 'fish_sprites', '1', 'v1'), { recursive: true });
  const image = path.join(__dirname, '../public/fish_sprites/fish_right.png');
  copyFileSync(image, path.join(publicDir, 'fish_sprites', 'fish_right.png'));
  copyFileSync(image, path.join(publicDir, 'fish_sprites', '1', 'v1', 'fish_right.png'));
  const db = new Database(':memory:');
  t.after(() => { db.close(); rmSync(dir, { recursive: true }); });
  db.exec(`CREATE TABLE fish_graphics (id INTEGER PRIMARY KEY, user_id INTEGER, dir_name TEXT, rig_json TEXT);
    CREATE TABLE user_fish (user_id INTEGER PRIMARY KEY, active_graphic_dir TEXT);
    INSERT INTO fish_graphics VALUES (1, 1, '', NULL), (2, 1, 'v1', NULL), (3, 2, '', NULL);
    INSERT INTO user_fish VALUES (1, 'v1'), (2, '');`);
  const routes = {};
  const app = Object.fromEntries(['get', 'put'].map(method => [method, (url, ...handlers) => { routes[`${method} ${url}`] = handlers; }]));
  registerRigRoutes({ app, requireAuth(req, res, next) { return req.session.userId ? next() : res.status(401).json({ success: false }); }, db, publicDir, ensureDefault() {} });
  const request = (method, id, body, userId = 1) => {
    const result = { status: 200 };
    const handlers = routes[`${method} ${id === 'active' ? '/api/fish/rig' : '/api/fish/graphics/:id/rig'}`];
    const req = { params: { id }, session: { userId }, body };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
    let index = 0; const next = () => handlers[index++]?.(req, res, next); next();
    return result;
  };
  const original = JSON.parse(readFileSync(path.join(__dirname, '../public/fish_sprites/fish_right.rig.json')));
  assert.equal(validRig(original), true);
  assert.equal(request('get', 1).body.rig, null);
  assert.equal(request('get', 3).status, 404);
  assert.equal(request('put', 3, { rig: original }).status, 404);
  assert.equal(request('get', 1, null, null).status, 401);
  assert.equal(request('put', 2, { rig: original }).status, 200);
  assert.deepEqual(request('get', 'active').body.rig, original);
  assert.equal(request('get', 1).body.rig, null, 'A/B rigs are separate');
  assert.equal(request('get', 3, null, 2).body.rig, null, 'Another user is untouched');
  for (const rig of [undefined, {}, { ...original, version: 8 }, { ...original, body: { rect: [0, 0, 2, 1] } }, { ...original, tail: { ...original.tail, strength: 'extreme' } }, { ...original, dorsal: { ...original.dorsal, rootLine: [[0, 0], [0, 0]] } }, { ...original, tail: { ...original.tail, root: [NaN, 1] } }]) {
    assert.equal(request('put', 2, { rig }).status, 400);
    assert.deepEqual(request('get', 2).body.rig, original);
  }
  assert.equal(request('put', 2, { rig: { ...original, imageHash: 'a'.repeat(64) } }).status, 409);
  assert.equal(request('put', 2, { rig: { ...original, sourceSize: [1, 1] } }).status, 409);
  assert.equal(request('put', 2, { rig: original, padding: 'x'.repeat(9000) }).status, 400);
  const file = path.join(publicDir, 'fish_sprites', '1', 'v1', 'fish_right.png');
  writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from('changed')]));
  assert.equal(request('get', 2).body.stale, true);
  assert.equal(request('get', 2).body.rig, null);
  assert.equal(request('put', 2, { rig: original }).status, 409);
  assert.equal(request('put', 2, { rig: null }).status, 200);
  assert.equal(db.prepare('SELECT rig_json FROM fish_graphics WHERE id = 2').get().rig_json, null);
});
