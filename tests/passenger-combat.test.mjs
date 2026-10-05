import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import '../city-layout.js';
import '../world-systems.js';
import {resolveWeaponAttack} from '../weapons-server.mjs';
import {addTestVehicles} from './vehicle-fixture.mjs';

test('drive-by rays ignore occupants of the same vehicle, not other opponents',()=>{
  const player={id:'passenger',vehicleId:'car',position:{x:-62,y:0,z:5},rotation:0},driver={id:'driver',vehicleId:'car',position:{x:-62,y:0,z:6},health:100},opponent={id:'opponent',position:{x:-62,y:0,z:9},health:100};
  const result=resolveWeaponAttack({weaponId:'glock',player,data:{cameraYaw:0,pitch:0},targets:[driver,opponent],segmentHit:(_a,_b,p)=>p===driver.position?.01:.05,block:()=>null,random:()=>.5});
  assert.equal(result.hits[0].target.id,'opponent');
});

test('car and motorcycle passengers shoot Glock; drivers and other weapons are blocked',{timeout:25000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lowkey-passenger-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const files=['server.mjs','city-layout.js','world-systems.js','zombies-server.mjs','game-security.mjs','weapons.js','weapons-server.mjs','social-server.mjs','missions-server.mjs','police-server.mjs'];
  for(const file of files)await copyFile(new URL('../'+file,import.meta.url),join(dir,file));
  // Synthetic stock/spawns on a road outside the expanded safe plaza.
  await addTestVehicles(dir,-48);
  let source=await readFile(join(dir,'server.mjs'),'utf8');source=source.replace('{ x: Math.cos(angle) * radius, y: 18, z: 5 + Math.sin(angle) * radius }',"{x:-62.5,y:0,z:authenticatedAccount.username==='driveby_driver'?3:7}");await writeFile(join(dir,'server.mjs'),source);
  const child=spawn(process.execPath,[join(dir,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:''},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',c=>logs+=c);let ready=false;child.stdout.on('data',c=>ready||=String(c).includes('multiplayer pronta'));
  const streams=[],base=`http://127.0.0.1:${port}`;
  async function waitFor(fn){for(let i=0;i<500;i++){const v=fn();if(v)return v;await delay(10);}throw new Error('Timeout: '+logs);}
  const post=(p,path,data)=>fetch(base+path,{method:'POST',headers:{cookie:p?.cookie||'','content-type':'application/json'},body:JSON.stringify({...data,...(p?{id:p.id}:{})})});
  async function connect(username){const r=await post(null,'/api/auth/register',{username,password:'Synthetic-passenger-test-123'});assert.equal(r.status,201);const cookie=r.headers.get('set-cookie').split(';')[0],abort=new AbortController();streams.push(abort);const response=await fetch(base+'/api/events',{headers:{cookie},signal:abort.signal}),events=[],reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';void(async()=>{try{for(;;){const c=await reader.read();if(c.done)return;buffer+=decoder.decode(c.value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const data=buffer.slice(0,end);buffer=buffer.slice(end+2);if(data.startsWith('data: '))events.push(JSON.parse(data.slice(6)));}}}catch{}})();const hello=await waitFor(()=>events.find(e=>e.type==='hello'));return{cookie,id:hello.id,events};}
  try{
    await waitFor(()=>ready);const driver=await connect('driveby_driver'),passenger=await connect('driveby_passenger');
    for(const vehicleId of ['plaza-car','plaza-moto']){
      if(vehicleId==='plaza-moto'){await delay(400);await post(driver,'/api/state',{position:{x:-60,y:0,z:6.5}});await delay(300);await post(driver,'/api/state',{position:{x:-60,y:0,z:8.8}});}
      assert.equal((await post(driver,'/api/vehicle',{action:'enter',vehicleId})).status,200);
      if(vehicleId==='plaza-moto'){await delay(300);assert.equal((await post(passenger,'/api/state',{position:{x:-63,y:0,z:8.8}})).status,204);}
      const boarding=await post(passenger,'/api/vehicle',{action:'interact',vehicleId});assert.equal(boarding.status,200,vehicleId+': '+await boarding.text());
      assert.equal((await post(driver,'/api/weapon',{weaponId:'glock'})).status,409);
      assert.equal((await post(driver,'/api/combat',{action:'glock'})).status,409);
      assert.equal((await post(passenger,'/api/weapon',{weaponId:'ak47'})).status,409);
      assert.equal((await post(passenger,'/api/weapon',{weaponId:'glock'})).status,200);await delay(180);
      const count=passenger.events.filter(e=>e.type==='glock-shot').length;
      assert.equal((await post(passenger,'/api/combat',{action:'glock',weaponId:'glock',cameraYaw:-Math.PI/2,facing:Math.PI/2,pitch:-.4})).status,204);
      const shot=await waitFor(()=>passenger.events.filter(e=>e.type==='glock-shot')[count]);assert.ok(shot.end.x>shot.start.x);assert.ok(shot.end.y>shot.start.y);
      assert.equal((await post(passenger,'/api/combat',{action:'punch'})).status,409);
      await delay(70);await post(passenger,'/api/state',{glockYaw:-.8,glockPitch:.3,glockAiming:true,position:{x:999,y:999,z:999}});
      const state=await waitFor(()=>passenger.events.findLast(e=>e.type==='state'&&e.player.id===passenger.id&&e.player.vehicleId===vehicleId&&e.player.glockYaw===-.8&&e.player.glockAiming));assert.ok(state.player.position.x<0);assert.equal(state.player.glockAiming,true);
      assert.equal((await post(passenger,'/api/vehicle',{action:'exit'})).status,200);assert.equal((await post(driver,'/api/vehicle',{action:'exit'})).status,200);
    }
  }finally{for(const s of streams)s.abort();const exited=once(child,'exit');child.kill();await exited;assert.ok(dir.startsWith(join(tmpdir(),'lowkey-passenger-')));await rm(dir,{recursive:true,force:true});}
});
