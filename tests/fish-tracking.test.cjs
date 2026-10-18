const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { trackingPayload } = require('../tracking-payload.cjs');
function load(file) {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  return exports;
}
const { FishTrackingFilter, FishDepthFilter, mapTrackingPoint } = load('src/lib/fishTracking.ts');
const { vertexWeight, displacement } = load('src/lib/fishRig.ts');
const base = { owner_user_id: 1, source: 'personal', stream_id: 's1', track_id: 1, state: 'tracked', center_norm: [.5, .5], conf: .6, pose_conf: .5, frame_size: [1280, 720], head: [800, 350], tail: [600, 350] };
function settled(extra = {}) {
  const filter = new FishTrackingFilter();
  for (const t of [0, 500, 1000, 1500]) filter.ingest({ ...base, ...extra, frame_id: t / 500 }, t);
  return filter;
}
test('stationary noise, one outlier and stale pose do not move or flip the fish', () => {
  const f = settled();
  assert.equal(f.status(1500), 'tracking');
  f.ingest({ ...base, frame_id: 4, center_norm: [.503, .5] }, 2000);
  assert.ok(f.x > .5 && f.x < .503, 'Small movement is attenuated, never discarded');
  const held = f.x;
  f.ingest({ ...base, frame_id: 5, center_norm: [.99, .01], head: [400, 350], pose_conf: 0 }, 2500);
  assert.equal(f.x, held); assert.equal(f.angle, 0); assert.equal(f.flip, false);
  f.ingest({ ...base, frame_id: 6 }, 3000);
  assert.ok(Math.abs(f.x - .5) < .001);
  f.ingest({ ...base, frame_id: 7, head: [600, 350], tail: [600, 350] }, 3500);
  assert.equal(f.angle, 0);
});
test('sustained real movement is reacquired; position and pose gates are independent', () => {
  const f = settled();
  for (const [t, x] of [[2000, .85], [2500, .9], [3000, .95]]) f.ingest({ ...base, frame_id: t, center_norm: [x, .3], pose_conf: 0 }, t);
  assert.ok(f.x > .92 && f.x <= .95); assert.ok(Math.abs(f.y - .3) < .02);
  assert.equal(f.angle, 0);
  assert.equal(f.status(5000), 'pose');
  const x = f.x;
  for (const t of [5500, 6000, 6500]) f.ingest({ ...base, frame_id: t, center_norm: null, head: [500, 350], tail: [800, 350] }, t);
  assert.equal(f.x, x);
  assert.equal(Math.abs(f.angle), 180);
});
test('large consistent motion during acquisition is not permanently rejected', () => {
  const f = new FishTrackingFilter();
  for (const [t, x] of [[0, .05], [500, .35], [1000, .65]]) f.ingest({ ...base, center_norm: [x, .4], frame_id: t }, t);
  assert.ok(f.x > .60 && f.x <= .65);
  assert.equal(f.status(1000), 'tracking');
});
test('lost, stopped connection and reacquisition retain the last position', () => {
  const f = settled({ center_norm: [.7, .4] });
  const x = f.x;
  f.ingest({ state: 'lost', source: 'personal', stream_id: 's1', frame_id: 9 }, 2000);
  assert.equal(f.status(2200), 'lost'); assert.equal(f.x, x);
  assert.equal(f.status(8000), 'disconnected'); assert.equal(f.x, x);
  f.ingest({ ...base, frame_id: 10, center_norm: [.2, .7] }, 8500);
  assert.equal(f.x, x);
  f.ingest({ ...base, frame_id: 11, center_norm: [.2, .7] }, 9500);
  assert.equal(f.x, .2);
  assert.equal(f.status(9500, false), 'disconnected');
});
test('duplicate/out of order packets ignored, explicit stream restart and ID change reset gates', () => {
  const f = settled();
  assert.equal(f.ingest({ ...base, frame_id: 2, center_norm: [.1, .1] }, 1800), false);
  assert.equal(f.lastReceived, 1500);
  assert.equal(f.ingest({ ...base, stream_id: 'new', frame_id: 0 }, 2000), true);
  assert.equal(f.status(2000), 'acquiring');
  f.ingest({ ...base, stream_id: 'new', frame_id: 1 }, 3000);
  assert.equal(f.status(3000), 'tracking');
  f.ingest({ ...base, stream_id: 'new', track_id: 4, frame_id: 2, center_norm: [.8, .2] }, 3500);
  assert.equal(f.x, .5); assert.equal(f.status(3500), 'acquiring');
});
test('legacy center-only input works; missing metadata never enables pose or depth', () => {
  const f = new FishTrackingFilter();
  assert.equal(f.status(0), 'waiting');
  for (const t of [0, 500, 1000]) f.ingest({ center_norm: [.6, .4] }, t);
  assert.equal(f.x, .6); assert.equal(f.status(1000), 'pose');
  f.ingest({ center_norm: [NaN, Infinity] }, 1500);
  assert.equal(f.x, .6);
  assert.equal(f.depth.scale, 1); assert.equal(f.depth.state, 'unavailable');
});
test('legacy physical pixel keypoints control heading even when frame_size is missing', () => {
  const f = new FishTrackingFilter();
  const physical = { ...base, source: 'physical', frame_size: null, head: [528.5, 146.5], tail: [606.1, 141.7], pose_conf: .78 };
  for (const t of [0, 400, 800, 1200]) f.ingest({ ...physical, frame_id: t }, t);
  assert.equal(f.flip, true);
  assert.ok(f.angle > 170 && f.angle < 180);
  assert.ok(f.rotation() < 0 && f.rotation() > -10);
  assert.equal(f.status(1200), 'tracking');
  assert.equal(f.frameSize, null, 'Missing dimensions are never invented');
  for (const t of [1600, 2000, 2400]) f.ingest({ ...physical, head: [650, 145], tail: [550, 145], frame_id: t }, t);
  assert.equal(f.flip, false);
  assert.ok(Math.abs(f.rotation()) < 1);
});
test('unknown normalized coordinates and zero-confidence stale points still hold direction', () => {
  const f = settled({ frame_size: null, head: [528.5, 146.5], tail: [606.1, 141.7] });
  const angle = f.angle;
  for (const t of [2000, 2400, 2800]) f.ingest({ ...base, frame_size: null, head: [.8, .4], tail: [.3, .4], frame_id: t }, t);
  assert.equal(f.angle, angle);
  assert.equal(f.flip, true);
  for (const t of [3200, 3600, 4000]) f.ingest({ ...base, frame_size: null, pose_conf: 0, frame_id: t }, t);
  assert.equal(f.angle, angle);
  assert.equal(f.flip, true);
});
test('a confirmed opposite pose turns after one confirmation period instead of two', () => {
  const f = settled();
  f.ingest({ ...base, head: [400, 350], tail: [600, 350], frame_id: 4 }, 2000);
  assert.equal(f.flip, false);
  assert.equal(f.rotation(), 0);
  f.ingest({ ...base, head: [400, 350], tail: [600, 350], frame_id: 5 }, 2400);
  assert.equal(f.flip, false);
  f.ingest({ ...base, head: [400, 350], tail: [600, 350], frame_id: 6 }, 2800);
  assert.equal(f.flip, true);
  assert.equal(f.rotation(), 0);
});
test('personal camera temporarily owns the coordinate stream instead of alternating with the physical tank', () => {
  const f = settled();
  assert.equal(f.ingest({ ...base, source: 'physical', stream_id: 'other', frame_id: 500, center_norm: [.1, .1] }, 2000), false);
  assert.equal(f.x, .5);
  assert.equal(f.ingest({ ...base, source: 'physical', stream_id: 'other', frame_id: 501, center_norm: [.1, .1] }, 7000), true);
  assert.equal(f.x, .5, 'A source change still requires reacquisition');
});
test('vertical-heading jitter does not flip; sustained opposite pose eventually flips', () => {
  const f = settled();
  for (let i = 0; i < 9; i++) f.ingest({ ...base, frame_id: i + 4, head: [600 + (i % 2 ? -1 : 1), 100], tail: [600, 350] }, 2000 + i * 500);
  assert.equal(f.flip, false);
  for (let i = 0; i < 8; i++) f.ingest({ ...base, frame_id: i + 20, head: [400, 350], tail: [600, 350] }, 7000 + i * 500);
  assert.equal(f.flip, true);
  assert.ok(Math.abs(f.rotation()) < 1);
});
test('both relay paths preserve metadata and null points, never fabricate center', () => {
  const raw = { ...base, keypoints: { head: [800, 350], tail: null }, timestamp: 1234, frame_id: 42 };
  const message = trackingPayload(raw, 12, { source: 'personal' });
  assert.equal(message.timestamp_ms, 1234000);
  assert.deepEqual(message.frame_size, [1280, 720]);
  assert.equal(message.keypoints.tail, null); assert.equal(message.owner_user_id, 12);
  const lost = trackingPayload(null, 12, { frame_id: 43, stream_id: 's', source: 'physical' });
  assert.equal(lost.type, 'fish_tracking'); assert.equal(lost.state, 'lost'); assert.equal(lost.center_norm, null);
  assert.equal(trackingPayload({}, 12).center_norm, null);
});
test('camera coordinates keep their aspect ratio across desktop/mobile tank sizes', () => {
  const wide = mapTrackingPoint(.25, .25, [1280, 720], 800, 600);
  assert.equal(wide[0], .25); assert.equal(wide[1], .3125);
  const narrow = mapTrackingPoint(0, 0, [1280, 720], 320, 400);
  assert.equal(narrow[0], 0); assert.equal(narrow[1], .275);
  assert.deepEqual(Array.from(mapTrackingPoint(.2, .3, null, 320, 400)), [.2, .3]);
});
test('mesh keeps eye/body/root still, moves fins and bounds overlapping weights', () => {
  const rig = JSON.parse(readFileSync(path.join(__dirname, '../public/fish_sprites/fish_right.rig.json')));
  for (const p of [[.71, .43], [.55, .45], rig.tail.root, rig.dorsal.rootLine[0], rig.lower.rootLine[0]]) {
    const w = vertexWeight(...p, rig);
    assert.ok(Math.hypot(...displacement(w, 1)) < .00001, `${p} should stay attached`);
  }
  const w = vertexWeight(.3, .55, rig);
  assert.ok(Math.hypot(...displacement(w, 1, false, 1)) > .001);
  assert.notDeepEqual(displacement(w, 1), displacement(w, 1.2));
  for (let y = 0; y <= 1; y += .02) for (let x = 0; x <= 1; x += .02) {
    const w = vertexWeight(x, y, rig);
    assert.ok(w.tail + w.dorsal + w.lower <= 1.00001);
  }
});
