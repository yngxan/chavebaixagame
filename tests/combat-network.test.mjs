import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('punch PvP counts rapid clicks, resolves instantly, applies damage and knockback, and rejects floods', {timeout:15000}, async()=>{
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
    const attacker=await player('attacker'),target=await player('target');
    assert.equal((await post(attacker.cookie,'/api/state',{id:attacker.id,position:{x:0,y:.18,z:5}})).status,204);
    assert.equal((await post(target.cookie,'/api/state',{id:target.id,position:{x:0,y:.18,z:7}})).status,204);
    const attack=(swingId,facing=0)=>post(attacker.cookie,'/api/combat',{id:attacker.id,action:'punch',swingId,facing,pitch:0});
    const before=Date.now();
    for(let id=1;id<=8;id++)assert.equal((await attack(id)).status,200,'rapid clicks must not share a cooldown');
    const impacts=await waitFor(()=>{const all=attacker.events.filter(event=>event.type==='combat-punch');return all.length===8&&all;});
    assert.deepEqual(impacts.map(event=>event.swingId),[1,2,3,4,5,6,7,8]);
    for(const impact of impacts){assert.equal(impact.targetId,target.id);assert.equal(impact.damage,4);assert.equal(impact.impulse.y,3.2);assert.ok(impact.impulse.z>=4.8);}
    assert.equal(impacts.at(-1).health,68,'every accepted click deals damage');
    const start=attacker.events.find(event=>event.type==='combat-start');
    assert.equal(impacts[0].time,start.time,'hit resolves immediately, not after an animation timer');
    assert.ok(impacts[0].time-before<200);
    assert.equal((await attack(1)).status,200,'network retries are idempotent');
    assert.equal((await post(target.cookie,'/api/combat',{id:attacker.id,action:'punch',swingId:9})).status,401);
    assert.equal((await post(target.cookie,'/api/state',{id:target.id,position:{x:0,y:.45,z:8.2},jumping:true})).status,204,'legitimate knockback is accepted by movement protection');
    for(let id=9;id<=30;id++)assert.equal((await attack(id,Math.PI)).status,200,'swings facing away miss without blocking the next click');
    await waitFor(()=>attacker.events.filter(event=>event.type==='combat-punch').length===30);
    assert.equal(attacker.events.filter(event=>event.type==='combat-punch').at(-1).targetId,null);
    assert.equal((await attack(31)).status,429,'protect the server against automated request floods');
    await delay(1050);
    const mark=attacker.events.length;
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'snowball',facing:Math.PI/2,pitch:-.4})).status,200);
    const release=await waitFor(()=>attacker.events.slice(mark).find(event=>event.type==='combat-throw'));
    assert.ok(release.projectile.velocity.x>13);assert.ok(release.projectile.velocity.y>0);
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'snowball',facing:0,pitch:0})).status,429,'snowball retains its separate cooldown');
    assert.equal((await attack(32,Math.PI)).status,200,'a snowball cooldown does not block punching');
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'tomato'})).status,400);
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-combat-test-'));
    await rm(fixture,{recursive:true,force:true});
  }
});
