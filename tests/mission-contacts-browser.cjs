const {chromium}=require('C:/Users/Usuário/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const context=await browser.newContext({viewport:{width:960,height:640}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:4214/',async route=>{const response=await route.fetch();let body=(await response.text()).replace('  gameMissions=LowkeyMissions.create','  window.__contactsReview={scene,avatar,camera,id:()=>localId};\n  gameMissions=LowkeyMissions.create');body=body.replace('updatePlayerCamera(dt);','updatePlayerCamera(dt);if(window.__contactsReview.focus){const p=window.__contactsReview.focus;avatar.position.set(p.x,p.y,p.z+5);camera.position.set(p.x+5,p.y+4,p.z+7);camera.lookAt(p.x,p.y+1.4,p.z);}');await route.fulfill({response,body});});
 // Camera fixture repositions the local avatar; movement validation is covered by separate real network tests.
 await page.route('**/api/state',route=>route.fulfill({status:204}));
 await context.request.post('http://localhost:4214/api/auth/register',{data:{username:'contacts_'+Date.now().toString(36),password:'Synthetic-test-123'}});
 await page.goto('http://localhost:4214/');await page.locator('#startButton').click();await page.waitForFunction(()=>window.__contactsReview?.id());await page.evaluate(()=>document.exitPointerLock?.());
 await page.locator('.mission-toggle').click();await page.getByRole('button',{name:'INICIAR ENTREGA',exact:true}).click();await page.waitForFunction(()=>window.__contactsReview.scene.children.filter(g=>g.userData.missionContact).length===2);
 const details=await page.evaluate(async()=>{const b=window.__contactsReview,model=await (await fetch('/api/missions?id='+b.id())).json();b.focus=model.active.pickup;const contacts=b.scene.children.filter(g=>g.userData.missionContact);b.firstContacts=contacts;return {active:model.active,npcs:contacts.map(g=>({name:g.userData.playerName,position:g.position.toArray(),role:g.userData.missionContact}))};});
 assert.equal(details.npcs.length,2);assert.equal(details.npcs[0].name,details.active.pickup.contact.name);assert.equal(details.npcs[1].name,details.active.destination.contact.name);
 assert.deepEqual(details.npcs[0].position,[details.active.pickup.x,details.active.pickup.y,details.active.pickup.z]);
 await page.waitForTimeout(3600);assert.equal(await page.evaluate(()=>{const b=window.__contactsReview;return b.scene.children.filter(g=>g.userData.missionContact).length===2&&b.firstContacts.every(g=>g.parent===b.scene);}),true,'polling reuses the same two rigs');
 await page.screenshot({path:__dirname+'/delivery-contacts.png'});
 await page.getByRole('button',{name:'CANCELAR',exact:true}).click();await page.waitForFunction(()=>window.__contactsReview.scene.children.filter(g=>g.userData.missionContact).length===0);
 assert.deepEqual(errors,[]);console.log('PASS: two rendered contacts, persistent identities, no polling duplicates, clean cancellation, no browser errors');await context.close();
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
