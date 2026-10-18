const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { trackingPayload } = require('../tracking-payload.cjs');
const server = readFileSync(path.join(__dirname, '../server.cjs'), 'utf8').replace(/\r\n/g, '\n');
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; }, send(body) { this.body = body; } }; }
test('camera route broadcasts explicit loss including frame/session metadata', async () => {
  let handler, result;
  const messages = [], records = [];
  const start = server.indexOf("app.post('/api/camera/frame'");
  const end = server.indexOf('\n// ============================================================', start);
  vm.runInNewContext(server.slice(start, end), {
    app: { post(url, auth, callback) { handler = callback; } }, requireAuth() {},
    fetch: async () => ({ ok: true, json: async () => result }),
    insertYoloDataForUser: { run(record) { records.push(record); } },
    saveGrowthSample() {}, handleAbnormalBehaviorAlert() {}, trackingPayload,
    WebSocket: { OPEN: 1 }, wss: { clients: [{ readyState: 1, send(message) { messages.push(JSON.parse(message)); } }] }, console,
  });
  result = { success: true, fish: null, stream_id: 'new', frame_id: 3, timestamp_ms: 123456, frame_size: [1280, 720] };
  await handler({ session: { userId: 12 }, body: { image: 'test' } }, response());
  assert.equal(messages[0].state, 'lost'); assert.equal(messages[0].center_norm, null);
  assert.equal(messages[0].stream_id, 'new'); assert.equal(messages[0].frame_id, 3);
  assert.equal(messages[0].owner_user_id, 12); assert.equal(records.length, 0);
  result = { success: true, fish: { state: 'tracked', center_norm: [.7, .3], frame_id: 4, frame_size: [1280, 720], pose_conf: 0, keypoints: { head: [800, 350], tail: [600, 350] } } };
  await handler({ session: { userId: 12 }, body: { image: 'test' } }, response());
  assert.equal(messages[1].pose_conf, 0); assert.deepEqual(messages[1].frame_size, [1280, 720]);
  assert.equal(records.length, 1);
});
test('physical route keeps the configured owner and forwards loss without fake observations', () => {
  let handler;
  const messages = [], records = [];
  const start = server.indexOf("app.post(\n  '/posi',");
  const end = server.indexOf('\n// ============================================================', server.indexOf(".send('OK')", start));
  vm.runInNewContext(server.slice(start, end), {
    app: { post(url, callback) { handler = callback; } },
    getUserByUsernameStmt: { get() { return { id: 44 }; } }, process: { env: {} },
    insertYoloDataForUser: { run(record) { records.push(record); } },
    saveGrowthSample() {}, handleAbnormalBehaviorAlert() {}, trackingPayload,
    WebSocket: { OPEN: 1 }, wss: { clients: [{ readyState: 1, send(message) { messages.push(JSON.parse(message)); } }] }, console,
  });
  handler({ body: { fish: null, frame_id: 9, stream_id: 'physical-1' } }, response());
  assert.equal(messages[0].type, 'fish_tracking'); assert.equal(messages[0].owner_user_id, 44);
  assert.equal(messages[0].state, 'lost'); assert.equal(records[0].center_x, null);
  handler({ body: [{ state: 'tracked', center_norm: [.3, .6], frame_size: [640, 480], pose_conf: .8, keypoints: { head: [350, 200], tail: [200, 210] }, owner_user_id: 999 }] }, response());
  assert.equal(messages[1].owner_user_id, 44);
  assert.equal(messages[1].pose_conf, .8); assert.deepEqual(messages[1].frame_size, [640, 480]);
});
