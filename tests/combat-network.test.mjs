import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('multiplayer attacks resolve once at release, obey cooldown and use the aim', {timeout:15000}, async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-combat-test-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  await copyFile(new URL('../server.mjs',import.meta.url),join(fixture,'server.mjs'));
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
    await post(attacker.cookie,'/api/state',{id:attacker.id,position:{x:0,y:0,z:0}});
    await post(target.cookie,'/api/state',{id:target.id,position:{x:0,y:0,z:1.2}});
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'punch',yaw:0,pitch:0})).status,200);
    const start=await waitFor(()=>attacker.events.find(event=>event.type==='combat-start'));
    assert.equal(start.facing,0);assert.equal(attacker.events.some(event=>event.type==='combat-punch'),false);
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'punch',yaw:0,pitch:0})).status,429);
    const impact=await waitFor(()=>attacker.events.find(event=>event.type==='combat-punch'));
    assert.equal(impact.targetId,target.id);assert.ok(impact.time-start.time>=200);
    await delay(850);
    await post(target.cookie,'/api/state',{id:target.id,position:{x:0,y:0,z:-2}});
    const mark=attacker.events.length;
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'snowball',yaw:0,pitch:0})).status,200);
    const throwStart=await waitFor(()=>attacker.events.slice(mark).find(event=>event.type==='combat-start'));
    assert.equal(attacker.events.slice(mark).some(event=>event.type==='combat-throw'),false);
    const release=await waitFor(()=>attacker.events.slice(mark).find(event=>event.type==='combat-throw'));
    assert.ok(release.projectile.time-throwStart.time>=300);assert.ok(release.projectile.velocity.z>13);
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'tomato'})).status,400);
    assert.equal(attacker.events.filter(event=>event.type==='combat-punch').length,1);
    assert.equal(attacker.events.filter(event=>event.type==='combat-throw').length,1);
    await delay(850);
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'snowball',yaw:0,pitch:0})).status,200);
    assert.equal((await post(attacker.cookie,'/api/emote',{id:attacker.id,emote:'wave'})).status,204);
    await delay(400);
    assert.equal(attacker.events.filter(event=>event.type==='combat-throw').length,1,'an interrupted throw must not launch an invisible ball');
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-combat-test-'));
    await rm(fixture,{recursive:true,force:true});
  }
});
