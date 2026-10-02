import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
test('accepted shots trigger police; detention survives reconnect and police damage uses the normal death/respawn lifecycle',{timeout:55000},async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-police-test-')),reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  for(const file of ['server.mjs','city-layout.js','world-systems.js','zombies-server.mjs','game-security.mjs','weapons.js','weapons-server.mjs','social-server.mjs','police-server.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
  // Isolated synthetic spawn, never modifies the actual game or real accounts.
  const serverFile=join(fixture,'server.mjs');await writeFile(serverFile,(await readFile(serverFile,'utf8')).replace('{ x: Math.cos(angle) * radius, y: 18, z: 5 + Math.sin(angle) * radius }',"(authenticatedAccount.username==='police_shooter'?{x:-60,y:3.2,z:-52}:{x:-60,y:-.025,z:-60})"));
  const child=spawn(process.execPath,[serverFile],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']}),streams=[],base=`http://127.0.0.1:${port}`;let ready=false,logs='';child.stdout.on('data',c=>ready||=String(c).includes('multiplayer pronta'));child.stderr.on('data',c=>logs+=c);
  async function waitFor(fn,attempts=800){for(let i=0;i<attempts;i++){const result=fn();if(result)return result;await delay(10);}throw Error('Timeout '+logs);}
  let cookie='';const post=(player,path,data)=>fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({...data,...(player?{id:player.id}:{})})});
  async function connect(){const abort=new AbortController();streams.push(abort);const response=await fetch(base+'/api/events',{headers:{cookie},signal:abort.signal}),reader=response.body.getReader(),events=[],decoder=new TextDecoder();let buffer='';void(async()=>{try{for(;;){const c=await reader.read();if(c.done)return;buffer+=decoder.decode(c.value,{stream:true});let n;while((n=buffer.indexOf('\n\n'))>=0){const s=buffer.slice(0,n);buffer=buffer.slice(n+2);if(s.startsWith('data: '))events.push(JSON.parse(s.slice(6)));}}}catch{}})();const hello=await waitFor(()=>events.find(e=>e.type==='hello'));return{id:hello.id,events};}
  try{
    await waitFor(()=>ready);const registration=await post(null,'/api/auth/register',{username:'police_synthetic',password:'Synthetic-police-test-123'});assert.equal(registration.status,201);cookie=registration.headers.get('set-cookie').split(';')[0];const player=await connect();
    assert.equal((await post(player,'/api/combat',{action:'hacked'})).status,400);await delay(120);assert.equal(player.events.filter(e=>e.type==='police-wanted'&&e.stars>0).length,0);
    assert.equal((await post(player,'/api/combat',{action:'glock',pitch:-1.3,facing:0})).status,204);await waitFor(()=>player.events.find(e=>e.type==='police-wanted'&&e.stars===1));
    const detained=await waitFor(()=>player.events.find(e=>e.type==='police-arrest'));assert.ok(detained.until-detained.serverTime<=20000);assert.equal((await post(player,'/api/weapon',{weaponId:'ak47'})).status,409);assert.equal((await post(player,'/api/combat',{action:'glock'})).status,409);assert.equal((await post(player,'/api/vehicle',{action:'enter',vehicleId:'car-1'})).status,409);
    assert.equal((await post(player,'/api/state',{position:{x:100,y:0,z:100}})).status,204);const reconnect=await connect(),again=await waitFor(()=>reconnect.events.find(e=>e.type==='police-arrest'));assert.equal(again.until,detained.until);assert.deepEqual(again.position,detained.position);
    const shooterRegistration=await post(null,'/api/auth/register',{username:'police_shooter',password:'Synthetic-police-test-123'});assert.equal(shooterRegistration.status,201);cookie=shooterRegistration.headers.get('set-cookie').split(';')[0];const shooter=await connect();
    assert.equal((await post(shooter,'/api/combat',{action:'glock',pitch:-1.3,facing:0})).status,204);await waitFor(()=>shooter.events.find(e=>e.type==='police-shot'&&e.hit));
    const death=await waitFor(()=>shooter.events.find(e=>e.type==='weapon-health'&&e.health===0),2500);assert.ok(death.deadUntil-Date.now()>9000);assert.equal((await post(shooter,'/api/combat',{action:'glock'})).status,409);assert.equal(death.ghost,undefined,'normal police death must not enable Zombie ghost flight');
    await delay(10300);const respawn=await waitFor(()=>shooter.events.find(e=>e.type==='weapon-health'&&e.health===100&&e.respawnPosition));assert.equal(respawn.deadUntil,0);
    assert.equal(logs.includes('ReferenceError'),false);assert.equal(logs.includes('TypeError'),false);
  }finally{for(const abort of streams)abort.abort();const stopped=once(child,'exit');child.kill();await stopped;assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-police-test-'));await rm(fixture,{recursive:true,force:true});}
});
