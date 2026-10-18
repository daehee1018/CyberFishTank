// Run after npm run build. Uses an isolated HTTP server and mocked backend;
// no real accounts, sensors, or feeder commands are touched.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const { chromium } = await import(process.env.CFT_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('dist');
let release = 1;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"private":"do not cache"}'); return; }
    const target = resolve(root, `.${path}`);
    if (!target.startsWith(root + sep) && target !== root) { res.writeHead(403).end(); return; }
    let file = target;
    let data;
    try { data = await readFile(file); } catch { file = resolve(root, 'index.html'); data = await readFile(file); }
    if (path === '/sw.js' && release > 1) data = Buffer.from(data.toString().replace(/const VERSION = '[^']+';/, `const VERSION = 'test-release-${release}';`));
    if (path === '/pwa-version.json' && release > 1) data = Buffer.from(JSON.stringify({ version: `test-release-${release}` }));
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  } catch { res.writeHead(500).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_CHROMIUM, args: ['--no-sandbox', '--use-fake-device-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
let backend = true;
let holdAuth;
let holdFish;
let authenticated = true;
let connections = 0;
let sensorReads = 0;
let feederWrites = 0;
let failedCommand = false;
let holdCommand;
let commandStarted = false;
const sockets = [];
const user = { id: 1, username: 'pwa-test', role: 'admin', cameraConfigured: true };
const sensor = { temperature: 25, ph: 6.7, water_level_detected: '1', tds: 120, turbidity_voltage: 2.2, timestamp: '2026-10-18T10:00:00Z' };
await context.routeWebSocket(/ggnu\.site/, socket => {
  connections++;
  sockets.push(socket);
});
await context.route('https://ggnu.site/**', async route => {
  if (!backend) { await route.abort('failed'); return; }
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/me' && holdAuth) await holdAuth;
  if (path === '/api/fish' && holdFish) await holdFish;
  let data = { success: true };
  let status = 200;
  if (path === '/api/me') data = { user: authenticated ? user : null };
  else if (path === '/api/fish') data = { success: true, fish: { species: 'betta', fishName: '테스트 베타', colorHue: 0, decorations: [], tankTheme: 'default', substrateColor: 'natural' } };
  else if (path === '/api/sensor-settings') data = { success: true, ranges: { temperatureMin: 24, temperatureMax: 26, phMin: 6, phMax: 7, pollutionWarningZ: 1, pollutionDangerZ: 2.5 } };
  else if (path === '/api/sensor-data/latest') { sensorReads++; data = { success: true, data: sensor }; }
  else if (path === '/api/sensor-data/pollution-baseline') data = { baseline: { turbidity: { mean: 2.2, std: .2 }, tds: { mean: 120, std: 10 } } };
  else if (path === '/api/live-camera-frame') data = {};
  else if (path === '/api/fish/rig') { status = 404; data = {}; }
  else if (path === '/api/feeder/status') data = { success: true, online: true, feed_count: 0, angle: 0, locked: false, last_feed_at: null };
  else if (path === '/api/feeder/feed' || path === '/api/feeder/reset') {
    feederWrites++;
    commandStarted = true;
    if (holdCommand) await holdCommand;
    if (failedCommand) { await route.abort('failed'); return; }
    data = { success: true, command: { command: 'feed' } };
  }
  else if (path === '/api/logout') authenticated = false;
  else if (path.includes('alerts') || path.includes('history') || path.includes('range') || path.includes('daily')) data = [];
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const output = resolve('output/pwa');
await mkdir(output, { recursive: true });
try {
  // Real startup gates: HTML splash, delayed session, delayed aquarium settings.
  let finishAuth;
  let finishFish;
  holdAuth = new Promise(done => { finishAuth = done; });
  holdFish = new Promise(done => { finishFish = done; });
  await page.goto(base);
  await page.locator('#cft-startup').waitFor();
  await page.getByText('로그인 상태를 확인하고 있어요').waitFor();
  assert(await page.locator('#root').evaluate(root => root.inert), 'Startup must block underlying controls');
  await page.screenshot({ path: resolve(output, 'startup-mobile.png'), fullPage: true });
  finishAuth();
  holdAuth = null;
  await page.getByText('내 어항을 준비하고 있어요').waitFor();
  // The same screen waits for fish data, but must expose recovery for a slow API.
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).waitFor({ timeout: 10000 });
  finishFish();
  holdFish = null;
  await page.locator('#cft-startup').waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: '내 어항 대시보드' }).waitFor();
  assert.equal(await page.locator('#root').evaluate(root => root.inert), false);
  await page.evaluate(() => window.dispatchEvent(new Event('cft:refresh')));
  assert.equal(await page.locator('#cft-startup').count(), 0, 'Background recovery must not show a splash');

  // Initial HTML remains useful even if the application bundle never arrives.
  const bootContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await bootContext.route('**/assets/*.js', route => route.abort());
  const bootPage = await bootContext.newPage();
  await bootPage.goto(base);
  await bootPage.locator('#cft-startup').waitFor();
  assert.equal(await bootPage.locator('.cft-startup-logo').evaluate(element => getComputedStyle(element).animationName), 'none');
  await bootPage.getByRole('button', { name: '다시 불러오기', exact: true }).waitFor({ timeout: 20000 });
  await bootPage.getByText('앱을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.').waitFor();
  await bootPage.screenshot({ path: resolve(output, 'startup-retry.png'), fullPage: true });
  await bootContext.close();

  backend = false;
  await page.goto(base);
  await page.getByRole('heading', { name: '어항에 연결하는 중입니다' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/', 'Failed session lookup must not redirect to login');
  backend = true;
  await page.getByRole('button', { name: '다시 연결', exact: true }).click();
  await page.getByRole('heading', { name: '내 어항 대시보드' }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(done => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }));
  });
  assert.equal(await page.getByText('새 버전이 준비되었습니다').count(), 0, 'First install is not an update');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);
  });
  assert.equal(await page.locator('.is-install').count(), 0, 'Desktop web must not show installation guidance');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '설치', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'mobile-install.png'), fullPage: true });
  await page.getByRole('button', { name: '설치', exact: true }).click();
  assert(await page.evaluate(() => Boolean(localStorage.getItem('cft-install-dismissed'))));
  await page.waitForFunction(() => document.querySelectorAll('.is-connection').length === 0);
  const previousReads = sensorReads;
  const previousConnections = connections;
  sockets.at(-1).close({ code: 1011, reason: 'test disconnect' });
  await page.waitForFunction(() => document.querySelectorAll('.is-connection').length === 0);
  await page.waitForTimeout(2000);
  assert(connections > previousConnections, 'Socket must retry without navigation');
  assert(sensorReads > previousReads, 'Socket reconnect must hydrate latest sensors');

  await context.setOffline(true);
  await page.getByText('인터넷 연결이 끊겼습니다').waitFor();
  assert(await page.getByRole('button', { name: '밥 주기', exact: true }).isDisabled());
  await page.screenshot({ path: resolve(output, 'mobile-disconnected.png'), fullPage: true });
  await page.goto(`${base}/records`);
  await page.getByRole('heading', { name: '어항에 연결할 수 없습니다' }).waitFor();
  assert.equal(feederWrites, 0);
  await page.screenshot({ path: resolve(output, 'offline-launch.png'), fullPage: true });
  await context.setOffline(false);
  await page.getByRole('heading', { name: '어항에 연결할 수 없습니다' }).waitFor({ state: 'hidden' });
  await page.goto(base);
  await page.getByRole('heading', { name: '내 어항 대시보드' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.cft-feeder-actions button')?.disabled);
  // A failed command is reported and never replayed on reconnect.
  failedCommand = true;
  await page.getByRole('button', { name: '밥 주기', exact: true }).click();
  await page.getByText(/명령 결과를 확인하지 못했습니다/).waitFor();
  failedCommand = false;
  await context.setOffline(true);
  await context.setOffline(false);
  await page.waitForTimeout(1800);
  assert.equal(feederWrites, 1, 'Commands must never replay');

  // Exercise an actual service worker update against the same origin/scope.
  const otherTab = await context.newPage();
  await otherTab.goto(base);
  await otherTab.getByRole('heading', { name: '내 어항 대시보드' }).waitFor();
  await otherTab.evaluate(() => { window.pwaTabMarker = 'keep-working'; });
  release = 2;
  await page.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 61000;
    window.dispatchEvent(new Event('online'));
    Date.now = now;
  });
  await page.getByText('새 버전이 준비되었습니다').waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.is-update').waitFor({ state: 'detached' });
  await context.setOffline(true);
  await page.getByText('인터넷 연결이 끊겼습니다').waitFor();
  assert.equal(await page.locator('.is-update').count(), 0, 'Desktop web must not show update guidance');
  await context.setOffline(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('새 버전이 준비되었습니다').waitFor();
  await page.waitForFunction(() => !document.querySelector('.cft-feeder-actions button')?.disabled);
  let finishCommand;
  holdCommand = new Promise(done => { finishCommand = done; });
  commandStarted = false;
  await page.getByRole('button', { name: '밥 주기', exact: true }).click();
  while (!commandStarted) await page.waitForTimeout(20);
  assert(await page.getByRole('button', { name: '업데이트', exact: true }).isDisabled(), 'Do not update during a device request');
  finishCommand();
  holdCommand = null;
  await page.getByRole('button', { name: '업데이트', exact: true }).waitFor();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === '업데이트')?.disabled);
  await page.screenshot({ path: resolve(output, 'mobile-update.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '업데이트', exact: true }).click();
  await page.waitForFunction(async () => (await caches.keys()).includes('cft-shell-test-release-2'));
  await page.getByRole('heading', { name: '내 어항 대시보드' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.is-update'));
  await otherTab.getByText('새 버전이 준비되었습니다').waitFor();
  assert.equal(await otherTab.evaluate(() => window.pwaTabMarker), 'keep-working', 'An update in another tab must not reload this tab');
  await otherTab.close();
  await page.evaluate(async () => {
    await fetch('/api/private-probe');
    await fetch('/api/feeder/feed', { method: 'POST' });
  });
  const cached = await page.evaluate(async () => {
    const cachesForApp = (await caches.keys()).filter(key => key.startsWith('cft-shell-'));
    return (await Promise.all(cachesForApp.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat();
  });
  assert(cached.some(url => url.endsWith('/offline.html')));
  assert(cached.every(url => !url.includes('/api/') && !url.includes('/uploads/')), 'Never cache account/device responses');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  authenticated = false;
  await page.evaluate(() => window.dispatchEvent(new Event('cft:refresh')));
  await page.waitForURL('**/login');
  // Test the iOS guidance and standalone detection without contacting production.
  const iosContext = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', serviceWorkers: 'block' });
  await iosContext.route('https://ggnu.site/**', route => route.abort());
  await iosContext.routeWebSocket(/ggnu\.site/, () => {});
  const iosPage = await iosContext.newPage();
  await iosPage.goto(`${base}/login`);
  await iosPage.getByRole('button', { name: '설치 방법', exact: true }).click();
  await iosPage.getByText(/Safari에서 공유 버튼/).waitFor();
  await iosPage.screenshot({ path: resolve(output, 'iphone-install-guide.png'), fullPage: true });
  await iosPage.getByRole('button', { name: '설치 안내 일주일 동안 닫기' }).click();
  await iosPage.reload();
  assert.equal(await iosPage.getByRole('button', { name: '설치 방법', exact: true }).count(), 0);
  await iosContext.addInitScript(() => {
    localStorage.removeItem('cft-install-dismissed');
    Object.defineProperty(navigator, 'standalone', { value: true });
  });
  await iosPage.reload();
  assert.equal(await iosPage.getByRole('button', { name: '설치 방법', exact: true }).count(), 0);
  await iosContext.close();
  assert.deepEqual(errors, []);
  console.log('PASS: startup/slow API/missing bundle/reduced motion, desktop web hides app notices, installation guidance, auth recovery/expiry, socket retry, offline launch/recovery, feeder protection, real worker update across tabs, cache privacy, mobile layout, iOS guidance/standalone');
} catch (error) {
  console.error('PWA check failed:', error.message, 'URL:', page.url(), 'page errors:', errors);
  console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 2000));
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await new Promise(done => server.close(done));
}
