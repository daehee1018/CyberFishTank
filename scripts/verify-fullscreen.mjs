// Built UI with an isolated static server and mocked APIs/camera; no real devices.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const { chromium } = await import(process.env.CFT_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('dist');
const server = createServer(async (req, res) => {
  const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
  if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403).end(); return; }
  let file = path;
  let data;
  try { data = await readFile(file); } catch { file = resolve(root, 'index.html'); data = await readFile(file); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream');
  res.end(data);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_CHROMIUM, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const output = resolve('output/fullscreen');
await mkdir(output, { recursive: true });
const frame = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#18616b"/><path d="M0 310Q150 280 320 310T640 310V360H0" fill="#c7c0a3"/><ellipse cx="330" cy="180" rx="50" ry="24" fill="#ff9465"/><path d="M285 180 235 140v80Z" fill="#e88a62"/><circle cx="358" cy="174" r="4" fill="#153f49"/></svg>');
const errors = [];
try {
  for (const mode of ['desktop-native', 'mobile-fallback', 'mobile-orientation-lock', 'desktop-rejected']) {
    const mobile = mode.startsWith('mobile-');
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, permissions: ['camera'], serviceWorkers: 'block' });
    if (mobile) {
      await context.exposeBinding('cftTestLandscape', async ({ page }) => page.setViewportSize({ width: 844, height: 390 }));
      await context.addInitScript(({ supported }) => {
        Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true });
        window.orientationRequests = [];
        window.orientationUnlocks = 0;
        screen.orientation.lock = async direction => {
          window.orientationRequests.push(direction);
          if (!supported) throw new DOMException('Test orientation denial', 'NotSupportedError');
          await window.cftTestLandscape();
        };
        screen.orientation.unlock = () => { window.orientationUnlocks++; };
      }, { supported: mode === 'mobile-orientation-lock' });
    }
    if (mode === 'desktop-rejected') await context.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Disabled for fallback test', 'NotAllowedError')); });
    let captures = 0;
    await context.routeWebSocket(/ggnu\.site/, () => {});
    await context.route('https://ggnu.site/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = { success: true };
      let status = 200;
      if (path === '/api/me') data = { user: { id: 1, username: 'fullscreen-test', role: 'admin', cameraConfigured: true } };
      else if (path === '/api/fish') data = { success: true, fish: { species: 'betta', fishName: '베타', decorations: [], colorHue: 0, tankTheme: 'default', substrateColor: 'natural' } };
      else if (path === '/api/sensor-settings') data = { success: true, ranges: { temperatureMin: 24, temperatureMax: 26, phMin: 6, phMax: 7, pollutionWarningZ: 1, pollutionDangerZ: 2.5 } };
      else if (path === '/api/sensor-data/latest') data = { data: { temperature: 25, ph: 6.7, water_level_detected: '1', tds: 120, turbidity_voltage: 2.2, timestamp: new Date().toISOString() } };
      else if (path === '/api/live-camera-frame') data = { image: frame };
      else if (path === '/api/fish/rig') { status = 404; data = {}; }
      else if (path === '/api/feeder/status') data = { success: true, online: true, feed_count: 0, angle: 0, locked: false };
      else if (path === '/api/camera/frame') captures++;
      else if (path.includes('alerts') || path.includes('range') || path.includes('history')) data = [];
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(`${mode}: ${error.message}`));
    const screenshot = async name => page.screenshot({ path: resolve(output, `${mode}-${name}.png`) });
    try {
      await page.goto(base);
      await page.locator('#cft-startup').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: '전체화면 보기', exact: true }).waitFor();
      await page.locator('.cft-live-aquarium').evaluate(element => { window.savedViewer = element; window.savedVideo = element.querySelector('video'); });
      await page.getByRole('button', { name: '전체화면 보기', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '어항 전체화면' });
      await dialog.waitFor();
      await page.waitForTimeout(150);
      if (mobile) {
        assert(await page.evaluate(() => window.orientationRequests.includes('landscape')), 'Request landscape on mobile fullscreen entry');
        if (mode === 'mobile-fallback') {
          await page.getByText('가로로 돌려주세요', { exact: true }).waitFor();
          assert.equal(await dialog.locator('.aquarium').evaluate(element => getComputedStyle(element).visibility), 'hidden', 'Never show a portrait aquarium');
          assert(await dialog.locator('.aquarium').evaluate(element => [...element.querySelectorAll('*')].every(child => getComputedStyle(child).visibility === 'hidden')), 'Child sprites cannot override portrait visibility');
          assert(await page.getByRole('button', { name: '전체화면 닫기', exact: true }).isVisible());
          for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Tab');
            assert(await page.getByRole('button', { name: '전체화면 닫기', exact: true }).evaluate(element => document.activeElement === element), 'Only close is focusable in portrait');
          }
          await screenshot('portrait-guide');
          await page.setViewportSize({ width: 844, height: 390 });
        }
        await page.getByText('가로로 돌려주세요', { exact: true }).waitFor({ state: 'hidden' });
        assert(await page.evaluate(() => innerWidth > innerHeight), 'Mobile viewer is landscape');
      }
      assert(await page.evaluate(() => window.savedViewer === document.querySelector('.cft-live-aquarium')), 'Do not remount the renderer');
      const fits = await dialog.evaluate(element => { const r = element.getBoundingClientRect(); return Math.abs(r.width - innerWidth) < 2 && Math.abs(r.height - innerHeight) < 2; });
      assert(fits, `${mode} must fill the viewport`);
      if (mode === 'desktop-native') assert(await page.evaluate(() => Boolean(document.fullscreenElement)), 'Use real native fullscreen when supported');
      else assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);
      assert(await page.locator(mobile ? '.cft-mobile-header' : '.cft-sidebar').evaluate(element => Boolean(element.closest('[inert]'))), 'Background controls must be inert');
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        assert(await dialog.evaluate(element => element.contains(document.activeElement)), 'Keyboard focus stays inside fullscreen');
      }
      await screenshot('digital');
      await dialog.getByRole('button', { name: 'Live Render', exact: true }).click();
      await dialog.locator('.cft-live-aquarium > img').waitFor();
      assert.equal(await dialog.locator('.cft-live-aquarium > img').evaluate(element => getComputedStyle(element).objectFit), 'contain');
      await screenshot('live');
      await dialog.getByRole('button', { name: '카메라 켜기', exact: true }).click();
      await dialog.getByRole('button', { name: '카메라 끄기', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('video')?.srcObject?.getVideoTracks()[0]?.readyState === 'live');
      await page.locator('video').evaluate(video => { window.savedTrack = video.srcObject.getVideoTracks()[0]; });
      await dialog.getByRole('button', { name: 'Digital Twin', exact: true }).click();
      assert(await page.locator('video').evaluate(video => video.srcObject.getVideoTracks()[0] === window.savedTrack));
      if (mobile) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByText('가로로 돌려주세요', { exact: true }).waitFor();
        assert.equal(await dialog.locator('.aquarium').evaluate(element => getComputedStyle(element).visibility), 'hidden');
        assert(await page.locator('video').evaluate(video => video.srcObject.getVideoTracks()[0] === window.savedTrack && window.savedTrack.readyState === 'live'), 'Portrait guide keeps the camera stream');
        await page.setViewportSize({ width: 844, height: 390 });
        await dialog.waitFor();
        await page.getByText('가로로 돌려주세요', { exact: true }).waitFor({ state: 'hidden' });
        await screenshot('landscape');
        assert(await page.evaluate(() => window.savedViewer === document.querySelector('.cft-live-aquarium')), 'Rotation must preserve the renderer');
      }
      const previousCaptures = captures;
      await page.waitForTimeout(900);
      assert(captures > previousCaptures, 'Camera capture continues in fullscreen');
      await page.getByRole('button', { name: '전체화면 닫기', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !history.state?.cftFullscreen);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      if (mode === 'mobile-orientation-lock') assert(await page.evaluate(() => window.orientationUnlocks >= 1), 'Release orientation lock on exit');
      if (mode === 'mobile-fallback') assert.equal(await page.evaluate(() => window.orientationUnlocks), 0, 'Do not unlock a lock that was denied');
      assert(await page.locator('video').evaluate(video => video === window.savedVideo && video.srcObject.getVideoTracks()[0] === window.savedTrack && window.savedTrack.readyState === 'live'), 'Closing fullscreen must keep the camera alive');
      assert.equal(await page.locator(mobile ? '.cft-mobile-header' : '.cft-sidebar').evaluate(element => Boolean(element.closest('[inert]'))), false);
      assert.equal(await page.getByRole('button', { name: '전체화면 보기', exact: true }).evaluate(element => document.activeElement === element), true, 'Restore focus to expand control');
      await page.getByRole('button', { name: '카메라 끄기', exact: true }).click();

      // Back closes only the viewer; it must not navigate away or consume two entries.
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '전체화면 보기', exact: true }).click();
      await dialog.waitFor();
      await page.goBack();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(page.url(), base + '/');
      assert.equal(await page.evaluate(() => history.state?.cftFullscreen), undefined);

      await page.getByRole('button', { name: '전체화면 보기', exact: true }).click();
      await dialog.waitFor();
      // Browser-initiated native exit is distinct from our close button.
      if (mode === 'desktop-native') {
        await page.waitForFunction(() => Boolean(document.fullscreenElement));
        await page.waitForTimeout(100);
        await page.evaluate(() => document.exitFullscreen());
      }
      else await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !history.state?.cftFullscreen);
      assert.equal(page.url(), base + '/');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`PASS ${mode}: landscape-only mobile/rotation guide/lock cleanup, digital/live switching, camera continuity, close/back/Escape, focus restoration`);
    } catch (error) {
      console.error(`${mode}: ${error.message}; URL: ${page.url()}; errors: ${errors.join(', ')}`);
      console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 1400));
      await screenshot('failure').catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
