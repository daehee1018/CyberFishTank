const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const path = require('node:path');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports });
  return exports;
}
const { vertexWeight, displacement, createSwimMotion, advanceSwimMotion } = load('src/lib/fishRig.ts');
const { createFishDisplay, advanceFishDisplay, depthAppearance } = load('src/lib/fishDisplay.ts');
const rig = JSON.parse(readFileSync(path.join(__dirname, '../public/fish_sprites/fish_right.rig.json')));

test('idle fins stay subtle, speed increases strokes and detection jitter stays idle', () => {
  const w = vertexWeight(.3, .55, rig);
  const peak = activity => Math.max(...Array.from({ length: 120 }, (_, i) => Math.hypot(...displacement(w, i / 10, false, activity))));
  const idle = peak(0);
  assert.ok(idle > 0 && idle < .003, `idle displacement ${idle}`);
  assert.equal(peak(.02), idle);
  assert.ok(peak(1) > idle * 4);
  const still = createSwimMotion(), moving = createSwimMotion();
  for (let i = 0; i < 120; i++) {
    advanceSwimMotion(still, .02, 1 / 60);
    advanceSwimMotion(moving, 1, 1 / 60);
  }
  assert.ok(moving.phase > still.phase * 2.5);
});

test('stopping settles the stroke without resetting phase; suspended tabs cannot jump a cycle', () => {
  const motion = createSwimMotion();
  for (let i = 0; i < 120; i++) advanceSwimMotion(motion, 1, 1 / 60);
  const phase = motion.phase;
  advanceSwimMotion(motion, 0, 1 / 60);
  assert.ok(motion.phase > phase && motion.phase - phase < .13);
  for (let i = 0; i < 120; i++) advanceSwimMotion(motion, 0, 1 / 60);
  assert.ok(motion.activity < .025);
  const beforeResume = motion.phase;
  advanceSwimMotion(motion, 0, 60);
  assert.ok(motion.phase - beforeResume < .2);
});

test('fin outline can move while body, tail root and attachment lines stay fixed', () => {
  const tailOnly = { ...rig, dorsal: null, lower: null };
  const border = vertexWeight(rig.tail.rect[0], .55, tailOnly);
  assert.ok(border.tail > .1, 'the free outline must not be pinned to the selection border');
  for (const [x, y] of [rig.tail.root, [.55, .4], [.74, .53]]) {
    for (let i = 0; i < 40; i++) assert.equal(Math.hypot(...displacement(vertexWeight(x, y, rig), i / 10, true)), 0);
  }
  for (const key of ['dorsal', 'lower']) {
    const isolated = { ...rig, tail: null, dorsal: null, lower: null, [key]: rig[key] };
    const [a, b] = rig[key].rootLine;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      assert.ok(Math.hypot(...displacement(vertexWeight(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, isolated), 1, true)) < 1e-10);
    }
  }
});

test('mirrored source rigs produce mirrored motion', () => {
  const point = ([x, y]) => [1 - x, y];
  const rect = ([x, y, w, h]) => [1 - x - w, y, w, h];
  const mirrored = { ...rig, facing: 'left', body: { rect: rect(rig.body.rect) },
    tail: { ...rig.tail, rect: rect(rig.tail.rect), root: point(rig.tail.root) },
    dorsal: { ...rig.dorsal, rect: rect(rig.dorsal.rect), rootLine: rig.dorsal.rootLine.map(point) },
    lower: { ...rig.lower, rect: rect(rig.lower.rect), rootLine: rig.lower.rootLine.map(point) } };
  for (const [x, y] of [[.3, .55], [.38, .22], [.55, .8]]) {
    for (const t of [0, .5, 1.5]) {
      const a = displacement(vertexWeight(x, y, rig), t, true);
      const b = displacement(vertexWeight(1 - x, y, mirrored), t, true);
      assert.ok(Math.abs(a[0] + b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10);
    }
  }
});

test('turn holds old-facing tilt until midpoint and finishes its latched direction', () => {
  const shown = createFishDisplay();
  shown.rotation = 20;
  const target = { x: .5, y: .5, flip: true, depth: { scale: 1.1 }, rotation: () => -20 };
  advanceFishDisplay(shown, target, .06);
  assert.equal(shown.flip, false); assert.equal(shown.rotation, 20);
  advanceFishDisplay(shown, target, .06);
  assert.equal(shown.flip, true); assert.ok(shown.rotation < 20);
  target.flip = false;
  advanceFishDisplay(shown, target, .06);
  assert.equal(shown.flip, true, 'a mid-turn update must not immediately flip the image again');
  for (let i = 0; i < 30; i++) advanceFishDisplay(shown, target, 1 / 60);
  assert.equal(shown.flip, false);
  assert.equal(shown.x, .5); assert.equal(shown.y, .5);
});

test('depth changes color only with observed scale and preserves the original near appearance', () => {
  assert.equal(depthAppearance(1), 'saturate(1) contrast(1) brightness(1)');
  assert.equal(depthAppearance(1.1), depthAppearance(1));
  assert.notEqual(depthAppearance(.9), depthAppearance(1));
  assert.equal(depthAppearance(.8), depthAppearance(.9));
});
