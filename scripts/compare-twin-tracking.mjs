// Deterministic, synthetic comparison. This does not substitute for camera recordings.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports });
  return exports;
}
const { FishTrackingFilter } = load('../src/lib/fishTracking.ts');
const { FishTrackingFilter: LegacyFilter } = load('../src/dev/legacyFishTracking.ts');
const { advanceFishDisplay, createFishDisplay } = load('../src/lib/fishDisplay.ts');
const samples = Array.from({ length: 150 }, (_, i) => {
  const at = i * 400;
  const phase = i < 40 ? 'stationary' : i < 90 ? 'slow' : i < 120 ? 'fast' : 'depth';
  const truthX = i < 40 ? .3 : i < 90 ? .3 + (i - 40) * .001 : i < 120 ? .35 + (i - 90) * .012 : .698;
  const size = i < 120 ? 1 : 1 + Math.min(20, i - 120) * .015;
  const jitter = phase === 'stationary' ? .008 * Math.sin(i * 2.17) : 0;
  const height = 140 * (i === 131 ? 1.9 : size);
  return { at_ms: at, phase, truthX, source: 'demo', stream_id: 'synthetic', track_id: 1, frame_id: i,
    timestamp_ms: 1800000000000 + at, state: 'tracked', conf: .8, pose_conf: .8,
    center_norm: [truthX + jitter, .45], frame_size: [1280, 720],
    head: [700 + 100 * size, 350], tail: [700 - 100 * size, 350], bbox: [700 - 150 * size, 350 - height / 2, 700 + 150 * size, 350 + height / 2],
  };
});
const old = new LegacyFilter(), current = new FishTrackingFilter(), shown = createFishDisplay();
let oldX = .5, cursor = 0, sample = samples[0], previous = 0;
const rows = [];
for (let t = 0; t <= samples.at(-1).at_ms; t += 1000 / 60) {
  while (cursor < samples.length && samples[cursor].at_ms <= t) {
    sample = samples[cursor++]; old.ingest(sample, sample.at_ms); current.ingest(sample, sample.at_ms);
  }
  const dt = (t - previous) / 1000; previous = t;
  oldX += (old.x - oldX) * (1 - Math.exp(-dt / .3));
  advanceFishDisplay(shown, current, dt);
  rows.push({ at_ms: t, phase: sample.phase, truthX: sample.truthX, oldX, improvedX: shown.x,
    rawHeight: current.depth.rawHeight, height: current.depth.height, scale: shown.scale, depth: current.depth.state, reason: current.depth.reason });
}
const rms = values => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
const range = (phase, after) => rows.filter(row => row.phase === phase && row.at_ms > after);
const stationary = range('stationary', 4000), slow = range('slow', 20000), fast = range('fast', 40000);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const result = {
  input: 'Synthetic fixed 1280×720, 400ms packets, 60Hz display, horizontal valid pose. Not a real-camera measurement.',
  settings: { positionMinCutoff: .65, positionBeta: 4, derivativeCutoff: 1, displaySeconds: .085, scaleRange: [.9, 1.1] },
  stationaryRmsNormalizedX: { legacy: rms(stationary.map(v => v.oldX - .3)), improved: rms(stationary.map(v => v.improvedX - .3)) },
  slowMeanLagMs: { legacy: mean(slow.map(v => v.truthX - v.oldX)) / (.001 / 400), improved: mean(slow.map(v => v.truthX - v.improvedX)) / (.001 / 400) },
  fastMeanLagMs: { legacy: mean(fast.map(v => v.truthX - v.oldX)) / (.012 / 400), improved: mean(fast.map(v => v.truthX - v.improvedX)) / (.012 / 400) },
  depthScaleRange: [Math.min(...rows.map(v => v.scale)), Math.max(...rows.map(v => v.scale))],
  caveat: 'Lag is against the latest sampled ground truth, not interpolated video truth. Fin spreading without pose/length evidence can still be confused with approach.',
};
const output = new URL('../output/twin-depth/', import.meta.url); mkdirSync(output, { recursive: true });
writeFileSync(new URL('synthetic-input.json', output), JSON.stringify(samples, null, 2));
writeFileSync(new URL('tracking-comparison.json', output), JSON.stringify(result, null, 2));
writeFileSync(new URL('tracking-trace.csv', output), [Object.keys(rows[0]).join(','), ...rows.map(row => Object.values(row).join(','))].join('\n'));
console.log(JSON.stringify(result, null, 2));
