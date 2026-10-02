import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('Glock follows crosshair and fires from current moving position', {timeout:15000}, async()=>{
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
    await post(attacker.cookie,'/api/state',{id:attacker.id,position:{x:0,y:0,z:0}});
    await post(target.cookie,'/api/state',{id:target.id,position:{x:20,y:0,z:20}});
    const movingOrigin={x:1.4,y:1.5,z:1};
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'glock',facing:Math.PI,cameraYaw:-Math.PI/2,pitch:0,firstPerson:false,aiming:true,shotPosition:{x:1,y:0,z:1},launchOrigin:movingOrigin,aimPoint:{x:51.4,y:1.5,z:1}})).status,204);
    const shot=await waitFor(()=>attacker.events.find(event=>event.type==='glock-shot'));
    assert.deepEqual(shot.start,movingOrigin,'muzzle must use current shot position, not previous state');
    assert.ok(shot.end.x>60,'third-person shot follows crosshair rather than backward body facing');
    assert.ok(Math.abs(shot.end.z-1)<4);
    await delay(170);
    assert.equal((await post(attacker.cookie,'/api/combat',{id:attacker.id,action:'glock',facing:0,cameraYaw:0,pitch:0,firstPerson:true,shotPosition:{x:1,y:0,z:1},launchOrigin:movingOrigin,aimPoint:{x:1.4,y:40,z:40}})).status,204);
    const upward=await waitFor(()=>attacker.events.filter(event=>event.type==='glock-shot')[1]);
    assert.ok(upward.end.y>40,'crosshair elevation steers first-person shot');
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-combat-test-'));
    await rm(fixture,{recursive:true,force:true});
  }
});
