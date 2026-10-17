import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.CFT_PLAYWRIGHT_MODULE || 'playwright');
const preset = JSON.parse(readFileSync(new URL('../public/fish_sprites/fish_right.rig.json', import.meta.url)));
let savedRig = structuredClone(preset);
let failRigSave = false;
const rigSource = () => ({success:true,imageUrl:'/fish_sprites/fish_right.png',imageHash:preset.imageHash,sourceSize:preset.sourceSize,rig:savedRig});
const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_CHROMIUM, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const anchor = new Date('2026-10-17T03:00:00Z');
const sensors = Array.from({length: 400 * 6}, (_, i) => ({ timestamp: new Date(anchor.getTime() - (2400 - i) * 14400000).toISOString(), temperature: 24.5 + Math.sin(i / 4) * .8, ph: 6.5 + Math.sin(i / 4) / 3, water_level_detected: '0', tds: 120, turbidity_voltage: 2.2 }));
const growth = Array.from({length: 400}, (_, i) => ({date: new Date(anchor.getTime() - (399 - i) * 86400000).toISOString().slice(0,10), daily_length_mm: 30 + i / 20}));
const activity = growth.map((row, i) => ({date: row.date, total_distance: 500 + 100 * Math.sin(i)}));
const alerts = Array.from({length: 12}, (_, i) => ({id: i + 1, type: i % 2 ? 'temperature-decrease' : 'ph-increase', title: i % 2 ? '수온 저하 경고' : 'pH 상승 경고', time: `2026-10-17 11:${String(30 - i).padStart(2,'0')}`, detail: i % 2 ? '수온이 적정 범위를 벗어났습니다.' : 'pH 7.0을 초과했습니다.'}));
const requests = [];
const errors = [];
let ranges = { temperatureMin:24,temperatureMax:26,phMin:6,phMax:7,pollutionWarningZ:1,pollutionDangerZ:2.5 };
let failSave = false;
let failLoad = false;
let authenticated = true;
let role = 'admin';
let fish = { species: 'betta', fishName: '베타', colorHue: 0, accessory: '', tankTheme: 'default', substrateColor: 'natural', decorations: [], activeGraphicDir: '' };
let feeder = { success: true, online: true, feed_count: 2, angle: 120, locked: true, last_feed_at: '2026-10-17T02:00:00Z', last_command: null, last_command_status: 'completed' };
let users = [{id:1,username:'admin',role:'admin',created_at:anchor.toISOString()},{id:2,username:'user',role:'user',created_at:anchor.toISOString()}];
const context = await browser.newContext({viewport:{width:1440,height:1080}, timezoneId:'Asia/Seoul', serviceWorkers:'block'});
let liveSocket;
await context.routeWebSocket(/.*/, socket => {
  if (socket.url().includes('127.0.0.1')) { socket.connectToServer(); return; }
  liveSocket = socket;
  setTimeout(() => {
    for (let i = 0; i < 20; i++) socket.send(JSON.stringify({ owner_user_id: 1, temperature: 24.3 + Math.sin(i) * .2, ph: 7.52, water_level: 0, tds:120, turbidity:2.2, timestamp:new Date(anchor.getTime() - (20-i)*60000).toISOString() }));

  }, 500);
});
await context.route('**/*', async route => {
 const req = route.request(), url = new URL(req.url());
 if(url.hostname === '127.0.0.1') return route.continue();
 const path=url.pathname, method=req.method();
 let body={}; try { body=req.postDataJSON() || {}; } catch {}
 if (method !== 'GET') requests.push({path,method,body});
 let response={success:true};
 if(path === '/api/me') response={user:authenticated?{id:1,username:'admin',role,cameraConfigured:true}:null};
 else if(path === '/api/login' || path === '/api/signup') {authenticated=true; response={success:true,user:{id:1,username:body.username,role,cameraConfigured:true}};}
 else if(path === '/api/logout') authenticated=false;
 else if(path === '/api/fish') {if(method==='POST') fish={...fish,...body}; response={success:true,fish};}
 else if(path === '/api/sensor-settings') {
   if(method === 'POST' && failSave) return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,error:'저장 테스트 오류'})});
   if(method === 'GET' && failLoad) return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,error:'조회 테스트 오류'})});
   if(method === 'POST') ranges = body.ranges;
   response={success:true,ranges};
 }
 else if(path === '/api/fish/graphics') response={success:true,graphics:[{id:1,styleName:'기본 그래픽',dirName:'',createdAt:anchor.toISOString()}]};
 else if(path === '/api/fish/rig') response=rigSource();
 else if(path === '/api/fish/graphics/1/rig') {
   if(method==='PUT') {
     if(failRigSave) return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,error:'저장 실패 테스트'})});
     savedRig=body.rig;
   }
   response=rigSource();
 }
 else if(path === '/api/fish/appearance') fish={...fish,...body};
 else if(path === '/api/aquarium-decorations') fish={...fish,decorations:body.decorations};
 else if(path === '/api/sensor-data') response=sensors;
 else if(path === '/api/sensor-data/latest') response={success:true,data:sensors.at(-1)};
 else if(path === '/api/sensor-data/pollution-baseline') response={baseline:{turbidity:{mean:2.2,std:.2},tds:{mean:120,std:10}}};
 else if(path === '/api/growth/daily') response=growth;
 else if(path === '/api/activity/daily') response=activity;
 else if(path === '/api/alerts') response=alerts;
 else if(path === '/api/feeder/status') response=feeder;
 else if(path === '/api/feeder/reset') {feeder={...feeder,feed_count:0,angle:0,locked:false,last_command_status:'completed'}; response={success:true,command:{command:'RESET'}};}
 else if(path === '/api/feeder/feed') {feeder={...feeder,feed_count:feeder.feed_count+1,last_command_status:'completed'}; response={success:true,command:{command:'FEED'}};}
 else if(path === '/api/feeder/history') response={success:true,month:url.searchParams.get('month'),days:[{date:'2026-10-17',count:2}]};
 else if(path === '/api/sensor-key' || path === '/api/sensor-key/rotate') response={success:true,sensorKey:'test-sensor-key'};
 else if(path === '/api/users') {if(method==='POST') users.push({id:3,...body,created_at:anchor.toISOString()}); response={success:true,users};}
 else if(path.startsWith('/api/users/')) users=users.filter(user=>user.id!==Number(path.split('/').at(-1)));
 await route.fulfill({contentType:'application/json',body:JSON.stringify(response)});
});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
await page.clock.setFixedTime(anchor);
const base=process.env.CFT_BASE_URL || 'http://127.0.0.1:5174';
const noOverflow=async label=>{const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(result.scroll<=result.width+1,`${label} overflow: ${JSON.stringify(result)}`);};
const shot=async name=>page.screenshot({path:new URL(`../output/digital-twin/${name}.png`,import.meta.url).pathname,fullPage:true});

try {
page.setDefaultTimeout(15000);
await page.goto(base);
await page.getByRole('heading', {name:'내 어항 대시보드'}).waitFor();
if (await page.locator('.aquarium').count() === 0) await page.getByRole('button',{name:'Digital Twin',exact:true}).click();
await page.locator('.twin-tracking-status').filter({hasText:'추적 대기'}).waitFor();
await page.locator('.fish-sprite-canvas canvas').waitFor();
await page.waitForFunction(() => getComputedStyle(document.querySelector('.fish-sprite-canvas')).visibility === 'visible');
const send = async (frame, extra={}) => {
  liveSocket.send(JSON.stringify({type:'fish_tracking',owner_user_id:1,source:'personal',stream_id:'test',track_id:1,frame_id:frame,center_norm:[.58,.48],state:'tracked',conf:.7,pose_conf:.5,frame_size:[1280,720],keypoints:{head:[800,350],tail:[600,350]},...extra}));
  await page.waitForTimeout(500);
};
await send(0); await send(1); await send(2); await send(3);
await page.locator('[data-status="tracking"]').waitFor();
const position = () => page.locator('[data-aquarium-fish]').evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
const before=await position();
assert(Math.abs(before.x-58)<1);
await send(4,{owner_user_id:2,center_norm:[.15,.15]});
assert(Math.abs((await position()).x-before.x)<1,'Another account must not move this fish');
await send(4,{center_norm:[.98,.03],pose_conf:0,keypoints:{head:[500,350],tail:[800,350]},bbox:[0,0,1279,719]});
const after=await position();
assert(Math.abs(after.x-before.x)<1,'One outlier must not teleport');
await send(5,{state:'lost',center_norm:null,keypoints:{head:null,tail:null}});
await page.locator('[data-status="lost"]').waitFor();
const stopped=await position();
await page.waitForTimeout(4700);
await page.locator('[data-status="disconnected"]').waitFor();
assert(Math.abs((await position()).x-stopped.x)<1,'A stopped connection must hold position');
await shot('tracking-interrupted-1440');
await send(0,{stream_id:'restart',center_norm:[.7,.4]});
await send(1,{stream_id:'restart',center_norm:[.7,.4]});
await send(2,{stream_id:'restart',center_norm:[.7,.4]});
await send(3,{stream_id:'restart',center_norm:[.7,.4]});
assert(Math.abs((await position()).x-70)<1);
// The deployed physical sender omits frame_size but sends valid pixel poses.
for (const frame of [4,5,6,7]) await send(frame, {
  stream_id:'restart', frame_size:null, pose_conf:.78,
  keypoints:{head:[528.5,146.5],tail:[606.1,141.7]},
});
assert(await page.locator('.twin-fish-facing').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a<0), 'Pixel-only pose must face left without frame dimensions');
assert(await page.locator('.twin-fish-orientation').evaluate(el=>Math.abs(Math.atan2(new DOMMatrix(getComputedStyle(el).transform).b,new DOMMatrix(getComputedStyle(el).transform).a)*180/Math.PI)<10), 'Heading should keep the measured slight tilt');
// The fin loop continues while samples stop. Image fallback survives context loss.
assert.equal(await page.locator('.fish-sprite-canvas canvas').count(),1);
for(const width of [1440,800,390]) {
 await page.setViewportSize({width,height:1000});
 await noOverflow(`dashboard ${width}`);
 await shot(`dashboard-${width}`);
}
await page.emulateMedia({reducedMotion:'reduce'});
assert.equal(await page.locator('.aquarium-bubble').first().evaluate(el=>getComputedStyle(el).display),'none');
await page.emulateMedia({reducedMotion:'no-preference'});
await page.locator('.fish-sprite-canvas canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
await page.waitForFunction(()=>getComputedStyle(document.querySelector('.fish-sprite > img')).visibility==='visible');
await page.setViewportSize({width:1440,height:1000});
await page.goto(`${base}/personal-settings`);
await page.getByRole('button',{name:'물고기 그래픽',exact:true}).click();
await page.getByRole('button',{name:'움직임 설정',exact:true}).click();
await page.getByRole('dialog').waitFor();
await page.getByRole('button',{name:'이 그래픽에 저장',exact:true}).waitFor();
await page.getByRole('button',{name:'꼬리',exact:true}).click();
await page.getByLabel('꼬리 뿌리점',{exact:true}).focus();
await page.keyboard.press('ArrowLeft');
await page.getByLabel('지느러미 움직임 강도').selectOption('high');
await page.getByLabel('빠른 수영 미리보기').check();
await page.waitForTimeout(500);
await shot('rig-editor-1440');
await page.setViewportSize({width:390,height:1000});
await noOverflow('rig editor mobile');
await shot('rig-editor-390');
failRigSave=true;
await page.getByRole('button',{name:'이 그래픽에 저장',exact:true}).click();
await page.getByRole('alert').filter({hasText:'저장 실패 테스트'}).waitFor();
assert.equal(savedRig.tail.strength,'medium','Failed save must preserve existing data');
failRigSave=false;
await page.getByRole('button',{name:'이 그래픽에 저장',exact:true}).click();
await page.getByRole('dialog').waitFor({state:'hidden'});
assert.equal(savedRig.tail.strength,'high');
assert(savedRig.tail.root[0]<preset.tail.root[0]);
await page.reload();
await page.getByRole('button',{name:'물고기 그래픽',exact:true}).click();
await page.getByRole('button',{name:'움직임 설정',exact:true}).click();
await page.getByRole('button',{name:'꼬리',exact:true}).click();
assert.equal(await page.getByLabel('지느러미 움직임 강도').inputValue(),'high');
await page.getByLabel('지느러미 움직임 강도').selectOption('low');
await page.getByRole('button',{name:'취소',exact:true}).click();
assert.equal(savedRig.tail.strength,'high');
await page.getByRole('button',{name:'움직임 설정',exact:true}).click();
await page.getByRole('button',{name:'꼬리',exact:true}).click();
// Move a region and resize it with actual pointer events.
const editor=page.locator('.rig-checker svg');
const box=await editor.boundingBox();
await page.mouse.move(box.x+box.width*.3,box.y+box.height*.6);
await page.mouse.down();
await page.mouse.move(box.x+box.width*.32,box.y+box.height*.62,{steps:5});
await page.mouse.up();
await page.getByRole('button',{name:'취소',exact:true}).click();
assert.equal(await page.locator('dialog').count(),0);
// An old graphic without a rig retains the original image.
savedRig=null;
await page.reload();
await page.getByRole('button',{name:'물고기 그래픽',exact:true}).waitFor();
await page.waitForTimeout(500);
assert.equal(await page.locator('.aquarium .fish-sprite-canvas canvas').count(),0);
assert(await page.locator('.aquarium .fish-sprite > img').evaluate(el=>el.complete && el.naturalWidth>0));
await page.setViewportSize({width:1440,height:1000});
await page.goto(`${base}/tools/tracking-replay.html`);
await page.getByRole('heading',{name:'디지털 트윈 입력 재생 검증',exact:true}).waitFor();
await page.getByRole('button',{name:'재생',exact:true}).click();
await page.waitForTimeout(2000);
await page.getByRole('button',{name:'일시 정지',exact:true}).click();
await shot('tracking-replay');
await page.getByRole('button',{name:'처음으로',exact:true}).click();
assert.equal(await page.getByRole('status').textContent(),'재생 대기');
assert.deepEqual(errors,[]);
console.log(JSON.stringify({success:true,checks:['waiting','continuous WebGL mesh','tracked input','outlier hold','lost/stopped connection','restart','desktop/tablet/mobile','context-loss image fallback','reduced motion','keyboard attachment editing','save failure preserves rig','save/reload','cancel'],errors}));
} catch (error) {
 await shot('failure');
 console.log(await page.evaluate(()=>({status:document.querySelector('.twin-tracking-status')?.textContent,canvasCount:document.querySelectorAll('canvas').length,images:[...document.querySelectorAll('.fish-sprite img')].map(el=>({src:el.src,loaded:el.complete,width:el.naturalWidth}))})));
 console.log({errors});
 throw error;
} finally { await browser.close(); }



