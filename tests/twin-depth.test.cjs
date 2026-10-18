const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const path = require('node:path');
function load(file) {
  const exports = {};
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  return exports;
}
const { FishTrackingFilter, FishDepthFilter } = load('src/lib/fishTracking.ts');
const { moveDecoration, changeDecorationLayer } = load('src/lib/aquariumDecorations.ts');
const { moveRigPart } = load('src/lib/fishRig.ts');
const { advanceFishDisplay, createFishDisplay } = load('src/lib/fishDisplay.ts');
const base = { source: 'personal', stream_id: 's1', track_id: 1, state: 'tracked', center_norm: [.5, .5], conf: .8, pose_conf: .8, frame_size: [1280, 720], head: [800, 350], tail: [600, 350], bbox: [550, 280, 850, 420] };
const sized = (size, extra = {}) => ({ ...base, head: [700 + 100 * size, 350], tail: [700 - 100 * size, 350], bbox: [700 - 150 * size, 350 - 70 * size, 700 + 150 * size, 350 + 70 * size], ...extra });
function depth(pose = true) {
  const d = new FishDepthFilter();
  for (let t = 0; t <= 2400; t += 400) d.ingest({ ...base, pose_conf: pose ? .8 : 0 }, t, true, false);
  return d;
}

test('depth collects a stable median; one large or clipped box cannot pulse size', () => {
  const d = new FishDepthFilter();
  d.ingest(base, 0, true, false);
  assert.equal(d.baseline, null); assert.equal(d.scale, 1); assert.equal(d.state, 'collecting');
  for (let t = 400; t <= 1600; t += 400) d.ingest(base, t, true, false);
  assert.equal(d.baseline, 140 / 720); assert.equal(d.state, 'active');
  d.ingest(sized(1.8), 2000, true, false);
  assert.equal(d.scale, 1); assert.equal(d.state, 'holding');
  d.ingest({ ...base, bbox: [0, 200, 850, 490] }, 2400, true, false);
  assert.equal(d.scale, 1); assert.match(d.reason, /경계/);
  d.ingest({ ...base, frame_size: null }, 2800, true, false);
  assert.equal(d.scale, 1);
});

test('sustained approach/recession changes uniform scale slowly within its limits', () => {
  const d = depth(); let previous = 1;
  for (let i = 1; i <= 35; i++) {
    d.ingest(sized(1 + Math.min(i, 20) * .015), 2400 + i * 400, true, false);
    assert.ok(Math.abs(d.scale - previous) <= .01801); previous = d.scale;
  }
  assert.ok(d.scale > 1.09 && d.scale <= 1.1, `approach ${d.scale}`);
  for (let i = 1; i <= 50; i++) d.ingest(sized(1.3 - Math.min(i, 35) * .015), 16400 + i * 400, true, false);
  assert.ok(d.scale < .95 && d.scale >= .9, `recession ${d.scale}`);
});

test('pose turns, tilt, silhouette mismatch, low confidence and loss hold the last depth', () => {
  const d = depth();
  for (let i = 1; i <= 25; i++) d.ingest(sized(1.2), 2400 + i * 400, true, false);
  const scale = d.scale;
  assert.ok(scale > 1.05);
  for (const [extra, ok, turning] of [
    [{ head: [700, 200], tail: [700, 500] }, true, false],
    [{ bbox: [550, 200, 850, 500] }, true, false],
    [{ conf: .1 }, false, false], [{}, true, true], [{}, false, false],
  ]) {
    d.ingest({ ...base, ...extra }, 13000, ok, turning);
    assert.equal(d.scale, scale); assert.equal(d.state, 'holding');
  }
});

test('a persistent stable new height is eventually accepted; pose-free depth is conservative', () => {
  const d = depth(false);
  for (let i = 1; i <= 30; i++) d.ingest(sized(1.4, { pose_conf: 0 }), 2400 + i * 400, true, false);
  assert.ok(d.scale > 1.025 && d.scale <= 1.04, `${d.scale}`);
  assert.match(d.reason, /보수적/);
});

test('new target, resolution, stream and long pause reset depth; duplicate frames do not', () => {
  const f = new FishTrackingFilter();
  for (let i = 0; i < 12; i++) f.ingest({ ...base, frame_id: i }, i * 400);
  assert.ok(f.depth.baseline);
  assert.equal(f.ingest({ ...base, frame_id: 10, bbox: [0, 0, 100, 300] }, 4600), false);
  assert.ok(f.depth.baseline);
  f.ingest({ ...base, track_id: 2, frame_id: 0 }, 4800);
  assert.equal(f.depth.baseline, null); assert.equal(f.status(4800), 'acquiring');
  for (let i = 1; i < 12; i++) f.ingest({ ...base, track_id: 2, frame_id: i }, 4800 + i * 400);
  assert.ok(f.depth.baseline);
  f.ingest({ ...base, track_id: 2, frame_id: 12, frame_size: [1920, 1080] }, 9600);
  assert.equal(f.depth.baseline, null);
  for (let i = 13; i < 25; i++) f.ingest({ ...base, track_id: 2, frame_id: i }, 9600 + i * 400);
  f.ingest({ ...base, stream_id: 'new', frame_id: 0 }, 20000);
  assert.equal(f.depth.baseline, null); assert.equal(f.depth.scale, 1);
});

test('slow motion has no dead band; low confidence cannot move or turn; timestamps never mix clocks', () => {
  const f = new FishTrackingFilter();
  for (let i = 0; i < 8; i++) f.ingest({ ...base, frame_id: i, timestamp_ms: 2000000000000 + i * 400 }, i * 400);
  let previous = f.x;
  for (let i = 8; i < 20; i++) {
    f.ingest({ ...base, frame_id: i, timestamp_ms: 2000000000000 + i * 400, center_norm: [.5 + (i - 7) * .001, .5] }, i * 400);
    assert.ok(f.x > previous); previous = f.x;
  }
  f.ingest({ ...base, frame_id: 20, conf: .1, center_norm: [.6, .6], head: [400, 350] }, 8000);
  assert.equal(f.x, previous); assert.equal(f.flip, false);
  assert.equal(f.ingest({ ...base, frame_id: 21 }, 7900), false);
  assert.equal(f.depth.scale, 1);
});

test('turn compression never collapses, depth preserves center and UI scale is separate', () => {
  const f = new FishTrackingFilter(), shown = createFishDisplay();
  f.flip = true; f.depth.scale = 1.1;
  for (let i = 0; i < 30; i++) {
    const compression = advanceFishDisplay(shown, f, 1 / 60);
    assert.ok(compression >= .78 && compression <= 1);
    assert.equal(shown.x, .5); assert.equal(shown.y, .5);
  }
  assert.equal(shown.flip, true); assert.ok(shown.scale > 1.09);
  f.flip = false; advanceFishDisplay(shown, f, .01, true);
  assert.equal(shown.flip, false); assert.equal(shown.turn, 1);
});

test('layer moves preserve IDs/geometry and other layers, and destination inserts at front', () => {
  const item = (id, layer) => ({ id, layer, type: 'cave', src: '/tunnel.png', x: 53, y: 42, width: 24, height: 18 });
  const items = [item('b1', undefined), item('m1', 'middle'), item('f1', 'front'), item('b2', 'back'), item('m2', 'middle'), item('f2', 'front')];
  const reordered = moveDecoration(items, 'm1', 1);
  assert.deepEqual(Array.from(reordered, v => v.id), ['b1', 'm2', 'f1', 'b2', 'm1', 'f2']);
  assert.equal(reordered[4], items[1]);
  const changed = changeDecorationLayer(items, 'b1', 'middle');
  assert.equal(changed.at(-1).id, 'b1'); assert.equal(changed.at(-1).y, 42);
  assert.deepEqual(Array.from(changed.slice(0, -1), v => v.id), ['m1', 'f1', 'b2', 'm2', 'f2']);
  assert.equal(moveDecoration(items, 'f2', 1), items);
});

test('keyboard/pointer region moves carry root and attachment lines with clamped deltas', () => {
  const rig = JSON.parse(readFileSync(path.join(__dirname, '../public/fish_sprites/fish_right.rig.json')));
  for (const key of ['tail', 'dorsal', 'lower']) {
    const part = rig[key], moved = moveRigPart(rig, key, part.rect[0] + .003, part.rect[1] + .003)[key];
    const before = part.root ? [part.root] : part.rootLine;
    const after = moved.root ? [moved.root] : moved.rootLine;
    for (let i = 0; i < before.length; i++) for (let axis = 0; axis < 2; axis++) assert.ok(Math.abs(after[i][axis] - before[i][axis] - .003) < 1e-9);
  }
});


test('long lost messages reset depth even when the socket keeps sending packets', () => {
  const f = new FishTrackingFilter();
  for (let i = 0; i < 12; i++) f.ingest({ ...base, frame_id: i }, i * 400);
  assert.ok(f.depth.baseline);
  for (let i = 12; i < 29; i++) f.ingest({ ...base, frame_id: i, state: 'lost', center_norm: null }, i * 400);
  assert.equal(f.depth.baseline, null); assert.equal(f.depth.scale, 1);
  f.ingest({ ...base, frame_id: 29 }, 11600);
  f.ingest({ ...base, frame_id: 30 }, 12000);
  assert.equal(f.depth.baseline, null, 'Recovery collects a fresh baseline');
});
