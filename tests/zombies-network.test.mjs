import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import '../city-layout.js';
import '../world-systems.js';

test('Zombies chat command starts shared rounds, disables friendly fire and synchronizes late joins', {timeout:20000}, async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-combat-test-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  await copyFile(new URL('../server.mjs',import.meta.url),join(fixture,'server.mjs'));
  await copyFile(new URL('../city-layout.js',import.meta.url),join(fixture,'city-layout.js'));
  await copyFile(new URL('../world-systems.js',import.meta.url),join(fixture,'world-systems.js'));
  for(const file of ['zombies-server.mjs','game-security.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
  const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
  const base=`http://127.0.0.1:${port}`,streams=[];
  async function waitFor(predicate){const deadline=Date.now()+4000;while(Date.now()<deadline){const result=predicate();if(result)return result;await delay(10);}throw new Error('Timed out waiting for combat event');}
  async function post(cookie,path,data){return fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)});}
  try{
    let ready=false;child.stdout.on('data',buffer=>{if(String(buffer).includes('multiplayer pronta'))ready=true;});await waitFor(()=>ready);
    async function player(username){
      const registration=await post('', '/api/auth/register',{username,password:'Synthetic-test-only-123'});assert.equal(registration.status,201);
      const cookie=registration.headers.get('set-cookie').split(';')[0],abort=new AbortController(),events=[];
      const response=await fetch(base+'/api/events',{headers:{cookie},signal:abort.signal});assert.equal(response.status,200);streams.push(abort);
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      void(async()=>{try{for(;;){const chunk=await reader.read();if(chunk.done)return;buffer+=decoder.decode(chunk.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(block.startsWith('data: '))events.push(JSON.parse(block.slice(6)));}}}catch{}})();
      const hello=await waitFor(()=>events.find(event=>event.type==='hello'));return{cookie,id:hello.id,events};
    }
    const attacker=await player('attacker'),friend=await player('friend');
    assert.equal((await post(attacker.cookie,'/api/state',{id:attacker.id,position:{x:0,y:.18,z:5}})).status,204);
    assert.equal((await post(friend.cookie,'/api/state',{id:friend.id,position:{x:0,y:.18,z:7}})).status,204);
    assert.equal((await post(attacker.cookie,'/api/chat',{id:attacker.id,text:'/zombies'})).status,204);
    const state=await waitFor(()=>friend.events.find(e=>e.type==='zombies-state'&&e.state.active));
    assert.equal(state.state.round,1);assert.equal(state.state.total,10);
    const enemy=await waitFor(()=>attacker.events.find(e=>e.type==='zombie-spawn')?.zombie);
    assert.ok(enemy.id.startsWith('zombie-'));assert.ok(enemy.appearance.hairStyle);
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'punch',swingId:1,facing:0,pitch:0})).status,200);
    const punch=await waitFor(()=>attacker.events.find(e=>e.type==='combat-punch'));assert.equal(punch.targetId,null,'cooperative mode never damages friends');
    const late=await player('late_join');
    const snapshot=await waitFor(()=>late.events.find(e=>e.type==='zombies-state'));
    assert.equal(snapshot.state.round,1);assert.ok(snapshot.zombies.some(z=>z.id===enemy.id),'late join receives existing enemies, not a restarted round');
    await delay(1750);
    const motion=attacker.events.filter(e=>e.type==='zombies-motion').at(-1),origin={x:0,y:1.65,z:5};
    const visible=motion.zombies.find(row=>{const spawned=attacker.events.find(e=>e.type==='zombie-spawn'&&e.zombie.id===row[0]);return spawned&&Date.now()>spawned.zombie.spawnAt+1600&&LowkeyWorld.shotBlock(origin,{x:row[1],y:row[2]+1.4,z:row[3]},LowkeyWorld.initialVehicles())===null;});
    assert.ok(visible,'at least one emerged enemy is visible from the player');
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'glock',aiming:true,facing:0,pitch:0,launchOrigin:origin,aimPoint:{x:visible[1],y:visible[2]+1.4,z:visible[3]}})).status,204);
    const hit=await waitFor(()=>attacker.events.find(e=>e.type==='zombie-hit'));assert.ok(hit.health<52,'real weapon request damages a server-owned zombie');
    await delay(550);
    assert.equal((await post(friend.cookie,'/api/chat',{id:friend.id,text:'/zombies stop'})).status,403,'another player cannot cancel the host session');
    assert.equal((await post(attacker.cookie,'/api/chat',{id:attacker.id,text:'/zombies stop'})).status,204);
    await waitFor(()=>late.events.find(e=>e.type==='zombies-state'&&!e.state.active));
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-combat-test-'));
    await rm(fixture,{recursive:true,force:true});
  }
});
