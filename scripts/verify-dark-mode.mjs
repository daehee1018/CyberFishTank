// Built application, isolated local server, mocked APIs. No production writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const { chromium } = await import(process.env.CFT_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('dist');
const server = createServer(async (req, res) => {
  const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
  if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403).end(); return; }
  let file = path, data;
  try { data = await readFile(file); }
  catch {
    if (extname(path)) { res.writeHead(404).end(); return; }
    file = resolve(root, 'index.html'); data = await readFile(file);
  }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream');
  res.end(data);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const output = resolve('output/dark-mode');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_CHROMIUM, args: ['--no-sandbox'] });
const errors = [];
const anchor = new Date('2026-10-18T03:00:00Z');
const sensors = Array.from({ length: 48 }, (_, i) => ({ timestamp: new Date(anchor.getTime() - (47 - i) * 1800000).toISOString(), temperature: 25 + Math.sin(i / 4), ph: 6.5, water_level_detected: '0', tds: 120, turbidity_voltage: 2.2 }));
async function mock(context) {
  let authenticated = true;
  await context.routeWebSocket(/ggnu\.site/, socket => {
    socket.send(JSON.stringify({ owner_user_id: 1, temperature: 25, ph: 6.5, water_level: 0, tds: 120, turbidity: 2.2, timestamp: anchor.toISOString() }));
  });
  await context.route('https://ggnu.site/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let data = { success: true };
    if (path === '/api/me') data = { user: authenticated ? { id: 1, username: 'admin', role: 'admin', cameraConfigured: true } : null };
    else if (path === '/api/logout') authenticated = false;
    else if (path === '/api/fish') data = { success: true, fish: { species: 'betta', fishName: '베타', tankTheme: 'default', substrateColor: 'natural', decorations: [], activeGraphicDir: '' } };
    else if (path === '/api/fish/rig') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    else if (path === '/api/fish/graphics') data = { success: true, graphics: [] };
    else if (path === '/api/sensor-settings') data = { success: true, ranges: { temperatureMin: 24, temperatureMax: 26, phMin: 6, phMax: 7, pollutionWarningZ: 1, pollutionDangerZ: 2.5 } };
    else if (path === '/api/sensor-data' || path === '/api/sensor-data/range') data = sensors;
    else if (path === '/api/sensor-data/latest') data = { data: sensors.at(-1) };
    else if (path === '/api/sensor-data/pollution-baseline') data = { baseline: { turbidity: { mean: 2.2, std: .2 }, tds: { mean: 120, std: 10 } } };
    else if (path === '/api/growth/daily' || path === '/api/activity/daily') data = [];
    else if (path === '/api/alerts') data = [{ id: 1, type: 'temperature-increase', title: '수온 상승 경고', time: '2026-10-18 12:00', detail: '수온을 확인해주세요.' }];
    else if (path === '/api/feeder/status') data = { success: true, online: true, feed_count: 2, angle: 120, locked: true, last_feed_at: anchor.toISOString() };
    else if (path === '/api/feeder/history') data = { success: true, month: url.searchParams.get('month'), days: [{ date: '2026-10-18', count: 2 }] };
    else if (path === '/api/sensor-key') data = { success: true, sensorKey: 'test-key' };
    else if (path === '/api/users') data = { success: true, users: [{ id: 1, username: 'admin', role: 'admin', created_at: anchor.toISOString() }] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
}
async function colors(locator) {
  return locator.evaluate(el => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, color: style.color, border: style.borderColor };
  });
}
async function dark(page) {
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#101b22');
}
async function checkContrast(page) {
  const text = await page.locator('.cft-page-heading h1, .cft-panel-heading h2, .cft-panel .cft-caption, .cft-admin-page h3, .cft-feeder-message').evaluateAll(elements => elements.filter(el => el.checkVisibility()).map(el => {
    let parent = el;
    while (parent.parentElement && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
    return { text: el.textContent, color: getComputedStyle(el).color, background: getComputedStyle(parent).backgroundColor };
  }));
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  for (const row of text) {
    const values = [luminance(row.color), luminance(row.background)].sort((a, b) => b - a);
    assert((values[0] + .05) / (values[1] + .05) >= 4.5, `Readable text contrast: ${JSON.stringify(row)}`);
  }
}
async function screenshot(page, name) {
  await page.waitForTimeout(250); // Let the existing button/nav transitions settle.
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
    await mock(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(anchor);
    await page.goto(base);
    await page.locator('.aquarium').waitFor();
    const lightWater = await page.locator('.aquarium').evaluate(el => getComputedStyle(el).getPropertyValue('--aquarium-water').trim());
    await page.goto(base + '/settings');
    const toggle = page.getByRole('switch', { name: '다크 모드', exact: true });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    const lightPanel = await colors(page.locator('.cft-panel').first());
    const lightInput = await colors(page.getByLabel('어항 이름', { exact: true }));
    await toggle.click();
    await dark(page);
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('cft-theme')), 'dark');
    assert.equal((await colors(page.locator('.cft-panel').first())).background, 'rgb(24, 40, 49)');
    assert.equal((await colors(page.getByLabel('어항 이름', { exact: true }))).background, 'rgb(16, 27, 34)');
    await screenshot(page, `settings-${width}`);
    await page.reload();
    await toggle.waitFor();
    await dark(page);
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');

    // Every page inherits the preference; aquarium colors remain unchanged.
    for (const path of ['/', '/records', '/personal-settings', '/admin', '/select-fish']) {
      await page.goto(base + path);
      await page.locator(path === '/select-fish' ? '.cft-fish-select-card' : '.cft-page-heading').waitFor();
      await dark(page);
      assert.equal((await colors(page.locator('body'))).background, 'rgb(16, 27, 34)');
      for (const panel of await page.locator('.cft-panel:not([hidden])').all()) {
        assert.equal((await colors(panel)).background, 'rgb(24, 40, 49)', `${width} ${path} panel`);
      }
      if (path === '/') {
        assert.equal(await page.locator('.aquarium').getAttribute('data-theme'), 'default');
        assert.equal(await page.locator('.aquarium').evaluate(el => getComputedStyle(el).getPropertyValue('--aquarium-water').trim()), lightWater);
        assert.equal((await colors(page.locator('.cft-feeder-message.is-warning'))).background, 'rgb(64, 53, 31)', 'Feeding limit keeps its warning color');
      }
      if (path === '/records') {
        await page.locator('.cft-record-chart-plot svg text').first().waitFor();
        assert.equal(await page.locator('.cft-record-chart-plot svg text').first().evaluate(el => getComputedStyle(el).fill), 'rgb(161, 184, 191)');
      }
      if (path === '/personal-settings') {
        await page.getByRole('button', { name: width === 390 ? '물고기' : '물고기 그래픽', exact: true }).click();
        assert.equal((await colors(page.locator('.cft-fish-appearance'))).background, 'rgb(24, 40, 49)');
        await screenshot(page, `graphics-${width}`);
        await page.getByRole('button', { name: '센서 연동', exact: true }).click();
        assert.equal((await colors(page.getByLabel('최저 수온 (°C)', { exact: true }))).background, 'rgb(16, 27, 34)');
      }
      await checkContrast(page);
      await screenshot(page, `${path.slice(1) || 'dashboard'}-${width}`);
    }

    // A second tab receives changes through the browser storage event.
    const other = await context.newPage();
    await other.goto(base + '/settings');
    await other.getByRole('switch', { name: '다크 모드', exact: true }).waitFor();
    await dark(other);
    await page.goto(base + '/settings');
    await toggle.click();
    await other.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.deepEqual(await colors(page.locator('.cft-panel').first()), lightPanel, 'Turning off restores the original light palette');
    assert.deepEqual(await colors(page.getByLabel('어항 이름', { exact: true })), lightInput);
    await page.reload();
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await toggle.click();
    await other.close();

    // Startup HTML is already dark while the application bundle is delayed.
    await page.route('**/assets/*.js', route => route.abort());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dark(page);
    assert.equal(await page.locator('#cft-startup').evaluate(el => getComputedStyle(el).color), 'rgb(222, 235, 238)');
    await screenshot(page, `startup-${width}`);
    await page.unroute('**/assets/*.js');
    await page.reload();
    await page.getByRole('switch', { name: '다크 모드', exact: true }).waitFor();

    if (width === 390) await page.getByLabel('계정 메뉴', { exact: true }).click();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('heading', { name: '다시 만나 반가워요', exact: true }).waitFor();
    await dark(page);
    await screenshot(page, `login-${width}`);
    await page.getByRole('link', { name: '회원가입', exact: true }).click();
    await page.getByRole('heading', { name: '나만의 어항을 시작하세요', exact: true }).waitFor();
    await dark(page);
    await screenshot(page, `signup-${width}`);
    await context.close();
    console.log(`PASS ${width}px: immediate toggle, persistence, cross-tab sync, all pages, chart labels, aquarium colors, light restore, startup and auth`);
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await mock(context);
  await context.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Test storage denial', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Test storage denial', 'SecurityError'); };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/settings');
  await page.getByRole('switch', { name: '다크 모드', exact: true }).click();
  await dark(page);
  await context.close();
  assert.deepEqual(errors, []);
  console.log('PASS storage unavailable: theme switches without runtime errors');
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
