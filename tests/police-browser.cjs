const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Usuário/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.__policePackets=[];const Original=window.EventSource;window.EventSource=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{const p=JSON.parse(e.data);if(['hello','police-state','police-motion'].includes(p.type)){window.__policePackets.push(p);if(window.__policePackets.length>100)window.__policePackets.shift();}});}};});
    // Test-only camera override, never changes source files or exposes a game endpoint.
    await page.route('http://localhost:4212/',async route=>{const response=await route.fetch(),body=await response.text();await route.fulfill({response,body:body.replace('updatePlayerCamera(dt);',`updatePlayerCamera(dt);if(window.__policeView){const p=LowkeyCityLayout.policePoint(0,12),t=LowkeyCityLayout.policePoint(0,-2);camera.position.set(p.x,3.3,p.z);camera.lookAt(t.x,1.4,t.z);if(window.__policeView===2){const packet=[...window.__policePackets].reverse().find(p=>p.type==='police-motion'),tuple=packet?.cars[0],c=tuple?{x:tuple[1],z:tuple[3]}:window.__policePackets.find(p=>p.type==='police-state')?.cars[0];if(c){camera.position.set(c.x+7,4,c.z+7);camera.lookAt(c.x,1,c.z);}}}`)});});
    const registration=await context.request.post('http://localhost:4212/api/auth/register',{data:{username:'c_'+(mobile?'m':'pc')+'_'+Date.now().toString(36),password:'Synthetic-police-browser-123'}});assert.equal(registration.status(),201);
    await page.goto('http://localhost:4212/');await page.locator('#startButton').click();await page.evaluate(()=>document.exitPointerLock?.());await page.waitForFunction(()=>window.__policePackets.some(p=>p.type==='police-state'));
    const hello=await page.evaluate(()=>window.__policePackets.find(p=>p.type==='hello')),initial=await page.evaluate(()=>window.__policePackets.find(p=>p.type==='police-state'));assert.equal(initial.officers.length,6);assert.equal(initial.cars.length,2);
    await page.route('**/api/state',route=>route.abort());let position={...hello.spawn,y:0};
    for(let i=0;i<12;i++){position.z+=2.8;await page.waitForTimeout(230);const r=await context.request.post('http://localhost:4212/api/state',{data:{id:hello.id,sequence:10000+i,position}});assert.equal(r.status(),204);}
    const shot=await context.request.post('http://localhost:4212/api/combat',{data:{id:hello.id,action:'glock',facing:0,pitch:-1.3}});assert.equal(shot.status(),204);
    await page.locator('.police-hud').waitFor({state:'visible'});assert.match(await page.locator('.police-hud').textContent(),/PROCURADO/);
    assert.equal(await page.locator('.police-hud').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),true);
    await page.evaluate(()=>window.__policeView=1);await page.waitForTimeout(500);await page.screenshot({path:mobile?'preview-police-mobile.png':'preview-police-station.png'});
    if(!mobile){await page.evaluate(()=>window.__policeView=2);await page.waitForTimeout(200);await page.screenshot({path:'preview-police-patrol.png'});}
    assert.deepEqual(errors,[]);console.log(JSON.stringify({mobile,officers:6,cars:2,wantedHud:true,errors}));await context.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
